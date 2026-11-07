// Yhteiset apurit: seed.mjs ja kaappaa.mjs. Vain paikallinen palvelin.
//
// Asetukset luetaan repon juuren .dev.vars-tiedostosta (gitignoressa):
// CAPTURE_TOKEN, COOKIE_ENCRYPTION_KEY ja ALLOWED_GITHUB_LOGIN.

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const KANSIO = path.dirname(fileURLToPath(import.meta.url));
export const JUURI = path.resolve(KANSIO, "../..");

/** Palvelimen osoite. Muu kuin localhost hylätään: tuotantoon ei kosketa. */
export const OSOITE = (process.env.LUKUPINO_URL ?? "http://localhost:8788").replace(/\/+$/, "");
{
	const u = new URL(OSOITE);
	if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) {
		throw new Error(`Vain paikallinen palvelin kelpaa (localhost), ei ${u.hostname}`);
	}
}

export function devVars() {
	let raw;
	try {
		raw = readFileSync(path.join(JUURI, ".dev.vars"), "utf8");
	} catch {
		throw new Error("Repon juuresta puuttuu .dev.vars — ks. scripts/kuvakaappaukset/README.md");
	}
	const v = {};
	for (const line of raw.split("\n")) {
		const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
		if (m) v[m[1]] = m[2].replace(/^["']|["']$/g, "");
	}
	for (const k of ["CAPTURE_TOKEN", "COOKIE_ENCRYPTION_KEY", "ALLOWED_GITHUB_LOGIN"]) {
		if (!v[k] || v[k].startsWith("<")) throw new Error(`.dev.vars: ${k} puuttuu tai on täyttämättä`);
	}
	if (v.ALLOWED_GITHUB_LOGIN.includes(".")) throw new Error(".dev.vars: ALLOWED_GITHUB_LOGIN ei saa sisältää pistettä (eväste jaetaan pisteistä)");
	return v;
}

/**
 * Selaus-UI:n istuntoeväste kuten src/session.ts sen tekee:
 * lp_session=<login>.<exp>.<base64url(HMAC-SHA256(avain, "<login>.<exp>"))>
 */
export function istuntoEvaste(vars, ttlS = 3 * 3600) {
	const exp = Math.floor(Date.now() / 1000) + ttlS;
	const payload = `${vars.ALLOWED_GITHUB_LOGIN}.${exp}`;
	const sig = createHmac("sha256", vars.COOKIE_ENCRYPTION_KEY).update(payload).digest("base64url");
	return { name: "lp_session", value: `${payload}.${sig}` };
}

/** JSON-pyyntö paikalliselle palvelimelle: bearer (/api/*) tai eväste (/ui/*). */
export async function pyynto(vars, polku, { method = "GET", body, evaste } = {}) {
	const headers = { "User-Agent": "lukupino-agent/1.0", Accept: "application/json" };
	if (evaste) headers.Cookie = `${evaste.name}=${evaste.value}`;
	else headers.Authorization = `Bearer ${vars.CAPTURE_TOKEN}`;
	if (body !== undefined) headers["Content-Type"] = "application/json";
	const r = await fetch(OSOITE + polku, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
	const text = await r.text();
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		data = text;
	}
	if (!r.ok) throw new Error(`${method} ${polku} → ${r.status}: ${typeof data === "string" ? data.slice(0, 300) : JSON.stringify(data)}`);
	return data;
}

export async function tarkistaPalvelin() {
	try {
		const r = await fetch(OSOITE + "/healthz");
		if (r.ok) return;
	} catch {
		/* alla virhe */
	}
	throw new Error(`Palvelin ei vastaa osoitteessa ${OSOITE}. Käynnistä: npx wrangler dev --local --port 8788`);
}

export function lueDemo() {
	return JSON.parse(readFileSync(path.join(KANSIO, "demo.json"), "utf8"));
}

// --- Ajat Helsingin aikaa ---

const TZ = "Europe/Helsinki";

function osat(d) {
	const p = Object.fromEntries(
		new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })
			.formatToParts(d)
			.map((x) => [x.type, x.value]),
	);
	return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, wd: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday) };
}

/** Helsingin paikallisaika → Date. */
export function helsinki(y, m, d, h = 0, min = 0) {
	const arvaus = Date.UTC(y, m - 1, d, h, min);
	const o = osat(new Date(arvaus));
	const ero = Date.UTC(o.y, o.m - 1, o.d, o.h, o.min) - arvaus;
	return new Date(arvaus - ero);
}

/** Viimeisimmän päättyneen viikon maanantai (YYYY-MM-DD, Helsingin aikaa). Demon "viikko 0". */
export function kohdeviikko(nyt = new Date()) {
	const o = osat(nyt);
	const t = Date.UTC(o.y, o.m - 1, o.d) - (o.wd + 7) * 864e5;
	return new Date(t).toISOString().slice(0, 10);
}

/** ISO-viikkonumero päivälle YYYY-MM-DD. */
export function isoViikko(pvm) {
	const d = new Date(pvm + "T00:00:00Z");
	d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
	const vuodenAlku = Date.UTC(d.getUTCFullYear(), 0, 1);
	return Math.ceil(((d.getTime() - vuodenAlku) / 864e5 + 1) / 7);
}

/**
 * Demon aikamerkintä → ISO-aikaleima.
 * {viikko, pv, klo}: viikko 0 = kohdeviikko, -1 edellinen, 1 kuluva; pv 0 = maanantai.
 * {tunteja_sitten}: suhteessa nykyhetkeen.
 * Tulevaisuuteen osuva aika siirretään puolentoista tunnin päähän menneisyyteen.
 */
export function aika(merkinta, nyt = new Date()) {
	if (merkinta.tunteja_sitten != null) return new Date(nyt.getTime() - merkinta.tunteja_sitten * 3600e3).toISOString();
	const [y, m, d] = kohdeviikko(nyt).split("-").map(Number);
	const paiva = new Date(Date.UTC(y, m - 1, d) + ((merkinta.viikko ?? 0) * 7 + (merkinta.pv ?? 0)) * 864e5);
	const [h, min] = String(merkinta.klo ?? "12:00").split(":").map(Number);
	let t = helsinki(paiva.getUTCFullYear(), paiva.getUTCMonth() + 1, paiva.getUTCDate(), h, min);
	if (t.getTime() > nyt.getTime() - 30 * 60e3) t = new Date(nyt.getTime() - 90 * 60e3);
	return t.toISOString();
}

export function lisaaMinuutteja(iso, min) {
	return new Date(Date.parse(iso) + min * 60e3).toISOString();
}
