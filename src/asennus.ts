// Asennuksen itsetarkistus: /asennus (ihmiselle) ja /asennus.json (agentille).
//
// Miksi: asennuksessa on kymmenkunta kohtaa, joissa yksi kirjoitusvirhe kaataa
// kaiken hiljaa (callback-osoite, salaisuuden nimi, migraatio). Tämä sivu
// kertoo tämän asennuksen omat tarkat osoitteet ja sen, mikä puuttuu, jotta
// niitä ei tarvitse kirjoittaa käsin.
//
// Mitä näytetään kenellekin:
// - Kirjautumatta: vain se, mitä tarvitaan kirjautumisen saamiseksi toimimaan
//   (pakollisten asetusten olemassaolo kyllä/ei ja callback-osoitteet). Ei
//   arvoja, ei valinnaisia asetuksia, ei kannan tietoja.
// - Kirjautuneena tai CAPTURE_TOKENilla: kaikki tarkistukset, ja selainsivulla
//   CAPTURE_TOKEN ja MCP_TOKEN kopioitavaksi (sumennettuina, Näytä-napin takana).
//   JSON ei koskaan sisällä arvoja.

import { Hono, type Context } from "hono";
import { ICON_LINKS } from "./icon";
import { readSession } from "./session";
import { storageBackend } from "./files";

export const asennus = new Hono<{ Bindings: Env }>();

/** Migraatiot, jotka tämä koodi odottaa. Päivitä, kun lisäät tiedoston migrations/-kansioon (AGENTS.md). */
export const MIGRAATIOT = [
	"0001_init.sql",
	"0002_rating.sql",
	"0003_image.sql",
	"0004_files.sql",
	"0005_recall.sql",
	"0006_multifile.sql",
	"0007_media.sql",
	"0008_quotes.sql",
	"0009_transcripts.sql",
	"0010_media_progress.sql",
	"0011_media_kirjapalvelut.sql",
	"0012_research.sql",
	"0013_pistokoe.sql",
	"0014_pistokoe_alueet.sql",
];

type Avain = keyof Env & string;
const PAKOLLISET: Array<{ nimi: Avain; mihin: string }> = [
	{ nimi: "GITHUB_CLIENT_ID", mihin: "GitHub OAuth Appin Client ID: kirjautuminen" },
	{ nimi: "GITHUB_CLIENT_SECRET", mihin: "GitHub OAuth Appin Client secret: kirjautuminen" },
	{ nimi: "ALLOWED_GITHUB_LOGIN", mihin: "Ainoa GitHub-tunnus, joka pääsee sisään" },
	{ nimi: "COOKIE_ENCRYPTION_KEY", mihin: "Istuntoevästeiden allekirjoitus" },
	{ nimi: "CAPTURE_TOKEN", mihin: "iPhone-pikakomento ja rutiinit (/api/*)" },
	{ nimi: "MCP_TOKEN", mihin: "Claude Code (/mcp)" },
];
const VALINNAISET: Array<{ nimi: Avain[]; mihin: string }> = [
	{ nimi: ["YOUTUBE_API_KEY"], mihin: "YouTube-videoiden kuvaukset" },
	{ nimi: ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"], mihin: "Spotify-varareitti (harvoin tarpeen)" },
	{ nimi: ["PURKU_ROUTINE", "PURKU_TOKEN"], mihin: "Käynnistä nyt -nappi (routines/README.md)" },
];
/** Tokenien ja avainten vähimmäispituus, jonka alittamisesta varoitetaan. `openssl rand -hex 32` = 64 merkkiä. */
const MIN_PITUUS = 32;

function asetettu(env: Env, nimi: Avain): boolean {
	const v = (env as unknown as Record<string, unknown>)[nimi];
	return typeof v === "string" ? v.trim().length > 0 : Boolean(v);
}

function tasaVertailu(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let r = 0;
	for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return r === 0;
}

async function oikeudet(c: Context<{ Bindings: Env }>): Promise<"istunto" | "token" | null> {
	if (c.env.COOKIE_ENCRYPTION_KEY && (await readSession(c.req.raw, c.env.COOKIE_ENCRYPTION_KEY))) return "istunto";
	const m = /^Bearer\s+(.+)$/i.exec(c.req.header("authorization") ?? "");
	if (m && c.env.CAPTURE_TOKEN && tasaVertailu(m[1].trim(), c.env.CAPTURE_TOKEN)) return "token";
	return null;
}

async function tila(env: Env, origin: string, laaja: boolean) {
	const puuttuu = PAKOLLISET.filter((p) => !asetettu(env, p.nimi)).map((p) => p.nimi);
	const julkinen = {
		valmisKirjautumiseen: puuttuu.length === 0,
		pakolliset: Object.fromEntries(PAKOLLISET.map((p) => [p.nimi, asetettu(env, p.nimi)])),
		puuttuu,
		osoitteet: {
			kotisivu: origin,
			githubCallbackMcp: `${origin}/callback`,
			githubCallbackUi: `${origin}/callback/ui`,
			mcp: `${origin}/mcp`,
		},
		lisaa: "Kirjaudu tai lähetä Authorization: Bearer <CAPTURE_TOKEN> nähdäksesi kannan, tiedostojen ja valinnaisten asetusten tilan.",
	};
	if (!laaja) return julkinen;

	let ajetut: string[] = [];
	let kantaVirhe: string | null = null;
	try {
		const r = await env.DB.prepare("SELECT name FROM d1_migrations ORDER BY id").all<{ name: string }>();
		ajetut = (r.results ?? []).map((x) => x.name);
	} catch (e) {
		kantaVirhe = e instanceof Error ? e.message : String(e);
	}
	const puuttuvatMigraatiot = MIGRAATIOT.filter((m) => !ajetut.includes(m));
	let tallennuksia: number | null = null;
	if (!puuttuvatMigraatiot.length) {
		try {
			tallennuksia = (await env.DB.prepare("SELECT COUNT(*) AS n FROM bookmarks").first<{ n: number }>())?.n ?? 0;
		} catch {
			tallennuksia = null;
		}
	}
	const lyhyet = (["CAPTURE_TOKEN", "MCP_TOKEN", "COOKIE_ENCRYPTION_KEY"] as Avain[]).filter((n) => {
		const v = (env as unknown as Record<string, unknown>)[n];
		return typeof v === "string" && v.length > 0 && v.length < MIN_PITUUS;
	});
	return {
		...julkinen,
		lisaa: undefined,
		kanta: {
			migraatiotAjettu: ajetut.length,
			migraatiotOdotettu: MIGRAATIOT.length,
			puuttuvatMigraatiot,
			virhe: kantaVirhe,
			tallennuksia,
		},
		tiedostot: storageBackend(env),
		valinnaiset: Object.fromEntries(VALINNAISET.map((v) => [v.nimi.join("+"), v.nimi.every((n) => asetettu(env, n))])),
		varoitukset: lyhyet.map((n) => `${n} on alle ${MIN_PITUUS} merkkiä. Luo uusi: openssl rand -hex 32`),
		rutiininMuuttujat: { LUKUPINO_URL: origin, LUKUPINO_CAPTURE_TOKEN: "<CAPTURE_TOKEN>" },
	};
}

asennus.get("/asennus.json", async (c) => {
	const origin = new URL(c.req.url).origin;
	const laaja = (await oikeudet(c)) !== null;
	c.header("Cache-Control", "no-store");
	return c.json(await tila(c.env, origin, laaja));
});

asennus.get("/asennus", async (c) => {
	const origin = new URL(c.req.url).origin;
	const kuka = await oikeudet(c);
	const t = await tila(c.env, origin, kuka !== null);
	c.header("Cache-Control", "no-store");
	c.header("Referrer-Policy", "no-referrer");
	const istunto = kuka === "istunto";
	return c.html(sivu(t as Tila, origin, istunto ? c.env.CAPTURE_TOKEN : null, istunto ? c.env.MCP_TOKEN : null));
});

type Tila = Awaited<ReturnType<typeof tila>> & {
	kanta?: { migraatiotAjettu: number; migraatiotOdotettu: number; puuttuvatMigraatiot: string[]; virhe: string | null; tallennuksia: number | null };
	tiedostot?: "r2" | "kv";
	valinnaiset?: Record<string, boolean>;
	varoitukset?: string[];
};

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
const ok = (b: boolean) => (b ? `<span class="m ok">✓</span>` : `<span class="m no">✗</span>`);
const kopio = (arvo: string, nakyva = true) =>
	`<div class="cp"><code${nakyva ? "" : ' class="piilo"'}>${esc(arvo)}</code><button type="button" data-k="${esc(arvo)}">Kopioi</button></div>`;

function sivu(t: Tila, origin: string, token: string | null, mcpToken: string | null): string {
	const kaikkiOk = t.valmisKirjautumiseen && (!t.kanta || t.kanta.puuttuvatMigraatiot.length === 0);
	const pakolliset = PAKOLLISET.map(
		(p) => `<li>${ok(t.pakolliset[p.nimi])}<div><b>${p.nimi}</b><span>${esc(p.mihin)}</span>${t.pakolliset[p.nimi] ? "" : `<code class="cmd">npx wrangler secret put ${p.nimi}</code>`}</div></li>`,
	).join("");

	const kirjautunut = t.kanta !== undefined;
	const laaja = !kirjautunut
		? `<section><h2>Loput tarkistukset</h2><p>Kanta, tiedostot ja valinnaiset asetukset näkyvät kirjautuneena.</p>${
				t.valmisKirjautumiseen ? `<a class="btn" href="/login">Kirjaudu GitHubilla</a>` : `<p class="mut">Kirjautuminen toimii, kun pakolliset asetukset ovat paikallaan.</p>`
			}</section>`
		: `
<section><h2>Tietokanta</h2><ul>
<li>${ok(t.kanta!.puuttuvatMigraatiot.length === 0)}<div><b>Migraatiot ${t.kanta!.migraatiotAjettu}/${t.kanta!.migraatiotOdotettu}</b>${
				t.kanta!.puuttuvatMigraatiot.length
					? `<span>Puuttuu: ${t.kanta!.puuttuvatMigraatiot.map(esc).join(", ")}</span><code class="cmd">npx wrangler d1 migrations apply DB --remote</code>`
					: `<span>Kaikki ajettu${t.kanta!.tallennuksia !== null ? ` · ${t.kanta!.tallennuksia} tallennusta` : ""}</span>`
			}${t.kanta!.virhe ? `<span class="mut">${esc(t.kanta!.virhe)}</span>` : ""}</div></li>
<li>${ok(true)}<div><b>Tiedostot: ${t.tiedostot === "r2" ? "R2" : "KV"}</b><span>${
				t.tiedostot === "r2" ? "R2-ämpäri käytössä (10 Gt ilmaiseksi)." : "KV-varapolku (1 Gt). R2 on valinnainen, ks. INSTALL.md."
			}</span></div></li>
</ul></section>
<section><h2>Valinnaiset</h2><ul>${VALINNAISET.map(
				(v) => `<li>${t.valinnaiset![v.nimi.join("+")] ? `<span class="m ok">✓</span>` : `<span class="m off">–</span>`}<div><b>${v.nimi.join(" + ")}</b><span>${esc(v.mihin)}</span></div></li>`,
			).join("")}</ul>${t.varoitukset!.length ? `<p class="warn">${t.varoitukset!.map(esc).join("<br>")}</p>` : ""}</section>
<section><h2>iPhone-pikakomento</h2>
<p>Pikakomento kysyy tuodessa kaksi asiaa. Kopioi ne tästä.</p>
<h3>Osoite</h3>${kopio(origin)}
${token ? `<h3>Token (CAPTURE_TOKEN)</h3>${kopio(token, false)}<p class="mut">Token antaa pääsyn koko lukupinoosi. Älä jaa pikakomentoa eteenpäin tokenin kanssa.</p>` : ""}
<p class="mut">Rakennusohje ja vianetsintä: docs/IPHONE.md.</p></section>
<section><h2>Claude</h2>
<h3>claude.ai ja Claude-sovellus: mukautettu liitin</h3>${kopio(`${origin}/mcp`)}
<p class="mut">Asetukset → Liittimet → Lisää mukautettu liitin → liitä osoite → kirjaudu GitHubilla.</p>
<h3>Claude Code: komento (token)</h3>${kopio(`claude mcp add --transport http lukupino ${origin}/mcp --header "Authorization: Bearer $LUKUPINO_MCP_TOKEN"`)}
<p class="mut">Ilman tokenia: jätä --header pois ja aja Claude Codessa /mcp → lukupino → Authenticate. Ohje: docs/MCP.md.</p>
<h3>Claude Code: .mcp.json</h3>${kopio(`{"mcpServers":{"lukupino":{"type":"http","url":"${origin}/mcp","headers":{"Authorization":"Bearer \${LUKUPINO_MCP_TOKEN}"}}}}`)}
${mcpToken ? `<h3>LUKUPINO_MCP_TOKEN (Workerin MCP_TOKEN)</h3>${kopio(mcpToken, false)}<p class="mut">Aseta ympäristömuuttujaksi koneelle, jolla Claude Code ajaa.</p>` : ""}
<h3>Rutiinien ympäristömuuttujat</h3>${kopio(`LUKUPINO_URL=${origin}`)}${token ? kopio(`LUKUPINO_CAPTURE_TOKEN=${token}`, false) : ""}
<p class="mut">Ohje: routines/README.md.</p></section>`;

	return `<!doctype html><html lang="fi"><head><meta charset="utf-8">${ICON_LINKS}<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light dark"><meta name="robots" content="noindex"><title>Asennus · Lukupino</title>
<style>
:root{--bg:#faf9f6;--fg:#1a1a1a;--mut:#6b6b6b;--line:#e6e2da;--soft:#f1eee7;--card:#fff;--ok:#047857;--no:#b91c1c;--warn:#92400e;--acc:#0b5fff}
@media(prefers-color-scheme:dark){:root{--bg:#111;--fg:#ececec;--mut:#9a9a9a;--line:#2a2a2a;--soft:#1e1e1e;--card:#181818;--ok:#34d399;--no:#f87171;--warn:#fbbf24;--acc:#6ea0ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 -apple-system,system-ui,'Segoe UI',sans-serif}
main{max-width:720px;margin:0 auto;padding:max(16px,env(safe-area-inset-top)) 16px 48px}
header{display:flex;align-items:center;gap:12px;margin:8px 0 4px}header img{width:44px;height:44px;border-radius:10px}
h1{font-size:24px;margin:0}h2{font-size:18px;margin:0 0 10px}h3{font-size:14px;margin:14px 0 6px;color:var(--mut);font-weight:600}
.badge{display:inline-block;margin:8px 0 18px;padding:6px 12px;border-radius:999px;font-weight:600;font-size:14px}
.badge.ok{background:color-mix(in srgb,var(--ok) 14%,transparent);color:var(--ok)}.badge.no{background:color-mix(in srgb,var(--no) 12%,transparent);color:var(--no)}
section{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin:0 0 14px}
ul{list-style:none;margin:0;padding:0}li{display:flex;gap:10px;padding:8px 0;border-top:1px solid var(--line)}li:first-child{border-top:0}
li div{display:flex;flex-direction:column;min-width:0}li b{font-size:14px;word-break:break-all}li span{font-size:14px;color:var(--mut)}
.m{flex:0 0 22px;height:22px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700}
.m.ok{background:color-mix(in srgb,var(--ok) 16%,transparent);color:var(--ok)}.m.no{background:color-mix(in srgb,var(--no) 14%,transparent);color:var(--no)}.m.off{background:var(--soft);color:var(--mut)}
code{font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}
.cmd{display:block;margin-top:6px;background:var(--soft);padding:6px 8px;border-radius:8px}
.cp{display:flex;gap:8px;align-items:stretch;margin:4px 0}.cp code{flex:1;background:var(--soft);padding:8px 10px;border-radius:8px;min-width:0}
.cp code.piilo{filter:blur(5px)}.cp code.piilo.auki{filter:none}
button,.btn{font:600 14px system-ui,sans-serif;border:1px solid var(--line);background:var(--bg);color:var(--fg);border-radius:8px;padding:8px 12px;min-height:40px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}
.btn{background:var(--acc);color:#fff;border-color:transparent}
p{margin:6px 0}.mut{color:var(--mut);font-size:14px}.warn{color:var(--warn);font-size:14px}
footer{color:var(--mut);font-size:13px;text-align:center}
</style></head><body><main>
<header><img src="/apple-touch-icon.png" alt=""><div><h1>Asennus</h1><span class="mut">${esc(origin)}</span></div></header>
<span class="badge ${kaikkiOk ? "ok" : "no"}">${kaikkiOk ? (kirjautunut ? "Kaikki pakollinen kunnossa" : "Kirjautuminen valmis") : "Asennus kesken"}</span>
<section><h2>Pakolliset asetukset</h2><ul>${pakolliset}</ul></section>
<section><h2>GitHub OAuth App</h2>
<p>Lisää nämä kaksi osoitetta OAuth Appin <b>Redirect URI</b> -kenttiin täsmälleen tällaisina (github.com/settings/developers).</p>
${kopio(`${origin}/callback`)}${kopio(`${origin}/callback/ui`)}
<h3>Homepage URL</h3>${kopio(origin)}</section>
${laaja}
<section><h2>Satunnainen arvo salaisuudeksi</h2><p class="mut">Luodaan tässä selaimessa, ei lähetetä minnekään.</p>
<div class="cp"><code id="rnd">—</code><button type="button" id="uusi">Luo</button></div></section>
<footer>Koneluettava: <code>${esc(origin)}/asennus.json</code></footer>
</main><script>
document.addEventListener('click',async e=>{const b=e.target.closest('button[data-k]');if(b){const c=b.previousElementSibling;if(c.classList.contains('piilo')&&!c.classList.contains('auki')){c.classList.add('auki');b.textContent='Kopioi';return}try{await navigator.clipboard.writeText(b.dataset.k);b.textContent='Kopioitu ✓'}catch{b.textContent='Valitse ja kopioi'}setTimeout(()=>b.textContent='Kopioi',2000)}});
document.querySelectorAll('code.piilo').forEach(c=>c.nextElementSibling.textContent='Näytä');
document.getElementById('uusi').onclick=()=>{const a=new Uint8Array(32);crypto.getRandomValues(a);const h=[...a].map(x=>x.toString(16).padStart(2,'0')).join('');const r=document.getElementById('rnd');r.textContent=h;const b=document.getElementById('uusi');b.textContent='Uusi';let k=r.nextElementSibling;if(!k.dataset.k){const n=document.createElement('button');n.type='button';n.textContent='Kopioi';r.after(n);k=n}k.dataset.k=h};
</script></body></html>`;
}
