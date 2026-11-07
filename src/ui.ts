// Selaus-UI puhelimeen ja selaimeen. Yksi HTML-sivu, ei riippuvuuksia.
// Kirjautuminen GitHubilla (sama OAuth App kuin MCP:llä), vain ALLOWED_GITHUB_LOGIN.

import { KYSY_JS } from "./kysy";
import { lisaa, tanaan, viikkoPage, viikko, viikonAlku } from "./viikko";
import { ICON_LINKS } from "./icon";
import { getFile } from "./files";
import { Hono, type Context } from "hono";
import { Octokit } from "octokit";
import { Db, MAX_EXCERPT, parseMedia, parseProgress, parseRating, parseSavedDate } from "./db";
import { deleteBookmark, enrichInBackground, receiveUpload, siivoaOsoite } from "./api";
import { clearSessionCookie, makeSessionCookie, readSession } from "./session";
import { addQuote, deleteQuote, listQuotes, quoteCounts, quoteOfTheDay, setStar } from "./quotes";
import { fetchUpstreamAuthToken, getUpstreamAuthorizeUrl } from "./utils";
import { getTranscript } from "./transcripts";
import { transcriptPage } from "./litteraatti";
import { readerPage } from "./lukija";
import { bookPage } from "./kirja";
import { researchPage, researchSharePage } from "./tutkimus";
import { getResearch, renderMarkdown, requestResearch, stripPersonal } from "./research";
import { answerItem, listQuizzes, quizForUi, quizPage } from "./pistokoe";

export const ui = new Hono<{ Bindings: Env }>();

const STATE_COOKIE = "lp_login_state";

function randomState(): string {
	const b = new Uint8Array(16);
	crypto.getRandomValues(b);
	return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** GET /login → GitHub */
ui.get("/login", (c) => {
	const state = randomState();
	const url = getUpstreamAuthorizeUrl({
		upstream_url: "https://github.com/login/oauth/authorize",
		client_id: c.env.GITHUB_CLIENT_ID,
		scope: "read:user",
		redirect_uri: new URL("/callback/ui", c.req.url).href,
		state,
	});
	return new Response(null, {
		status: 302,
		headers: { Location: url, "Set-Cookie": `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600` },
	});
});

/** GET /callback/ui ← GitHub. Alipolku rekisteröidystä /callback-osoitteesta, jonka GitHub sallii. */
ui.get("/callback/ui", async (c) => {
	const cookieState = /(?:^|;\s*)lp_login_state=([^;]+)/.exec(c.req.header("cookie") ?? "")?.[1];
	if (!cookieState || cookieState !== c.req.query("state")) return c.text("Virheellinen state", 400);
	const [token, err] = await fetchUpstreamAuthToken({
		client_id: c.env.GITHUB_CLIENT_ID,
		client_secret: c.env.GITHUB_CLIENT_SECRET,
		code: c.req.query("code"),
		redirect_uri: new URL("/callback/ui", c.req.url).href,
		upstream_url: "https://github.com/login/oauth/access_token",
	});
	if (err) return err;
	const user = await new Octokit({ auth: token }).rest.users.getAuthenticated();
	const login = user.data.login;
	if (login !== c.env.ALLOWED_GITHUB_LOGIN) return c.text(`Ei pääsyä: ${login}`, 403);
	const headers = new Headers({ Location: "/" });
	headers.append("Set-Cookie", await makeSessionCookie(c.env.COOKIE_ENCRYPTION_KEY, login));
	headers.append("Set-Cookie", `${STATE_COOKIE}=; Path=/; Max-Age=0`);
	return new Response(null, { status: 302, headers });
});

ui.get("/logout", (c) => new Response(null, { status: 302, headers: { Location: "/", "Set-Cookie": clearSessionCookie() } }));

/** Istuntoportti UI:lle ja sen JSON-reiteille. */
ui.use("/", async (c, next) => {
	const login = await readSession(c.req.raw, c.env.COOKIE_ENCRYPTION_KEY);
	if (!login) return c.html(LOGIN_PAGE);
	await next();
});
ui.use("/ui/*", async (c, next) => {
	const login = await readSession(c.req.raw, c.env.COOKIE_ENCRYPTION_KEY);
	if (!login) return c.json({ error: "unauthorized" }, 401);
	await next();
});

ui.get("/", (c) => c.html(APP_PAGE));

// Poiminnat: lainauskokoelma ja "mitä jäi mieleen". Ks. quotes.ts.
ui.use("/poiminnat", async (c, next) => {
	const login = await readSession(c.req.raw, c.env.COOKIE_ENCRYPTION_KEY);
	if (!login) return c.html(LOGIN_PAGE);
	await next();
});
ui.get("/poiminnat", (c) => c.html(QUOTES_PAGE));
ui.get("/ui/quotes", async (c) => {
	const f = c.req.query("filter");
	const filter = f === "tahti" || f === "omat" ? f : "kaikki";
	const q = c.req.query("q") ?? "";
	const offset = Number(c.req.query("offset") ?? 0) || 0;
	const quotes = await listQuotes(c.env.DB, { filter, q, offset, limit: 60 });
	// "Mitä jäi mieleen" -välilehdellä myös korttien Omin sanoin -tekstit.
	let recall: unknown[] = [];
	if (filter === "omat" && offset === 0) {
		const like = q.trim() ? `%${q.trim()}%` : null;
		const r = await c.env.DB.prepare(
			`SELECT id, title, url, recall, updated_at FROM bookmarks WHERE recall IS NOT NULL AND trim(recall) <> ''${like ? " AND (recall LIKE ? OR title LIKE ?)" : ""} ORDER BY updated_at DESC LIMIT 100`,
		)
			.bind(...(like ? [like, like] : []))
			.all();
		recall = r.results;
	}
	const day = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
	return c.json({
		quotes,
		recall,
		counts: await quoteCounts(c.env.DB),
		daily: offset === 0 && !q ? await quoteOfTheDay(c.env.DB, day) : null,
		more: quotes.length === 60,
	});
});
ui.post("/ui/quotes", async (c) => {
	const b = (await c.req.json()) as { text?: string; bookmarkId?: string; who?: string; at?: string; kind?: string };
	if (!b.text?.trim()) return c.json({ error: "Tyhjä poiminta" }, 400);
	// Litteraatista korostettu lause on lähteen sanoja, ei omia — mutta
	// omistajan valitsema, joten noten uudelleenkirjoitus ei saa poistaa sitä.
	const kind = b.kind === "korostus" ? "korostus" : "oma";
	return c.json({ quote: await addQuote(c.env.DB, { text: b.text, bookmark_id: b.bookmarkId, who: b.who, at: b.at, kind }) }, 201);
});

// Koko litteraatin lukunäkymä. Ks. litteraatti.ts ja transcripts.ts.
ui.use("/litteraatti/*", async (c, next) => {
	const login = await readSession(c.req.raw, c.env.COOKIE_ENCRYPTION_KEY);
	if (!login) return c.html(LOGIN_PAGE);
	await next();
});
ui.get("/litteraatti/:id", (c) => c.html(TRANSCRIPT_PAGE));
// Jutun lähdeteksti luettavana ja korostettavana. Ks. lukija.ts.
ui.use("/lue/*", async (c, next) => {
	const login = await readSession(c.req.raw, c.env.COOKIE_ENCRYPTION_KEY);
	if (!login) return c.html(LOGIN_PAGE);
	await next();
});
ui.get("/lue/:id", (c) => c.html(READER_PAGE));
// Kirjamuistio: laajempi täyttö kirjoille. Ks. kirja.ts.
ui.use("/kirja/*", async (c, next) => {
	const login = await readSession(c.req.raw, c.env.COOKIE_ENCRYPTION_KEY);
	if (!login) return c.html(LOGIN_PAGE);
	await next();
});
ui.get("/kirja/:id", (c) => c.html(BOOK_PAGE));
// Tutkimus: rutiinin sapluunalla kirjoittama selvitys. Ks. research.ts ja tutkimus.ts.
ui.use("/tutkimus/*", async (c, next) => {
	const login = await readSession(c.req.raw, c.env.COOKIE_ENCRYPTION_KEY);
	if (!login) return c.html(LOGIN_PAGE);
	await next();
});
ui.get("/tutkimus/:id/jaa", async (c) => {
	const id = c.req.param("id");
	const b = await new Db(c.env.DB).get(id);
	const r = b ? await getResearch(c.env.DB, id) : null;
	if (!b || !r?.text) return c.text("Tutkimusta ei ole", 404);
	// Jaettava versio: omistajan omat yhteydet pois (stripPersonal, research.ts).
	return c.html(researchSharePage({ id, title: b.title || b.url, url: b.url, created_at: r.created_at, html: renderMarkdown(stripPersonal(r.text)) }));
});
ui.get("/tutkimus/:id", (c) => c.html(RESEARCH_PAGE));
ui.get("/ui/research/:id", async (c) => {
	const id = c.req.param("id");
	const b = await new Db(c.env.DB).get(id);
	if (!b) return c.json({ error: "not found" }, 404);
	const r = await getResearch(c.env.DB, id);
	const q = await c.env.DB.prepare("SELECT id, text, kind FROM quotes WHERE bookmark_id = ?").bind(id).all();
	return c.json({
		bookmark: { id: b.id, title: b.title, url: b.url, rating: b.rating, media: b.media, research_status: b.research_status },
		html: r?.text ? renderMarkdown(r.text) : null,
		note: r?.note ?? null,
		created_at: r?.created_at ?? null,
		quotes: q.results,
	});
});
// Pistokoe: viikon väitteet ja palaute. Ks. pistokoe.ts.
for (const p of ["/pistokoe", "/pistokoe/*", "/viikko", "/viikko/*"]) {
	ui.use(p, async (c, next) => {
		const login = await readSession(c.req.raw, c.env.COOKIE_ENCRYPTION_KEY);
		if (!login) return c.html(LOGIN_PAGE);
		await next();
	});
}
// Viikko mediassa (22.10.2026), ks. viikko.ts. Seuraavaan viikkoon pääsee
// kuluvaan viikkoon asti.
const viikkoReitti = async (c: Context<{ Bindings: Env }, string>) => {
	const alku = viikonAlku(c.req.param("pvm"));
	const seuraava = lisaa(alku, 7);
	return c.html(viikkoPage(await viikko(c.env.DB, alku), lisaa(alku, -7), seuraava <= viikonAlku(tanaan()) ? seuraava : null));
};
ui.get("/viikko", viikkoReitti);
ui.get("/viikko/:pvm", viikkoReitti);
ui.get("/pistokoe", (c) => c.html(QUIZ_PAGE));
ui.get("/pistokoe/:id", (c) => c.html(QUIZ_PAGE));
ui.get("/ui/quiz", async (c) => c.json({ quizzes: await listQuizzes(c.env.DB, Number(c.req.query("limit") ?? 20) || 20) }));
ui.get("/ui/quiz/:id", async (c) => {
	const d = await quizForUi(c.env.DB, c.req.param("id"));
	return d ? c.json(d) : c.json({ error: "not found" }, 404);
});
ui.post("/ui/quiz/:id/answer", async (c) => {
	const { pos, answer, confident } = (await c.req.json()) as { pos?: number; answer?: number; confident?: number | null };
	const r = await answerItem(c.env.DB, c.req.param("id"), Number(pos), Number(answer), confident ?? null);
	return "error" in r ? c.json(r, r.error === "not found" ? 404 : 400) : c.json(r);
});
ui.post("/ui/bookmark/:id/research", async (c) => {
	const { request } = (await c.req.json()) as { request?: boolean };
	const st = await requestResearch(c.env.DB, c.req.param("id"), request !== false);
	return st === undefined ? c.json({ error: "not found" }, 404) : c.json({ id: c.req.param("id"), research_status: st });
});
// Purkusessio (22.10.2026): Käynnistä nyt -nappi ajaa päivittäisen
// rikastusrutiinin heti eikä vasta aamulla — tutkimukset (jono E) ja muut
// jonot. Rutiinin API-laukaisin: PURKU_ROUTINE (trig_…) ja salaisuus
// PURKU_TOKEN, joka luodaan claude.ai/code/routines → Edit → API. Viimeisin
// laukaisu muistetaan tunnin, jotta kaksoisnapautus ei käynnistä kahta.
const PURKU_KEY = "purku:viimeisin";
ui.get("/ui/purku", async (c) => c.json({
	kytketty: Boolean(c.env.PURKU_TOKEN && c.env.PURKU_ROUTINE),
	viimeisin: await c.env.OAUTH_KV.get(PURKU_KEY, "json"),
}));
ui.post("/ui/purku", async (c) => {
	if (!c.env.PURKU_TOKEN || !c.env.PURKU_ROUTINE) return c.json({ error: "Purkusessiota ei ole kytketty (PURKU_TOKEN puuttuu)" }, 503);
	const ed = (await c.env.OAUTH_KV.get(PURKU_KEY, "json")) as { at: string; url: string } | null;
	if (ed && Date.now() - Date.parse(ed.at) < 15 * 60_000) return c.json({ ...ed, jo: true });
	const r = await fetch(`https://api.anthropic.com/v1/claude_code/routines/${c.env.PURKU_ROUTINE}/fire`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${c.env.PURKU_TOKEN}`,
			"anthropic-beta": "experimental-cc-routine-2026-04-01",
			"anthropic-version": "2023-06-01",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ text: "Omistaja käynnisti purkusession lukupinon Käynnistä nyt -napista." }),
	});
	if (!r.ok) return c.json({ error: `Käynnistys epäonnistui (${r.status})` }, 502);
	const d = (await r.json()) as { claude_code_session_url?: string };
	const v = { at: new Date().toISOString(), url: d.claude_code_session_url ?? "" };
	await c.env.OAUTH_KV.put(PURKU_KEY, JSON.stringify(v), { expirationTtl: 3600 });
	return c.json(v);
});
ui.get("/ui/book/:id", async (c) => {
	const id = c.req.param("id");
	const b = await new Db(c.env.DB).get(id);
	if (!b) return c.json({ error: "not found" }, 404);
	const q = await c.env.DB.prepare("SELECT id, text, at FROM quotes WHERE bookmark_id = ? ORDER BY id").bind(id).all();
	return c.json({
		bookmark: { id: b.id, title: b.title, url: b.url, rating: b.rating, progress: b.progress, saved_at: b.saved_at, media: b.media },
		recall: b.recall,
		quotes: q.results,
	});
});
ui.get("/ui/reader/:id", async (c) => {
	const id = c.req.param("id");
	const b = await new Db(c.env.DB).get(id);
	if (!b || !b.excerpt?.trim()) return c.json({ error: "not found" }, 404);
	const q = await c.env.DB.prepare("SELECT id, text, kind FROM quotes WHERE bookmark_id = ?").bind(id).all();
	return c.json({
		bookmark: { id: b.id, title: b.title, url: b.url, summary: b.summary, rating: b.rating, media: b.media, progress: b.progress },
		text: b.excerpt,
		max: MAX_EXCERPT,
		quotes: q.results,
	});
});
ui.get("/ui/transcript/:id", async (c) => {
	const id = c.req.param("id");
	const b = await new Db(c.env.DB).get(id);
	const t = b ? await getTranscript(c.env.DB, id) : null;
	if (!b || !t || !t.text) return c.json({ error: "not found" }, 404);
	const q = await c.env.DB.prepare("SELECT id, text, kind FROM quotes WHERE bookmark_id = ?").bind(id).all();
	return c.json({
		bookmark: { id: b.id, title: b.title, url: b.url, note: b.note, rating: b.rating, media: b.media, progress: b.progress },
		text: t.text,
		words: t.words,
		source: t.source,
		quotes: q.results,
	});
});
ui.post("/ui/quotes/:id/star", async (c) => {
	const b = (await c.req.json()) as { starred?: boolean };
	return (await setStar(c.env.DB, c.req.param("id"), !!b.starred)) ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
});
ui.post("/ui/quotes/:id/delete", async (c) =>
	(await deleteQuote(c.env.DB, c.req.param("id"))) ? c.json({ ok: true }) : c.json({ error: "not found" }, 404),
);

/**
 * GET /ui/view/:key — tiedoston katselusivu, jossa on aina paluupalkki.
 *
 * Syy: kotivalikkoon lisätty lukupino ajetaan ilman selaimen palkkeja
 * (`apple-mobile-web-app-capable`). iOS avaa saman osoitteen linkin sen
 * sisällä `target="_blank"`-määreestä huolimatta, joten suoraan
 * `/file/…`-osoitteeseen avattu PDF jäi ruudulle ilman mitään tietä
 * takaisin. Todettu 24.9.2026 omistajan puhelimella. Tämä sivu ei nojaa
 * selaimen takaisin-nappiin lainkaan.
 */
ui.get("/ui/view/:key{.+}", async (c) => {
	const key = c.req.param("key");
	const nimi = c.req.query("t") || key.split("/").pop() || "Tiedosto";
	const src = "/file/" + key.split("/").map(encodeURIComponent).join("/");
	const kuva = /\.(png|jpe?g|gif|webp|heic|avif)$/i.test(key);
	const pdf = /\.pdf$/i.test(key);
	const html = /\.html?$/i.test(key);
	const teksti = /\.(md|txt|csv|json)$/i.test(key);
	const e = (x: string) => x.replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[m]!);
	let tekstiSisalto = "";
	if (teksti) {
		const f = await getFile(c.env, key);
		tekstiSisalto = f ? new TextDecoder().decode(f.body) : "(tiedostoa ei löytynyt)";
	}
	// HTML-artefakti eristetään kahdesti: iframe sandbox tässä ja CSP sandbox
	// /file-vastauksessa (files.ts isolationHeaders), jotta suora avaus on yhtä turvallinen.
	const sisalto = kuva
		? `<img src="${src}" alt="" style="display:block;max-width:100%;height:auto;margin:0 auto">`
		: pdf || html
			? `<iframe src="${src}" title="${e(nimi)}"${html ? ' sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals"' : ""} style="display:block;width:100%;height:calc(100dvh - 56px);border:0;background:#fff"></iframe>`
			: teksti
				? `<pre style="margin:0;padding:16px;white-space:pre-wrap;overflow-wrap:anywhere;font:15px/1.55 ui-monospace,Menlo,monospace">${e(tekstiSisalto)}</pre>`
				: `<p style="padding:24px 16px">Tätä tiedostotyyppiä ei voi näyttää tässä. Avaa se alla olevasta napista.</p>`;
	return c.html(`<!doctype html><html lang="fi"><head><meta charset="utf-8">${ICON_LINKS}<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light dark"><title>${e(nimi)}</title>
<style>
:root{--bg:#faf9f6;--fg:#1a1a1a;--mut:#6b6b6b;--line:#e6e2da;--acc:#0b5fff}
@media(prefers-color-scheme:dark){:root{--bg:#111;--fg:#ececec;--mut:#9a9a9a;--line:#2a2a2a;--acc:#6ea0ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.4 -apple-system,system-ui,sans-serif}
.bar{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;height:56px;padding:0 12px;padding-top:env(safe-area-inset-top);background:var(--bg);border-bottom:1px solid var(--line)}
.bar a{color:var(--acc);text-decoration:none;font-weight:600;white-space:nowrap;padding:8px 4px}
.bar .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--mut);font-size:14px}
</style></head><body>
<div class="bar"><a href="/">&larr; Lukupino</a><span class="n">${e(nimi)}</span><a href="${src}" download>Jaa</a></div>
${sisalto}
</body></html>`);
});

ui.get("/ui/search", async (c) => {
	const db = new Db(c.env.DB);
	const r = await db.search({
		q: c.req.query("q") ?? "",
		limit: Math.min(parseInt(c.req.query("limit") ?? "30", 10) || 30, 100),
		cursor: c.req.query("cursor") ?? undefined,
		sort: (c.req.query("sort") as "relevance" | "asc" | "desc" | "rating") ?? undefined,
	});
	return c.json(r);
});
ui.get("/ui/lists", async (c) => c.json({ lists: await new Db(c.env.DB).lists() }));
ui.get("/ui/stats", async (c) => c.json(await new Db(c.env.DB).counts()));
ui.get("/ui/bookmark/:id", async (c) => {
	const b = await new Db(c.env.DB).get(c.req.param("id"));
	return b ? c.json(b) : c.json({ error: "not found" }, 404);
});
/** Omin sanoin — omistajan muistiinpano lähteeseen katsomatta. Tyhjä = null. */
ui.post("/ui/bookmark/:id/recall", async (c) => {
	const { recall } = (await c.req.json()) as { recall: string | null };
	const b = await new Db(c.env.DB).update(c.req.param("id"), { recall: (recall ?? "").trim() || null });
	return b ? c.json(b) : c.json({ error: "not found" }, 404);
});
ui.post("/ui/bookmark/:id/media", async (c) => {
	const { media } = (await c.req.json()) as { media?: string };
	const m = parseMedia(media);
	if (!m) return c.json({ error: "Tuntematon mediatyyppi" }, 400);
	const b = await new Db(c.env.DB).update(c.req.param("id"), { media: m });
	return b ? c.json(b) : c.json({ error: "not found" }, 404);
});
ui.post("/ui/bookmark/:id/progress", async (c) => {
	const { progress } = (await c.req.json()) as { progress?: string | null };
	const b = await new Db(c.env.DB).update(c.req.param("id"), { progress: parseProgress(progress) });
	return b ? c.json(b) : c.json({ error: "not found" }, 404);
});
// Tallennuspäivän korjaus, esim. keväällä luettu kirja lisätty nyt.
ui.post("/ui/bookmark/:id/date", async (c) => {
	const { date } = (await c.req.json()) as { date?: string };
	const d = parseSavedDate(date);
	if (!d) return c.json({ error: "Päivä muodossa VVVV-KK-PP, ei tulevaisuudessa" }, 400);
	const b = await new Db(c.env.DB).update(c.req.param("id"), { saved_at: d });
	return b ? c.json(b) : c.json({ error: "not found" }, 404);
});
ui.post("/ui/bookmark/:id/rating", async (c) => {
	const { rating } = (await c.req.json()) as { rating: number | null };
	const b = await new Db(c.env.DB).update(c.req.param("id"), { rating: parseRating(rating) });
	return b ? c.json(b) : c.json({ error: "not found" }, 404);
});
// Poisto on peruuttamaton, joten UI vaatii kaksi napautusta — ks. `del()`.
ui.post("/ui/bookmark/:id/delete", async (c) => {
	const ok = await deleteBookmark(c.env, c.req.param("id"));
	return ok ? c.json({ deleted: true }) : c.json({ error: "not found" }, 404);
});

/** Manuaalinen tiedoston tallennus selaimesta (kuva, PDF, dokumentti). */
ui.post("/ui/upload", async (c) => {
	const r = await receiveUpload(c.env, c.req.url, await c.req.formData(), "app");
	return c.json(r.body, r.status as 200 | 201 | 400 | 413);
});
// Manuaalinen lisäys selaimesta — työkoneelta ei ole jakonappia. Sama polku
// kuin /api/add:lla, mutta istuntoevästeellä eikä bearer-tokenilla.
ui.post("/ui/add", async (c) => {
	const { url: raw, rating } = (await c.req.json()) as { url?: string; rating?: number };
	const syote = (raw ?? "").trim();
	// Välilyönti tai puuttuva piste = kirjan nimi, ei osoite (17.10.2026):
	// kirjalla ei usein ole linkkiä, joten osoitteeksi tulee Google-kirjahaku.
	const url = /\s/.test(syote) ? null : siivoaOsoite(syote);
	const db = new Db(c.env.DB);
	if (!url) {
		if (syote.length < 2) return c.json({ error: "Kirjoita osoite tai kirjan nimi" }, 400);
		const [bm, created] = await db.create({
			url: `https://www.google.com/search?tbm=bks&q=${encodeURIComponent(syote)}`,
			title: syote.slice(0, 300),
			source: "app",
			status: "noudettu",
			fetch_note: "kirja — ei verkkosisältöä",
			media: "kirja",
			progress: "lukematta",
			rating: parseRating(rating),
		});
		return c.json({ bookmark: bm, created, kirja: true }, created ? 201 : 200);
	}
	const [bm, created] = await db.create({ url, source: "app", status: "inbox", rating: parseRating(rating) });
	if (created) c.executionCtx.waitUntil(enrichInBackground(db, c.env, bm.id, bm.url, false));
	return c.json({ bookmark: bm, created }, created ? 201 : 200);
});
ui.post("/ui/bookmark/:id/list", async (c) => {
	const { list, remove } = (await c.req.json()) as { list: string; remove?: boolean };
	const db = new Db(c.env.DB);
	const b = remove ? await db.removeFromList(c.req.param("id"), list) : await db.addToList(c.req.param("id"), list);
	return b ? c.json(b) : c.json({ error: "not found" }, 404);
});

const CSS = `
:root{--bg:#faf9f6;--fg:#1a1a1a;--mut:#6b6b6b;--line:#e6e2da;--soft:#f1eee7;--acc:#0b5fff;--card:#fff;--ok:#047857;--star:#d29200;--danger:#b91c1c}
@media(prefers-color-scheme:dark){:root{--bg:#111;--fg:#ececec;--mut:#9a9a9a;--line:#2a2a2a;--soft:#1e1e1e;--acc:#6ea0ff;--card:#181818;--ok:#34d399;--star:#e3b341;--danger:#f87171}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.45 -apple-system,system-ui,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
button{font:inherit;cursor:pointer;color:inherit}
a{color:var(--acc)}
header{position:sticky;top:0;z-index:3;background:var(--bg);border-bottom:1px solid var(--line)}
.bar{max-width:820px;margin:0 auto;padding:10px 14px;display:flex;gap:8px;align-items:center}
.brand{font-size:16px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;color:var(--fg);text-decoration:none;margin-right:2px}
.search{flex:1;min-width:0;position:relative}
.search svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--mut);pointer-events:none}
input[type=search],input[type=url],.add input[name=url]{width:100%;padding:9px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--fg);font-size:16px;-webkit-appearance:none;appearance:none}
input[type=search]{padding-left:34px}
input[type=search]::-webkit-search-cancel-button{-webkit-appearance:none}
input:focus{outline:none;border-color:var(--acc);box-shadow:0 0 0 3px color-mix(in srgb,var(--acc) 16%,transparent)}
.btn{display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--fg);font-size:14px;font-weight:500;white-space:nowrap}
.btn:hover{border-color:var(--mut)}
.btn.pri{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.btn.pri:hover{opacity:.88}
.btn:disabled{opacity:.5;cursor:default}
.ico{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:10px;color:var(--mut);border:1px solid transparent;text-decoration:none;flex:0 0 auto}
.ico:hover{border-color:var(--line);color:var(--fg)}
@media(max-width:480px){.btn span{display:none}.btn{padding:0 10px}}
.add{display:none;border-bottom:1px solid var(--line);background:var(--card)}
.add.open{display:block}
.add form{max-width:820px;margin:0 auto;padding:12px 14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.add input[name=url]{flex:1;min-width:200px;background:var(--bg)}
.add .msg{font-size:13px;color:var(--mut);flex-basis:100%;min-height:1.2em}
.add .msg.ok{color:var(--ok)}.add .msg.err{color:var(--danger)}
.add .row{display:flex;gap:8px;align-items:center;flex:1;min-width:200px}
.drop{flex-basis:100%;border:1px dashed var(--line);border-radius:10px;padding:14px;text-align:center;font-size:13.5px;color:var(--mut);cursor:pointer}
.drop:hover,.drop.over{border-color:var(--acc);color:var(--fg);background:var(--soft)}
.drop b{font-weight:600;color:var(--fg)}
/* Monta tiedostoa yhdessä tallennuksessa: pikkukuvarivi kortin alla. */
.gal{display:flex;gap:6px;margin-top:10px;flex-wrap:wrap}
.gal a{display:block;width:84px;height:60px;border-radius:8px;overflow:hidden;background:var(--soft);border:1px solid var(--line);flex:0 0 auto}
.gal img{width:100%;height:100%;object-fit:cover;display:block}
.gal .doc{width:84px;height:60px;border-radius:8px;border:1px solid var(--line);background:var(--soft);display:flex;align-items:center;justify-content:center;color:var(--mut);flex:0 0 auto;font-size:11px;text-align:center;padding:4px;overflow:hidden}
@media(max-width:480px){.gal a,.gal .doc{width:72px;height:52px}}
.fico{width:104px;height:68px;border-radius:8px;background:var(--soft);flex:0 0 auto;display:flex;align-items:center;justify-content:center;color:var(--mut)}
@media(max-width:480px){.fico{width:80px;height:54px}}
.bm .m .fsz{font-variant-numeric:tabular-nums}
nav{display:flex;gap:6px;overflow-x:auto;padding:8px 14px;max-width:820px;margin:0 auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
nav::-webkit-scrollbar{display:none}
nav button{white-space:nowrap;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:999px;padding:6px 12px;font-size:13.5px}
nav button:hover{border-color:var(--mut)}
nav button.on{background:var(--fg);color:var(--bg);border-color:var(--fg)}
/* Hiirellä piilotettua vaakavieritystä ei voi käyttää: listat jäivät
   näkymättä työkoneella (6.10.2026). Tarkalla osoittimella rivitetään. */
@media(hover:hover) and (pointer:fine){nav{flex-wrap:wrap;overflow-x:visible}}
.stats{max-width:820px;margin:0 auto;font-size:12.5px;color:var(--mut);padding:4px 14px 0}
main{padding:8px 14px 80px;max-width:820px;margin:0 auto}
.month{font-size:11.5px;color:var(--mut);text-transform:uppercase;letter-spacing:.08em;margin:22px 2px 8px}
.bm{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin:0 0 10px}
.bm.new{animation:pop .35s ease-out}
.sheet>.kp{max-height:88vh;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-top:44px}
.kp .bm{border:0;background:none;padding:0;margin:0}
.kp .hd{padding-right:34px}
.ksulje{position:absolute;top:8px;right:10px;width:36px;height:36px;border:0;border-radius:50%;background:var(--soft);color:var(--fg);font-size:22px;line-height:1}
@keyframes pop{from{transform:translateY(-4px);opacity:0}to{transform:none;opacity:1}}
.hd{display:flex;gap:12px;align-items:flex-start}
.hd .bd{flex:1;min-width:0}
.th{width:104px;height:68px;object-fit:cover;border-radius:8px;flex:0 0 auto;background:var(--soft)}
@media(max-width:480px){.th{width:80px;height:54px}}
.bm a.t{color:var(--fg);text-decoration:none;font-weight:600;line-height:1.3;display:block;overflow-wrap:anywhere;text-wrap:pretty}
.bm a.t:hover{text-decoration:underline;text-underline-offset:2px}
.bm .m{font-size:12px;color:var(--mut);margin-top:4px;display:flex;gap:4px 10px;flex-wrap:wrap;align-items:center}
.bm .m .st{display:inline-flex;align-items:center;gap:4px}
.bm .m .st.ok{color:var(--ok)}
.bm .tag{border:1px solid var(--line);border-radius:6px;padding:0 6px;line-height:18px}
.bm .d{font-size:14px;color:var(--mut);margin-top:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.bm .s{font-size:15px;line-height:1.55;color:var(--fg);margin-top:8px;text-wrap:pretty}
.ft{display:flex;align-items:center;gap:6px;margin-top:10px;padding-top:8px;border-top:1px solid var(--soft);flex-wrap:wrap}
.bm{min-width:0;overflow-wrap:anywhere}
.stars{display:flex;gap:0}
/* Kortin mediatyyppi- ja lukutilavalitsin. Rajattu select-elementtiin, koska
   Poiminnat-sivun lähderivi käyttää samaa luokkaa .mt (17.10.2026). */
.pvm{position:relative;display:inline-flex;align-items:center;cursor:pointer;text-decoration:underline dotted;text-decoration-color:var(--line);text-underline-offset:3px}
.pvm input{position:absolute;inset:0;width:100%;height:100%;opacity:0;border:0;padding:0;margin:0;cursor:pointer;font-size:16px}
.pvm.err{color:var(--danger)}
select.mt,select.pg{font:inherit;font-size:12px;color:var(--mut);background:var(--bg);border:1px solid var(--line);border-radius:6px;padding:0 4px;height:20px;line-height:18px;max-width:120px}
.pg.kesken{color:var(--acc);border-color:var(--acc);font-weight:600}
.pg.luettu{color:var(--ok);border-color:var(--ok)}
#media{padding-top:0}
#media button{font-size:12.5px;padding:4px 10px}
.lit{display:flex;align-items:center;gap:8px;margin-top:10px;padding:9px 12px;border:1px solid var(--line);border-radius:10px;color:var(--fg);text-decoration:none;font-size:14px;font-weight:500;background:var(--bg)}
.lit:hover{border-color:var(--mut)}
.lit span{margin-left:auto;color:var(--mut);font-weight:400;font-size:12.5px}
.lit svg{color:var(--acc)}
.stars button{width:34px;height:34px;padding:0;border:0;background:none;color:var(--line);border-radius:8px;display:inline-flex;align-items:center;justify-content:center;transition:color .12s}
.stars button:hover{background:var(--soft);color:var(--star)}
.stars button.on{color:var(--star)}
.pz{border:1px solid var(--line);background:none;color:var(--mut);font-size:12.5px;border-radius:999px;padding:0 10px;height:28px;margin-right:4px;font-family:inherit}
.pz:hover{background:var(--soft);color:var(--fg)}
.pz.on{border-color:var(--acc);color:var(--acc);font-weight:600}
@media(max-width:480px){.ft .lbl{display:none}.stars button{width:30px}.pz{padding:0 8px}}
.lbl{font-size:12.5px;color:var(--mut);margin-left:2px}
.ft .sp{flex:1}
.q{border:0;background:none;color:var(--mut);font-size:13px;padding:6px 8px;border-radius:8px}
.q:hover{background:var(--soft);color:var(--fg)}
.q.tk{color:var(--acc);font-weight:600}
.q.arm{background:var(--danger);color:#fff}
.bm details{margin-top:8px}
.bm summary{cursor:pointer;font-size:12.5px;color:var(--mut);list-style:none;display:inline-flex;align-items:center;gap:4px}
.bm summary::-webkit-details-marker{display:none}
.bm summary svg{transition:transform .15s}
.bm details[open] summary{color:var(--fg)}
.bm details[open] summary svg{transform:rotate(90deg)}
.bm pre{white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.55;margin:8px 0 0;border-left:2px solid var(--line);padding-left:12px;color:var(--fg)}
.more{display:block;width:100%;padding:12px;border:1px dashed var(--line);background:none;color:var(--mut);border-radius:12px;font-size:14px;margin-top:8px}
.more:hover{color:var(--fg);border-color:var(--mut)}
.empty{color:var(--mut);text-align:center;padding:48px 0;font-size:14.5px}
.login{max-width:380px;margin:22vh auto;padding:24px;text-align:center}
.login h1{font-size:22px;letter-spacing:-.01em;margin:0 0 6px}
.login p{color:var(--mut);margin:0 0 20px}
.login a{display:inline-block;background:var(--fg);color:var(--bg);padding:11px 18px;border-radius:10px;text-decoration:none;font-weight:600}
/* Poiminnat */
.serif{font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif}
.daily{margin:14px 0 18px;padding:22px 20px 18px;border-radius:14px;background:var(--card);border:1px solid var(--line)}
.daily .k{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);margin-bottom:10px}
.daily blockquote{margin:0;font-size:21px;line-height:1.42;letter-spacing:-.005em;text-wrap:pretty}
.daily .mt{margin-top:12px}
.compose{margin:0 0 16px}
.compose textarea{width:100%;min-height:64px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--fg);font-family:inherit;font-size:15px;line-height:1.5;resize:vertical}
.compose textarea:focus,.qadd textarea:focus{outline:none;border-color:var(--acc);box-shadow:0 0 0 3px color-mix(in srgb,var(--acc) 16%,transparent)}
.compose .row{display:flex;gap:8px;margin-top:8px}
.compose input{flex:1;min-width:0;padding:9px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--fg);font-size:15px}
.qt{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px 8px;margin:0 0 10px}
.qt .tx{margin:0;font-size:17.5px;line-height:1.5;text-wrap:pretty}
.qt.oma .tx{font-family:inherit;font-size:15.5px;border-left:3px solid var(--star);padding-left:10px}
.mt{font-size:12.5px;color:var(--mut);margin-top:8px;display:flex;flex-wrap:wrap;gap:2px 8px;align-items:center}
.mt a{color:var(--mut);text-decoration:underline;text-decoration-color:var(--line);text-underline-offset:2px}
.mt a:hover{color:var(--fg)}
.chip{border:1px solid var(--line);border-radius:6px;padding:0 6px;line-height:18px;font-size:11.5px}
.qt .ac{display:flex;align-items:center;gap:4px;margin-top:4px}
.qt .ac .sp{flex:1}
.qstar{width:34px;height:34px;border:0;background:none;color:var(--line);border-radius:8px;display:inline-flex;align-items:center;justify-content:center}
.qstar:hover{background:var(--soft);color:var(--star)}
.qstar.on{color:var(--star)}
.qadd{margin-top:8px}
.qadd textarea{width:100%;min-height:52px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg);font-family:inherit;font-size:15px;line-height:1.5;resize:vertical}
.qadd .row{display:flex;gap:8px;justify-content:flex-end;margin-top:6px}
.tabs{display:flex;gap:6px;overflow-x:auto;padding:2px 0 12px;scrollbar-width:none}
`;

const LOGIN_PAGE = `<!doctype html><html lang="fi"><head><meta charset="utf-8">${ICON_LINKS}<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Lukupino</title><style>${CSS}</style></head>
<body><div class="login"><h1>Lukupino</h1><p>Oma lukuvarasto.</p><a href="/login">Kirjaudu GitHubilla</a></div></body></html>`;

const HYLLY_CSS = `
body{font-family:'DM Sans',-apple-system,system-ui,sans-serif}
#hylly{max-width:820px;margin:0 auto;padding:4px 0 2px}
.shelf{margin:16px 0 4px}
.shelf .sh{display:flex;align-items:baseline;justify-content:space-between;padding:0 14px;margin-bottom:10px}
.shelf h2,.allh{font-family:'DM Serif Display',Georgia,serif;font-weight:400;font-size:22px;margin:0;letter-spacing:.005em}
.shelf .sh span{font-size:13px;color:var(--mut)}
.shelf .row{display:flex;gap:12px;overflow-x:auto;padding:0 14px 6px;scroll-snap-type:x mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.shelf .row::-webkit-scrollbar{display:none}
@media(hover:hover) and (pointer:fine){.shelf .row{flex-wrap:wrap;overflow:visible}}
.spine{flex:0 0 auto;width:96px;height:140px;border-radius:5px 10px 10px 5px;padding:12px 10px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;text-decoration:none;box-shadow:inset 6px 0 0 rgba(0,0,0,.22),0 2px 6px rgba(0,0,0,.12);scroll-snap-align:start}
.spine .st{font-family:'DM Serif Display',Georgia,serif;font-size:15px;line-height:1.1;overflow:hidden;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical}
.spine .sa{font-size:10px;letter-spacing:.08em;text-transform:uppercase;opacity:.85;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.tile{flex:0 0 auto;width:168px;text-decoration:none;color:var(--fg);display:flex;flex-direction:column;gap:6px;scroll-snap-align:start}
.tile .thumb{position:relative;height:94px;border-radius:10px;background:#2a332f center/cover no-repeat;display:block}
.tile .badge{position:absolute;left:8px;bottom:8px;font-size:11px;color:#fff;background:rgba(0,0,0,.6);padding:2px 6px;border-radius:4px}
.tile .play{position:absolute;right:8px;bottom:8px;width:28px;height:28px;border-radius:14px;background:#fbfaf7;color:#1d2b24;display:flex;align-items:center;justify-content:center}
.tile .tt{font-size:14px;font-weight:500;line-height:1.25;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.shelf .list{padding:0 14px;display:flex;flex-direction:column}
.rrow{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid var(--line);text-decoration:none;color:var(--fg);font-size:15px}
.rrow em{font-style:normal;color:var(--mut);font-size:12px;white-space:nowrap}
.tw,.sw{flex:0 0 auto;display:flex;flex-direction:column;gap:2px;scroll-snap-align:start}
.tw{width:168px}
.arv{align-self:flex-start;border:0;background:none;padding:0;min-height:30px;font:500 12.5px 'DM Sans',sans-serif;color:var(--mut);letter-spacing:.02em}
.arv.on{color:var(--star)}
.sheet{position:fixed;inset:0;z-index:20}
.sheet[hidden]{display:none}
.sheet .sbg{position:absolute;inset:0;background:rgba(0,0,0,.45)}
.sheet>.sp{position:absolute;left:0;right:0;bottom:0;max-width:560px;margin:0 auto;background:var(--card);color:var(--fg);border-radius:18px 18px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom));box-shadow:0 -8px 30px rgba(0,0,0,.25)}
.sheet h3{font-size:15px;line-height:1.3;margin:0 0 12px;font-weight:700;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.sheet .sl{font-size:12px;color:var(--mut);margin:14px 0 6px}
.sheet .ar{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.sheet .ap{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.sheet .ar button,.sheet .ap button{min-height:48px;border-radius:12px;border:1px solid var(--line);background:var(--soft);color:var(--fg);font:600 14px 'DM Sans',sans-serif}
.sheet .ap a{display:flex;align-items:center;justify-content:center;min-height:48px;border-radius:12px;border:1px solid var(--line);background:var(--soft);color:var(--fg);text-decoration:none;font:600 14px 'DM Sans',sans-serif}
#arv button.on{border-color:var(--star);background:var(--star);color:#1a1a1a}
.sheet .x{display:block;width:100%;min-height:44px;margin-top:14px;border:0;background:none;color:var(--mut);font:600 14px 'DM Sans',sans-serif}
.tjono{margin:0;padding:10px 0;color:var(--mut);font-size:14px}
.rrow.tr{padding:9px 0}.rrow.tr span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tlaaj{border:0;background:none;color:var(--acc);font-size:14px;font-weight:600;padding:12px 0 2px;text-align:left}
.pkb{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;align-items:baseline;margin:14px 0 4px;padding:12px 14px;border-radius:14px;background:var(--soft);color:var(--fg);text-decoration:none;font-size:14.5px}
.pkb b{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)}
.pkb span{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pkb em{grid-column:2;font-style:normal;color:var(--mut);font-size:13px}
.pkb.open{background:color-mix(in srgb,var(--star) 16%,var(--soft))}
.pkb.open em{color:var(--fg)}
.allh{display:block;max-width:820px;margin:26px auto 2px;padding:0 14px;box-sizing:border-box}
.purku{border:0;background:none;padding:0;font:600 13px 'DM Sans',sans-serif;color:var(--acc);text-decoration:none;cursor:pointer}
.purku:disabled{color:var(--mut);cursor:default}
/* Työpöytä (22.10.2026): 820 px:n palsta jätti leveän näytön tyhjäksi.
   Leveämpi sivu, hyllyt ruudukkona isoilla kuvilla, kortit kahteen
   sarakkeeseen ja korttipaneeli keskelle ikkunaksi. Mobiili ennallaan. */
@media(min-width:1000px){
 .bar,.add form,nav,.stats,main,#hylly,.allh{max-width:1180px}
 .bar,.add form,nav,.stats,.shelf .sh,.shelf .row,.shelf .list,.allh{padding-left:24px;padding-right:24px}
 main{padding-left:24px;padding-right:24px}
 #out{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 16px;align-items:start}
 #out>.month,#out>.more,#out>.empty{grid-column:1/-1}
 .shelf{margin:28px 0 6px}
 .shelf h2,.allh{font-size:26px}
 .shelf .row:has(.tw){display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:22px 18px}
 .shelf .row .tw{width:auto}
 .shelf .row .tile{width:auto}
 .tile .thumb{height:auto;aspect-ratio:16/9}
 .tile .tt{font-size:15px}
 .shelf .row.books{display:flex;flex-wrap:wrap;gap:18px}
 .shelf .row.books .tw{width:220px}
 .spine{width:110px;height:160px}
 .rrow{font-size:16px}
 .pkb{margin:18px 24px 4px}
 .sheet>.sp{top:50%;bottom:auto;transform:translateY(-50%);border-radius:18px;max-width:600px;padding-bottom:20px}
 .sheet>.kp{max-width:680px;max-height:86vh}
}
`;

const APP_PAGE = `<!doctype html><html lang="fi"><head><meta charset="utf-8">${ICON_LINKS}<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="color-scheme" content="light dark"><title>Lukupino</title><style>${CSS}</style><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap" rel="stylesheet"><style>${HYLLY_CSS}</style></head>
<body>
<header>
 <div class="bar">
  <a class="brand" href="/">Lukupino</a>
  <div class="search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"></circle><path d="M20 20l-4.3-4.3"></path></svg><input id="q" type="search" placeholder="Hae" autocomplete="off"></div>
  <a class="btn" href="/poiminnat" title="Poiminnat — lainaukset ja mitä jäi mieleen" style="text-decoration:none"><svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M9.5 6C6.5 6.6 4.5 9 4.5 12.3V18h5.6v-5.6H7.3c.1-2 1.2-3.4 3.1-4zM19 6c-3 .6-5 3-5 6.3V18h5.6v-5.6h-2.8c.1-2 1.2-3.4 3.1-4z"></path></svg><span>Poiminnat</span></a>
  <a class="ico" href="/pistokoe" title="Pistokoe — mitä jäi mieleen" aria-label="Pistokoe"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="4"></rect><path d="M8.5 12.2l2.4 2.4 4.6-5"></path></svg></a>
  <button class="btn" id="addbtn" onclick="toggleAdd()" title="Lisää linkki"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg><span>Lisää</span></button>
  <a class="ico" href="/logout" title="Kirjaudu ulos"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"></path><path d="M15 16l4-4-4-4M19 12H9"></path></svg></a>
 </div>
 <div class="add" id="add"><form onsubmit="addUrl(event)" autocomplete="off">
  <div class="row"><input name="url" type="text" placeholder="Osoite tai kirjan nimi" spellcheck="false" autocapitalize="off"><button class="btn pri" type="submit">Tallenna</button></div>
  <div class="drop" id="drop" onclick="document.getElementById('file').click()"><b>Valitse tiedostot</b> tai raahaa tähän &middot; kuva, PDF tai dokumentti<br><span style="font-size:11.5px">Monta kerralla \u2192 yksi tallennus. Erillisiksi: yksi kerrallaan.</span></div>
  <input type="file" id="file" multiple style="display:none" onchange="sendFiles(this.files);this.value=''">
  <div class="msg" id="addmsg"></div>
 </form></div>
</header>
<section id="hylly" aria-label="Hylly"></section>
<div class="sheet" id="ks" hidden><div class="sbg" onclick="suljeK()"></div><div class="sp kp" role="dialog" aria-modal="true" aria-label="Tallennus"><button type="button" class="ksulje" onclick="suljeK()" aria-label="Sulje">×</button><div id="ksis"></div></div></div>
<div class="sheet" id="arv" hidden><div class="sbg" onclick="suljeArv()"></div><div class="sp" role="dialog" aria-modal="true" aria-labelledby="arvt"><h3 id="arvt"></h3>
<div class="sl">Arvio</div><div class="ar"><button type="button" data-r="0" onclick="asetaArv('r',0)">Perehdy</button><button type="button" data-r="1" onclick="asetaArv('r',1)">★</button><button type="button" data-r="2" onclick="asetaArv('r',2)">★★</button><button type="button" data-r="3" onclick="asetaArv('r',3)">★★★</button></div>
<div id="arvp"><div class="sl">Tila</div><div class="ap"><button type="button" data-p="lukematta" onclick="asetaArv('p','lukematta')">Lukematta</button><button type="button" data-p="kesken" onclick="asetaArv('p','kesken')">Kesken</button><button type="button" data-p="luettu" onclick="asetaArv('p','luettu')">Luettu</button></div></div>
<div class="sl">Tutkimus</div><div class="ap" style="grid-template-columns:1fr"><button type="button" id="arvtb" onclick="tutkiArv()">Tutki tämä</button><a id="arvtl" href="#" hidden>Avaa tutkimus</a></div>
<button type="button" class="x" onclick="suljeArv()">Valmis</button></div></div>
<h2 class="allh" id="allh">Kaikki tallennukset</h2>
<nav id="lists"></nav>
<nav id="media"></nav>
<div class="stats" id="stats"></div>
<main id="out"></main>
<script>
${KYSY_JS}
// Kortin Kysy-nappi: kortti löytyy listasta tai hyllystä.
function kysyK(btn){const id=btn.closest('.ft').dataset.id;const b=state.items.find(x=>x.id===id)||HY[id];if(b)kysy(b,'kortti')}
const $=s=>document.querySelector(s);let state={q:'',list:'',status:'',rating:'',media:'',progress:'',sort:'',cursor:null,items:[]};
const MEDIA_LBL={artikkeli:'Artikkeli',video:'Video',podcast:'Podcast',kirja:'Kirja',some:'Some',dokumentti:'Dokumentti',kuva:'Kuva'};
const MEDIA_MON={artikkeli:'Artikkelit',video:'Videot',podcast:'Podcastit',kirja:'Kirjat',some:'Some',dokumentti:'Dokumentit',kuva:'Kuvat'};
const PG_LBL={lukematta:'Lukematta',kesken:'Kesken',luettu:'Luettu'};
// Tila kaikille medioille (21.10.2026): videolla ja podcastilla katsottu/kuunneltu.
function pgL(m,k){if(k==='kesken')return 'Kesken';const v=m==='video',p=m==='podcast';return k==='luettu'?(v?'Katsottu':p?'Kuunneltu':'Luettu'):(v?'Katsomatta':p?'Kuuntelematta':'Lukematta')}
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const host=u=>{try{return new URL(u).hostname.replace(/^(www|m|open)\\./,'')}catch{return u}};
const FI=['tammi','helmi','maalis','huhti','touko','kesä','heinä','elo','syys','loka','marras','joulu'];
function month(iso){const d=new Date(iso);return FI[d.getMonth()]+'kuu '+d.getFullYear()}
const BOOK='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M8 7h7"></path></svg>';
const TUTKI='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"></circle><path d="M20 20l-4.3-4.3M8.5 11h5M11 8.5v5"></path></svg>';
const LIT='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 10h16M4 14h10M4 18h7"></path></svg>';
const STAR='<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9z"></path></svg>';
const CHEV='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"></path></svg>';
const LBL=['lukematta','kelpaa','hyvä','helmi'];
// Statuksen sisäinen nimi on kannan totuus, mutta se ei ole luettavaa tekstiä.
// Näytetään ihmiskielellä ja ikonilla; kannassa ja haussa nimet ovat ennallaan.
const ST={
 inbox:['Käsittelemättä','','<path d="M4 13h5l1.2 3h3.6l1.2-3h5"></path><path d="M5.5 5h13l1.5 8h-16z"></path>'],
 noudettu:['Sisältö haettu','','<path d="M6 4h8l4 4v12H6z"></path><path d="M14 4v4h4"></path>'],
 'ei-noudettavissa':['Ei sisältöä','','<circle cx="12" cy="12" r="8"></circle><path d="M6.6 6.6l10.8 10.8"></path>'],
 kortitettu:['Kortti kirjoitettu','ok','<path d="M4 6h16v12H4z"></path><path d="M7 10h7M7 14h5"></path>']};
function stTag(k){const x=ST[k]||[k,'',''];
 return '<span class="st '+x[1]+'"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+x[2]+'</svg>'+esc(x[0])+'</span>'}
function query(){let q=state.q.trim();if(state.list)q+=' list:"'+state.list+'"';if(state.status)q+=' status:'+state.status;if(state.rating)q+=' '+state.rating;if(state.media)q+=' media:'+state.media;if(state.progress)q+=' '+state.progress;return q.trim()}
function paintStars(row,r){[...row.querySelectorAll('.stars button')].forEach((x,i)=>x.classList.toggle('on',(r||0)>=i+1));row.querySelector('.pz').classList.toggle('on',r===0);row.querySelector('.lbl').textContent=r!=null?LBL[r]:'arvioi'}
async function rate(btn,n){const row=btn.closest('.ft'),id=row.dataset.id;
 const cur=state.items.find(x=>x.id===id);const uusi=cur&&cur.rating===n?null:n;
 paintStars(row,uusi);
 const r=await fetch('/ui/bookmark/'+id+'/rating',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rating:uusi})});
 if(!r.ok){paintStars(row,cur&&cur.rating);return}const b=await r.json();if(cur)cur.rating=b.rating;paintStars(row,b.rating)}
async function del(btn){const row=btn.closest('.ft'),id=row.dataset.id;
 if(!btn.classList.contains('arm')){btn.classList.add('arm');btn.textContent='Poista varmasti?';
  setTimeout(()=>{btn.classList.remove('arm');btn.textContent='Poista'},4000);return}
 const r=await fetch('/ui/bookmark/'+id+'/delete',{method:'POST'});if(!r.ok)return;
 state.items=state.items.filter(x=>x.id!==id);render()}
function toggleAdd(){const a=$('#add');a.classList.toggle('open');if(a.classList.contains('open'))a.querySelector('input[name=url]').focus()}
async function addUrl(e){e.preventDefault();const f=e.target,inp=f.url,btn=f.querySelector('button'),msg=$('#addmsg');const v=inp.value.trim();if(!v)return;
 btn.disabled=true;msg.className='msg';msg.textContent='Tallennetaan…';
 let d,r;try{r=await fetch('/ui/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:v})});d=await r.json()}catch{r=null}
 btn.disabled=false;
 if(!r||!r.ok){msg.className='msg err';msg.textContent=(d&&d.error)||'Ei onnistunut';return}
 inp.value='';
 const i=state.items.findIndex(b=>b.id===d.bookmark.id);
 if(d.created&&d.kirja){msg.className='msg ok';msg.textContent='Kirja lisätty. Merkitse kortista, onko se kesken.';state.items.unshift(d.bookmark);render(d.bookmark.id);loadKesken()}
 else if(d.created){msg.className='msg ok';msg.textContent='Tallennettu. Otsikko ja kuva haetaan taustalla.';state.items.unshift(d.bookmark);render(d.bookmark.id);
  for(const ms of [2500,7000])setTimeout(async()=>{const x=await (await fetch('/ui/bookmark/'+d.bookmark.id)).json();const j=state.items.findIndex(b=>b.id===x.id);if(j>=0){state.items[j]=x;render()}},ms)}
 else{msg.className='msg ok';msg.textContent='Oli jo tallessa.';if(i<0){state.items.unshift(d.bookmark);render(d.bookmark.id)}}}
const viewUrl=(k,t)=>esc('/ui/view/'+k+(t?'?t='+encodeURIComponent(t):''));
// Kotivalikkotilassa iOS jättää target=_blank-linkin joskus avaamatta.
// window.open avaa ulkoisen sivun selainikkunaan, jossa on Valmis-nappi.
if(navigator.standalone||matchMedia('(display-mode: standalone)').matches)
 document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a[target=_blank]');
  if(!a)return;e.preventDefault();window.open(a.href,'_blank','noopener')},true);
function poimi(btn){const ft=btn.closest('.ft'),id=ft.dataset.id,card=ft.parentElement;let box=card.querySelector('.qadd');
 if(box){box.remove();return}
 box=document.createElement('div');box.className='qadd';
 box.innerHTML='<textarea placeholder="Lause tai ajatus joka jäi mieleen tästä lähteestä"></textarea><div class="row"><span class="msg" style="flex:1;font-size:12.5px;color:var(--mut)"></span><button class="btn" type="button">Peru</button><button class="btn pri" type="button">Tallenna</button></div>';
 ft.after(box);const ta=box.querySelector('textarea'),bs=box.querySelectorAll('button'),m=box.querySelector('.msg');ta.focus();
 bs[0].onclick=()=>box.remove();
 bs[1].onclick=async()=>{const t=ta.value.trim();if(!t)return;bs[1].disabled=true;
  let r;try{r=await fetch('/ui/quotes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:t,bookmarkId:id})})}catch{r=null}
  bs[1].disabled=false;if(!r||!r.ok){m.textContent='Ei onnistunut';return}
  ta.value='';m.textContent='Tallennettu poimintoihin.';setTimeout(()=>box.remove(),1400)}}
const FICO='<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4"></path><path d="M9 13h6M9 16.5h4"></path></svg>';
const koko=n=>n>=1048576?(n/1048576).toFixed(1).replace('.',',')+' Mt':Math.max(1,Math.round(n/1024))+' kt';
function msg(t,k){const m=$('#addmsg');m.className='msg'+(k?' '+k:'');m.textContent=t}
async function sendFiles(list){const fs=[...list];if(!fs.length)return;
 const yht=fs.reduce((n,f)=>n+f.size,0);
 msg(fs.length===1?'Tallennetaan '+fs[0].name+' ('+koko(fs[0].size)+')…'
   :'Tallennetaan '+fs.length+' tiedostoa yhtenä tallennuksena ('+koko(yht)+')…');
 const fd=new FormData();
 for(const f of fs){fd.append('file',f);fd.append('name',f.name||'')}
 let d,r;try{r=await fetch('/ui/upload',{method:'POST',body:fd});d=await r.json()}catch{r=null}
 if(!r||!r.ok){msg((d&&d.error)||'Ei onnistunut','err');return}
 const j=state.items.findIndex(b=>b.id===d.bookmark.id);
 if(j>=0)state.items[j]=d.bookmark;else state.items.unshift(d.bookmark);
 render(d.bookmark.id);
 msg(fs.length===1?'Tallennettu.':fs.length+' tiedostoa → yksi tallennus.','ok')}
function dropInit(){const d=$('#drop');if(!d)return;
 const stop=e=>{e.preventDefault();e.stopPropagation()};
 for(const t of ['dragenter','dragover'])d.addEventListener(t,e=>{stop(e);d.classList.add('over')});
 for(const t of ['dragleave','drop'])d.addEventListener(t,e=>{stop(e);d.classList.remove('over')});
 d.addEventListener('drop',e=>{if(e.dataTransfer&&e.dataTransfer.files.length)sendFiles(e.dataTransfer.files)});
 // Liitä leikepöydältä: näyttökuva menee talteen ilman välitallennusta.
 document.addEventListener('paste',e=>{if(!$('#add').classList.contains('open'))return;
  const fs=[...(e.clipboardData&&e.clipboardData.files||[])];if(fs.length){e.preventDefault();sendFiles(fs)}})}
function mediaSel(b){return '<select class="mt" data-id="'+esc(b.id)+'" onchange="setMedia(this)" title="Mediatyyppi">'+Object.keys(MEDIA_LBL).map(k=>'<option value="'+k+'"'+(b.media===k?' selected':'')+'>'+MEDIA_LBL[k]+'</option>').join('')+'</select>'}
function pgSel(b){return '<select class="pg '+(b.progress||'')+'" data-id="'+esc(b.id)+'" onchange="setProgress(this)" title="Tila"><option value="">Ei seurata</option>'+Object.keys(PG_LBL).map(k=>'<option value="'+k+'"'+(b.progress===k?' selected':'')+'>'+pgL(b.media,k)+'</option>').join('')+'</select>'}
async function setMedia(el){const id=el.dataset.id;const r=await fetch('/ui/bookmark/'+id+'/media',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({media:el.value})});
 if(!r.ok)return;const b=await r.json();const i=state.items.findIndex(x=>x.id===id);if(i>=0){state.items[i]=b;render()}}
// Päivämäärä: napautus avaa päivävalitsimen; muutos siirtää tallennuksen
// oikeaan kuukauteen seuraavalla latauksella.
function ymd(iso){const d=new Date(iso);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function pvm(b){return '<label class="pvm" title="Muuta päivämäärää"><span>'+new Date(b.saved_at).toLocaleDateString('fi-FI')+'</span><input type="date" value="'+ymd(b.saved_at)+'" max="'+ymd(new Date().toISOString())+'" data-id="'+esc(b.id)+'" onclick="try{this.showPicker()}catch(e){}" onchange="setDate(this)" aria-label="Tallennuspäivä"></label>'}
async function setDate(el){if(!el.value)return;const id=el.dataset.id;const r=await fetch('/ui/bookmark/'+id+'/date',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:el.value})});
 const lab=el.closest('.pvm');if(!r.ok){lab.classList.add('err');return}const b=await r.json();const it=state.items.find(x=>x.id===id);if(it)it.saved_at=b.saved_at;
 lab.querySelector('span').textContent=new Date(b.saved_at).toLocaleDateString('fi-FI')+' ✓';lab.classList.remove('err')}
async function setProgress(el){const id=el.dataset.id;const r=await fetch('/ui/bookmark/'+id+'/progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({progress:el.value||null})});
 if(!r.ok)return;const b=await r.json();const i=state.items.findIndex(x=>x.id===id);if(i>=0){state.items[i]=b;render()}loadKesken()}
// Hylly (17.10.2026): etusivun rivit — kesken, kuunneltavat ja katsottavat
// litteraatteineen, perehdy, helmet ja luettavaa. Haun tai suodattimen aikana
// piilossa; alla oleva lista toimii kuten ennen.
const SPINE=['#1d2b24','#c9542e','#e8c95a','#2f4b7c','#6b3f5c','#3d5a4c'];
const PLAY='<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"></path></svg>';
function hue(t){let h=0;for(const c of String(t))h=(h*31+c.charCodeAt(0))%100003;return h}
function bhref(b){return b.file_key?viewUrl(b.file_key,b.title):esc(b.url)}
function btgt(b){return b.file_key?'':' target="_blank" rel="noopener"'}
function spine(b){const c=SPINE[hue(b.title||b.id)%SPINE.length];const osat=String(b.title||'').split(' — ');
 return '<div class="sw"><a class="spine" href="/kirja/'+esc(b.id)+'" style="background:'+c+';color:'+(c==='#e8c95a'?'#1d2b24':'#fbfaf7')+'"><span class="st">'+esc(osat[0])+'</span><span class="sa">'+esc(osat[1]||MEDIA_LBL[b.media]||'')+'</span></a>'+chip(b)+'</div>'}
// Lähdetekstillinen juttu aukeaa lukunäkymään; video ja podcast ilman
// litteraattia avaavat lähteen kuten ennen.
function luettava(b){return !b.transcript_words&&!b.file_key&&b.media!=='video'&&b.media!=='podcast'&&(b.excerpt||'').trim().length>=200}
function tile(b){const lit=b.transcript_words>0,lue=luettava(b);const h=lit?'/litteraatti/'+esc(b.id):lue?'/lue/'+esc(b.id):bhref(b);
 return '<div class="tw"><a class="tile" href="'+h+'"'+(lit||lue?'':btgt(b))+'><span class="thumb"'+(b.image_url?' style="background-image:url('+esc(b.image_url)+')"':'')+'><span class="badge">'+(lit?Math.max(1,Math.round(b.transcript_words/230))+' min':esc(MEDIA_LBL[b.media]||''))+'</span>'+(lit?'<span class="play">'+PLAY+'</span>':'')+'</span><span class="tt">'+esc(b.title||b.url)+'</span></a>'+chip(b)+'</div>'}
// Arviointi hyllystä (17.10.2026): tiilen alla oleva nappi avaa alapaneelin,
// jossa Perehdy ja 1–3 tähteä sekä kirjoille lukutila. Hyllyt eivät lataudu
// uudelleen heti, ettei rivi hyppää kesken selaamisen.
const HY={};let arvId=null;
function rlab(b){return b.rating==null?'☆ Arvioi':b.rating===0?'Perehdy':'★'.repeat(b.rating)}
function chip(b){HY[b.id]=b;return '<button type="button" class="arv'+(b.rating!=null?' on':'')+'" data-id="'+esc(b.id)+'" onclick="arvioi(this.dataset.id)">'+rlab(b)+'</button>'}
function arvioi(id){if(!HY[id])return;arvId=id;$('#arvt').textContent=HY[id].title||HY[id].url;paintArv();$('#arv').hidden=false}
function paintArv(){const b=HY[arvId];if(!b)return;paintTutki(b);document.querySelectorAll('#arv [data-r]').forEach(x=>x.classList.toggle('on',String(b.rating)===x.dataset.r));
 document.querySelectorAll('#arv [data-p]').forEach(x=>{x.classList.toggle('on',(b.progress||'')===x.dataset.p);x.textContent=pgL(b.media,x.dataset.p)})}
function paintTutki(b){const bt=$('#arvtb'),ln=$('#arvtl');const st=b.research_status;ln.hidden=st!=='valmis';bt.hidden=st==='valmis';ln.href='/tutkimus/'+encodeURIComponent(b.id);
 bt.classList.toggle('on',st==='pyydetty');bt.textContent=st==='pyydetty'?'Tutkittavana · peru':st==='ei-onnistu'?'Yritä tutkia uudelleen':'Tutki tämä'}
// Tutkimus (20.10.2026): sama kuin jakaminen numerolla 4. Rutiini kirjoittaa sen aamulla.
async function setResearch(id,on){const r=await fetch('/ui/bookmark/'+encodeURIComponent(id)+'/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request:on})});
 if(!r.ok)return null;const nb=await r.json();const it=state.items.find(x=>x.id===id);if(it)it.research_status=nb.research_status;if(HY[id])HY[id].research_status=nb.research_status;return nb}
async function tutkiArv(){const b=HY[arvId];if(!b)return;const nb=await setResearch(b.id,b.research_status!=='pyydetty');if(!nb)return;paintTutki(HY[b.id]);if(state.items.some(x=>x.id===b.id)){const y=scrollY;render();scrollTo(0,y)}}
async function tutki(btn){const id=btn.closest('.ft').dataset.id;const cur=state.items.find(x=>x.id===id);const nb=await setResearch(id,!(cur&&cur.research_status==='pyydetty'));if(!nb)return;const y=scrollY;render();scrollTo(0,y)}
function suljeArv(){$('#arv').hidden=true;arvId=null}
async function asetaArv(kind,v){const b=HY[arvId];if(!b)return;const id=b.id;
 const body=kind==='r'?{rating:b.rating===v?null:v}:{progress:b.progress===v?null:v};
 const r=await fetch('/ui/bookmark/'+encodeURIComponent(id)+'/'+(kind==='r'?'rating':'progress'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 if(!r.ok)return;const nb=await r.json();b.rating=nb.rating;b.progress=nb.progress;
 document.querySelectorAll('.arv').forEach(x=>{if(x.dataset.id===id){x.textContent=rlab(b);x.classList.toggle('on',b.rating!=null)}});
 const it=state.items.find(x=>x.id===id);if(it){it.rating=b.rating;it.progress=b.progress;const y=scrollY;render();scrollTo(0,y)}
 if(kind==='r')suljeArv();else paintArv()}
addEventListener('keydown',e=>{if(e.key==='Escape'&&arvId)suljeArv();if(e.key==='Escape'&&kId)suljeK()});
// Pistokoe (20.10.2026): uusin koe hyllyn yläpuolella, kunnes siihen on
// vastattu ja palaute on ollut esillä kolme päivää.
// Viikko mediassa (22.10.2026): banneri sunnuntai-illasta keskiviikkoon.
function vkBanneri(){const d=new Date(),wd=d.getDay(),h=d.getHours();if(!(wd===1||wd===2||wd===3||(wd===0&&h>=17)))return '';
 return '<a class="pkb" href="/viikko"><b>Viikko</b><span>Viikkosi mediassa</span><em>tallennukset, kuuntelu, aihe ja ajatus joka jäi</em></a>'}
function pkBanneri(q){if(!q)return '';const done=q.n>0&&q.answered===q.n;
 if(done&&Date.now()-new Date(q.feedback_at||q.answered_at||q.created_at).getTime()>3*864e5)return '';
 const st=done?q.right+'/'+q.n+' oikein · '+(q.feedback_at?'palaute valmis':'palaute tulossa'):q.answered?q.answered+'/'+q.n+' vastattu · jatka':q.n+' väitettä · noin '+Math.max(2,Math.round(q.n/3.5))+' min';
 return '<a class="pkb'+(done?'':' open')+'" href="/pistokoe/'+esc(q.id)+'"><b>Pistokoe</b><span>'+esc(q.title)+'</span><em>'+st+'</em></a>'}
// Tutkimuksia kertyy nopeasti (20.10. jo yksitoista): hyllyssä kolme
// uusinta, loput Näytä kaikki -napin takana, ettei rivi vie etusivua.
function tlista(tval,tjono){if(!tval.length)return tjono?'<p class="tjono">Tutkimus valmistuu aamun rutiinissa.</p>':'';const N=3;
 return tval.slice(0,N).map(trow).join('')+(tval.length>N?'<div class="tmore" hidden>'+tval.slice(N).map(trow).join('')+'</div><button type="button" class="tlaaj" data-n="'+tval.length+'" onclick="laajennaT(this)">Näytä kaikki '+tval.length+'</button>':'')}
// Käynnistä nyt (22.10.2026): rikastusrutiini heti, ks. /ui/purku.
let PURKU={};
function purkuNappi(){const v=PURKU.viimeisin;
 if(v&&v.url&&Date.now()-new Date(v.at).getTime()<36e5)return ' · <a class="purku" href="'+esc(v.url)+'" target="_blank" rel="noopener">käynnissä '+new Date(v.at).toLocaleTimeString('fi-FI',{hour:'2-digit',minute:'2-digit'})+'</a>';
 return PURKU.kytketty?' · <button type="button" class="purku" onclick="purku(this)">Käynnistä nyt</button>':''}
async function purku(btn){btn.disabled=true;btn.textContent='Käynnistetään…';
 const r=await fetch('/ui/purku',{method:'POST'});const d=await r.json().catch(()=>({}));
 if(!r.ok){btn.disabled=false;btn.textContent='Käynnistä nyt';alert(d.error||'Käynnistys epäonnistui');return}
 PURKU.viimeisin=d;btn.outerHTML=purkuNappi().replace(/^ · /,'')}
function laajennaT(b){const m=b.previousElementSibling;m.hidden=!m.hidden;b.textContent=m.hidden?'Näytä kaikki '+b.dataset.n:'Näytä vähemmän'}
function trow(b){return '<a class="rrow tr" href="/tutkimus/'+esc(b.id)+'"><span>'+esc(b.title||b.url)+'</span></a>'}
// Luettavaa-rivi avaa kortin alapaneeliin (21.10.2026): arvio, tutkimus,
// poiminta ja Lue ja korosta ilman rullaamista listaan. Kortti haetaan, jos
// se ei ole listan ladatulla sivulla; paneeli suljetaan taustasta tai ×:stä.
function rrow(b){return '<a class="rrow" href="#k-'+esc(b.id)+'" data-id="'+esc(b.id)+'" onclick="kortille(event,this.dataset.id)"><span>'+esc(b.title||b.url)+'</span><em>'+esc(host(b.url))+'</em></a>'}
let kId=null;
async function kortille(e,id){e.preventDefault();
 if(!state.items.some(x=>x.id===id)){const r=await fetch('/ui/bookmark/'+encodeURIComponent(id));if(!r.ok)return;const b=await r.json();
  state.items.push(b);state.items.sort((a,c)=>String(c.saved_at).localeCompare(String(a.saved_at)))}
 kId=id;paivitaK();$('#ks').hidden=false;document.body.style.overflow='hidden';$('#ks .kp').scrollTop=0}
// Paneelin kortti piirretään uudelleen aina kun lista piirretään (Tutki, tila).
function paivitaK(){if(!kId)return;const b=state.items.find(x=>x.id===kId);if(!b){suljeK();return}$('#ksis').innerHTML=kortti(b)}
function suljeK(){$('#ks').hidden=true;kId=null;document.body.style.overflow=''}
async function haeQ(q,limit,sort){const u=new URL('/ui/search',location);u.searchParams.set('q',q);u.searchParams.set('limit',String(limit));if(sort)u.searchParams.set('sort',sort);
 const r=await fetch(u);return r.ok?(await r.json()).bookmarks:[]}
function shelf(title,count,body,cls){return body?'<section class="shelf"><div class="sh"><h2>'+title+'</h2>'+(count?'<span>'+count+'</span>':'')+'</div><div class="'+(cls||'row')+'">'+body+'</div></section>':''}
async function loadHylly(){const hy=$('#hylly'),allh=$('#allh');if(query()!==''){hy.innerHTML='';hy.hidden=true;allh.hidden=true;return}
 hy.hidden=false;allh.hidden=false;
 const [kes,kuu,per,hel,lue,tut,pk,pu]=await Promise.all([haeQ('progress:kesken',20),haeQ('has:transcript',12,'desc'),haeQ('rating:0',12,'desc'),haeQ('rating:3',12,'desc'),haeQ('media:artikkeli has:summary',5,'desc'),haeQ('research:any',50,'desc'),fetch('/ui/quiz?limit=1').then(r=>r.ok?r.json():{quizzes:[]}).catch(()=>({quizzes:[]})),fetch('/ui/purku').then(r=>r.ok?r.json():{}).catch(()=>({}))]);
 PURKU=pu;
 const tval=tut.filter(b=>b.research_status==='valmis'),tjono=tut.filter(b=>b.research_status==='pyydetty').length;
 hy.innerHTML=pkBanneri(pk.quizzes[0])+vkBanneri()+shelf('Kesken',kes.length,kes.map(b=>b.media==='kirja'?spine(b):tile(b)).join(''),'row books')
  +shelf('Tutkimukset',tjono?tjono+' tutkittavana'+purkuNappi():'',tlista(tval,tjono),'list')
  +shelf('Kuuntele ja katso','',kuu.map(tile).join(''))
  +shelf('Perehdy',per.length,per.map(tile).join(''))
  +shelf('Helmet','',hel.map(tile).join(''))
  +shelf('Luettavaa','',lue.map(rrow).join(''),'list')}
const loadKesken=loadHylly;
async function load(more){if(!more){state.cursor=null;state.items=[];loadKesken()}
 const u=new URL('/ui/search',location);u.searchParams.set('q',query());u.searchParams.set('limit','30');if(state.sort)u.searchParams.set('sort',state.sort);if(state.cursor)u.searchParams.set('cursor',state.cursor);
 const r=await fetch(u);if(r.status===401){location.href='/login';return}const d=await r.json();state.items=state.items.concat(d.bookmarks);state.cursor=d.nextCursor;render()}
function render(newId){const out=$('#out');if(!state.items.length){out.innerHTML='<div class="empty">Ei tuloksia</div>';return}
 let html='',last='';for(const b of state.items){const mo=month(b.saved_at);if(mo!==last){html+='<div class="month">'+mo+'</div>';last=mo}
 html+=kortti(b,newId)}
 if(state.cursor)html+='<button class="more" onclick="load(true)">Näytä lisää</button>';out.innerHTML=html;paivitaK()}
function kortti(b,newId){return '<div class="bm'+(b.id===newId?' new':'')+'"><div class="hd">'
 +(b.image_url?'<img class="th" src="'+esc(b.image_url)+'" loading="lazy" alt="" onerror="this.remove()">'
   :b.file_key?'<div class="fico">'+FICO+'</div>':'')
 +'<div class="bd">'+(b.file_key?'<a class="t" href="'+viewUrl(b.file_key,b.title)+'">':'<a class="t" href="'+esc(b.url)+'" target="_blank" rel="noopener">')+esc(b.title||b.url)+'</a>'
 +'<div class="m">'+(b.file_key?'<span class="fsz">'+((b.files&&b.files.length>1)?b.files.length+' tiedostoa · '+koko(b.files.reduce((n,f)=>n+(f.size||0),0)):esc((b.file_type||'').split('/').pop().slice(0,12))+' · '+koko(b.file_size||0))+'</span>':'<span>'+esc(host(b.url))+'</span>')
 +pvm(b)+mediaSel(b)+pgSel(b)+(b.media==='kirja'&&!b.file_key?'':stTag(b.status))
 +b.lists.map(l=>'<span class="tag">'+esc(l)+'</span>').join('')+'</div></div></div>'
 +(b.summary?'<div class="s">'+esc(b.summary)+'</div>'
    :(b.description?'<div class="d">'+esc(b.description)+'</div>':''))
 +'<div class="ft" data-id="'+esc(b.id)+'"><button class="pz'+(b.rating===0?' on':'')+'" onclick="rate(this,0)" title="Lukematta — palaa tähän ja perehdy">Perehdy</button><div class="stars">'
 +[1,2,3].map(n=>'<button class="'+((b.rating||0)>=n?'on':'')+'" onclick="rate(this,'+n+')" aria-label="Arvio '+n+'">'+STAR+'</button>').join('')
 +'</div><span class="lbl">'+(b.rating!=null?LBL[b.rating]:'arvioi')+'</span><span class="sp"></span>'
 +(b.research_status==='valmis'?'':'<button class="q'+(b.research_status==='pyydetty'?' tk':'')+'" onclick="tutki(this)" title="Tee tästä tutkimus: käsitteet, teoria, vastaavat, oppimispolku ja lisälukemista">'+(b.research_status==='pyydetty'?'Tutkittavana':'Tutki')+'</button>')
 +'<button class="q" onclick="kysyK(this)" title="Avaa Claude-keskustelu tästä lähteestä">Kysy</button><button class="q" onclick="poimi(this)" title="Tallenna lause tai ajatus poimintoihin">Poiminta</button><button class="q" onclick="del(this)">Poista</button></div>'
 +((b.files&&(b.files.length>1||(!b.file_key&&b.files.length)))?'<div class="gal">'+b.files.map(f=>
   f.type.indexOf('image/')===0
    ?'<a href="'+viewUrl(f.key,f.name)+'" title="'+esc(f.name)+'"><img src="/file/'+esc(f.key)+'" loading="lazy" alt=""></a>'
    :'<a class="doc" href="'+viewUrl(f.key,f.name)+'" title="'+esc(f.name)+'">'+esc(f.name.split('.').pop().toUpperCase().slice(0,5))+'</a>'
  ).join('')+'</div>':'')
 +(b.media==='kirja'?'<a class="lit" href="/kirja/'+esc(b.id)+'">'+BOOK+'Kirjamuistio<span>'+(b.recall?'jatka':'aloita')+'</span></a>':'')
+(b.research_status==='valmis'?'<a class="lit" href="/tutkimus/'+esc(b.id)+'">'+TUTKI+'Tutkimus<span>avaa</span></a>':'')
+(b.transcript_words?'<a class="lit" href="/litteraatti/'+esc(b.id)+'">'+LIT+'Koko litteraatti<span>'+Math.max(1,Math.round(b.transcript_words/230))+' min</span></a>':'')
+(b.note?'<details><summary>'+CHEV+'Kortti</summary><pre>'+esc(b.note)+'</pre></details>':'')
 +(luettava(b)?'<a class="lit" href="/lue/'+esc(b.id)+'">'+LIT+'Lue ja korosta<span>'+Math.max(1,Math.round(b.excerpt.length/1300))+' min</span></a>':'')
 +'</div>'}
async function init(){const ls=(await (await fetch('/ui/lists')).json()).lists;const st=await (await fetch('/ui/stats')).json();
 const r3=st.byRating&&st.byRating['3']||0,r2=st.byRating&&st.byRating['2']||0,r0=st.byRating&&st.byRating['0']||0,inb=st.byStatus.inbox||0;
 $('#stats').textContent=st.total+' tallennusta · '+(st.byStatus.kortitettu||0)+' korttia · '+r3+(r3===1?' helmi · ':' helmeä · ')+r2+' hyvää'+(r0?' · '+r0+' perehdittävää':'')+(inb?' · '+inb+' käsittelemättä':'');
 const nav=$('#lists');const mk=(label,on)=>{const b=document.createElement('button');b.textContent=label;b.onclick=()=>{on();[...nav.children].forEach(x=>x.classList.remove('on'));b.classList.add('on');load(false)};return b};
 const nollaa=()=>{state.list='';state.status='';state.rating='';state.progress='';state.sort=''};
 nav.appendChild(mk('Kaikki',()=>nollaa())).classList.add('on');
 const kesk=st.byProgress&&st.byProgress.kesken||0;
 if(kesk)nav.appendChild(mk('Kesken ('+kesk+')',()=>{nollaa();state.progress='progress:kesken'}));
 nav.appendChild(mk('Parhaat',()=>{nollaa();state.rating='rating:2+';state.sort='rating'}));
 nav.appendChild(mk('Perehdy',()=>{nollaa();state.rating='rating:0'}));
 nav.appendChild(mk('Arvioimatta',()=>{nollaa();state.rating='-has:rating'}));
 nav.appendChild(mk('Kortitetut',()=>{nollaa();state.status='kortitettu'}));
 if(inb)nav.appendChild(mk('Käsittelemättä',()=>{nollaa();state.status='inbox'}));
 for(const l of ls)nav.appendChild(mk(l.name,()=>{nollaa();state.list=l.name}));
 // Mediatyyppi on oma rivinsä ja yhdistyy yllä olevaan suodattimeen.
 const mnav=$('#media');const bm=st.byMedia||{};
 const mm=(label,val)=>{const b=document.createElement('button');b.textContent=label;if(state.media===val)b.classList.add('on');b.onclick=()=>{state.media=val;[...mnav.children].forEach(x=>x.classList.remove('on'));b.classList.add('on');load(false)};return b};
 mnav.appendChild(mm('Kaikki tyypit',''));
 for(const k of Object.keys(MEDIA_MON))if(bm[k])mnav.appendChild(mm(MEDIA_MON[k]+' '+bm[k],k));
 let t;$('#q').addEventListener('input',e=>{clearTimeout(t);t=setTimeout(()=>{state.q=e.target.value;load(false)},250)});load(false);dropInit()}
init();
</script></body></html>`;

// Poiminnat-sivu: lainauskokoelma ja "mitä jäi mieleen".
// Huom: sivun skriptissä ei käytetä ${ } -lausekkeita eikä kenoviivoja,
// koska koko sivu on TypeScriptin template-literaali.
const QUOTES_PAGE = `<!doctype html><html lang="fi"><head><meta charset="utf-8">${ICON_LINKS}<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="color-scheme" content="light dark"><title>Poiminnat · Lukupino</title><style>${CSS}</style></head>
<body>
<header>
 <div class="bar">
  <a class="brand" href="/">Lukupino</a>
  <div class="search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"></circle><path d="M20 20l-4.3-4.3"></path></svg><input id="qs" type="search" placeholder="Hae poiminnoista" autocomplete="off"></div>
  <a class="btn" href="/" style="text-decoration:none" title="Takaisin tallennuksiin"><span>Tallennukset</span><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"></path></svg></a>
 </div>
</header>
<main>
 <section class="daily" id="daily" hidden></section>
 <section class="compose">
  <textarea id="ctext" placeholder="Mitä jäi mieleen? Lause, ajatus tai oivallus — omin sanoin."></textarea>
  <div class="row"><input id="cwho" type="text" placeholder="Mistä tai keneltä (valinnainen)" autocomplete="off"><button class="btn pri" id="csave" type="button">Tallenna</button></div>
  <div class="msg" id="cmsg" style="font-size:12.5px;color:var(--mut);margin-top:4px"></div>
 </section>
 <nav class="tabs" id="tabs"></nav>
 <div id="out"></div>
</main>
<script>
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const STAR='<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5L2.6 9.4l6.5-.9z"></path></svg>';
let st={filter:'kaikki',q:'',offset:0,items:[],recall:[],more:false,counts:null};
function meta(x){const p=[];
 if(x.kind==='oma')p.push('<span class="chip">Omat sanat</span>');
 if(x.who)p.push(esc(x.who));
 if(x.title)p.push('<a href="'+esc(x.url||'#')+'" target="_blank" rel="noopener">'+esc(x.title)+'</a>');
 if(x.at)p.push(x.transcript_words&&x.bookmark_id&&x.at.split(':').length>1?'<a href="/litteraatti/'+esc(x.bookmark_id)+'#t='+x.at.split(':').reduce((a,v)=>a*60+(Number(v)||0),0)+'" title="Avaa litteraatissa">'+esc(x.at)+'</a>':esc(x.at));
 if(x.bookmark_id&&x.media==='kirja')p.push('<a href="/kirja/'+esc(x.bookmark_id)+'" title="Avaa kirjamuistio">kirjamuistio</a>');
 else if(x.kind==='korostus'&&x.bookmark_id&&!x.at&&!x.transcript_words)p.push('<a href="/lue/'+esc(x.bookmark_id)+'" title="Avaa jutussa">jutussa</a>');
 return p.join('<span aria-hidden="true">·</span>')}
function qtext(x){return x.kind==='oma'?esc(x.text):'“'+esc(x.text)+'”'}
function card(x){return '<div class="qt'+(x.kind==='oma'?' oma':'')+'" data-id="'+esc(x.id)+'"><p class="tx serif">'+qtext(x)+'</p>'
 +'<div class="mt">'+meta(x)+'</div><div class="ac"><button class="qstar'+(x.starred?' on':'')+'" onclick="star(this)" aria-label="Tähti">'+STAR+'</button><span class="sp"></span><button class="q" onclick="delq(this)">Poista</button></div></div>'}
function recallCard(r){return '<div class="qt oma"><p class="tx">'+esc(r.recall)+'</p><div class="mt"><span class="chip">Omin sanoin</span><a href="'+esc(r.url)+'" target="_blank" rel="noopener">'+esc(r.title||r.url)+'</a></div></div>'}
function tabs(){const c=st.counts||{kaikki:0,tahti:0,omat:0};const T=[['kaikki','Kaikki',c.kaikki],['tahti','Tähdellä',c.tahti],['omat','Mitä jäi mieleen',c.omat]];
 $('#tabs').innerHTML=T.map(t=>'<button class="'+(st.filter===t[0]?'on':'')+'" onclick="setf(&quot;'+t[0]+'&quot;)">'+t[1]+' <span style="opacity:.6">'+t[2]+'</span></button>').join('')}
function render(){let h='';
 if(st.filter==='omat'&&st.recall.length)h+=st.recall.map(recallCard).join('');
 h+=st.items.map(card).join('');
 if(!h)h='<div class="empty">'+(st.q?'Ei osumia.':st.filter==='omat'?'Tänne kertyy se mitä kirjoitat itse: yllä olevasta kentästä tai kortin Poiminta-napista.':st.filter==='tahti'?'Merkitse tähdellä ne jotka haluat pitää lähellä.':'Ei vielä poimintoja.')+'</div>';
 if(st.more)h+='<button class="more" onclick="load(true)">Näytä lisää</button>';
 $('#out').innerHTML=h;tabs()}
function daily(d){const el=$('#daily');if(!d||st.q||st.filter!=='kaikki'){el.hidden=true;return}
 el.hidden=false;el.innerHTML='<div class="k">Päivän poiminta</div><blockquote class="serif">'+qtext(d)+'</blockquote><div class="mt">'+meta(d)+'</div>'}
async function load(more){if(!more){st.offset=0;st.items=[]}
 const u='/ui/quotes?filter='+st.filter+'&q='+encodeURIComponent(st.q)+'&offset='+st.offset;
 const d=await (await fetch(u)).json();
 st.items=st.items.concat(d.quotes);if(!more)st.recall=d.recall||[];st.more=d.more;st.offset+=d.quotes.length;st.counts=d.counts;
 if(!more)daily(d.daily);render()}
function setf(f){st.filter=f;load(false)}
async function star(b){const c=b.closest('.qt'),on=!b.classList.contains('on');b.classList.toggle('on',on);
 const r=await fetch('/ui/quotes/'+c.dataset.id+'/star',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({starred:on})});
 if(!r.ok){b.classList.toggle('on',!on);return}
 const x=st.items.find(i=>i.id===c.dataset.id);if(x)x.starred=on;if(st.counts)st.counts.tahti+=on?1:-1;tabs()}
async function delq(b){if(!b.classList.contains('arm')){b.classList.add('arm');b.textContent='Varmasti?';setTimeout(()=>{b.classList.remove('arm');b.textContent='Poista'},4000);return}
 const c=b.closest('.qt');const r=await fetch('/ui/quotes/'+c.dataset.id+'/delete',{method:'POST'});
 if(r.ok){st.items=st.items.filter(i=>i.id!==c.dataset.id);c.remove();if(st.counts)st.counts.kaikki--;tabs()}}
$('#csave').onclick=async()=>{const t=$('#ctext').value.trim();if(!t)return;$('#csave').disabled=true;
 let r;try{r=await fetch('/ui/quotes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:t,who:$('#cwho').value.trim()})})}catch{r=null}
 $('#csave').disabled=false;if(!r||!r.ok){$('#cmsg').textContent='Ei onnistunut';return}
 $('#ctext').value='';$('#cwho').value='';$('#cmsg').textContent='Tallennettu.';setTimeout(()=>$('#cmsg').textContent='',2000);
 st.filter='omat';load(false)};
let tq;$('#qs').addEventListener('input',e=>{clearTimeout(tq);tq=setTimeout(()=>{st.q=e.target.value.trim();load(false)},250)});
load(false);
</script>
</body></html>`;

const TRANSCRIPT_PAGE = transcriptPage(CSS);
const READER_PAGE = readerPage(CSS);
const BOOK_PAGE = bookPage(CSS);
const RESEARCH_PAGE = researchPage(CSS);
const QUIZ_PAGE = quizPage(CSS);
