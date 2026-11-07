// REST-rajapinta iOS Shortcutille, migraatiolle ja varmuuskopiolle.
// Auth: Authorization: Bearer <CAPTURE_TOKEN>. Token voi vain lisätä/lukea, ei OAuthia.

import { Hono, type Context } from "hono";
import { Db, MAX_EXCERPT, newId, parseMedia, parseProgress, parseRating, type Bookmark, type FileRef, type Rating, type Source, type Status } from "./db";
import { readSession } from "./session";
import { fetchMeta, noFetchReason, norm } from "./fetchmeta";
import { addQuote, exportQuotes, syncQuotesFromNote } from "./quotes";
import { MAX_TRANSCRIPT, deleteTranscript, getTranscript, markUnavailable, putTranscript } from "./transcripts";
import { MAX_RESEARCH, getResearch, markResearchFailed, putResearch, requestResearch, wantsResearch } from "./research";
import { MAX_FEEDBACK, createQuiz, dueRepeats, getQuiz, listQuizzes, putFeedback } from "./pistokoe";
import { MAX_FILE_BYTES, deleteFile, disposition, getFile, guessType, isImage, isReadableDoc, migrateFileToR2, newFileKey, putFile, storageBackend, isolationHeaders } from "./files";

type Bindings = Env;

export const api = new Hono<{ Bindings: Bindings }>();

function bearer(req: Request): string | null {
	const h = req.headers.get("authorization") ?? "";
	const m = /^Bearer\s+(.+)$/i.exec(h);
	return m ? m[1].trim() : null;
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let r = 0;
	for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return r === 0;
}

// Jokainen vastaus sisältää `message`-kentän suomeksi, myös virheet. Syy on
// iOS-oikopolku: Shortcuts EI tulkitse HTTP-virhekoodeja virheiksi, joten
// kiinteä "✓ tallennettu" -ilmoitus näyttäisi onnistumista myös silloin kun
// pyyntö epäonnistui. Kun ilmoitus lukee tämän kentän, se ei voi valehdella.
api.use("/api/*", async (c, next) => {
	const tok = bearer(c.req.raw);
	if (!tok || !c.env.CAPTURE_TOKEN || !timingSafeEqual(tok, c.env.CAPTURE_TOKEN)) {
		return c.json({ error: "unauthorized", message: "✗ Tunnistautuminen epäonnistui — tarkista Authorization-otsikko" }, 401);
	}
	await next();
});

const TAHDET = ["· perehdy", "⭐", "⭐⭐", "⭐⭐⭐"];

/** Tallenna metatiedot taustalla vastauksen jälkeen (ei viivytä Shortcuttia). */
export async function enrichInBackground(db: Db, env: Env, id: string, url: string, hasText: boolean): Promise<void> {
	const why = noFetchReason(url);
	if (why) {
		await db.update(id, { status: hasText ? "noudettu" : "ei-noudettavissa", fetch_note: hasText ? null : why });
		return;
	}
	const meta = await fetchMeta(url, env);
	const b = await db.get(id);
	if (!b) return;
	// Osoite ei ollutkaan sivu vaan dokumentti (PDF ym.). Otetaan tavut
	// talteen, jolloin linkitetty PDF käyttäytyy kuin itse tallennettu:
	// näkyy kortilla, säilyy vaikka lähde katoaa, ja rutiini lukee siitä
	// tekstin. Ilman tätä kortille jäi pelkkä osoite — mitattu 20.9.2026.
	if (meta.contentType && !b.file_key && isReadableDoc(meta.contentType)) {
		const saved = await storeRemoteDocument(db, env, b, meta.contentType);
		if (saved) return;
	}
	await db.update(id, {
		title: b.title ?? meta.title,
		description: b.description ?? meta.description,
		image_url: b.image_url ?? meta.image,
		excerpt: b.excerpt ?? meta.excerpt ?? null,
		status: meta.ok || hasText ? "noudettu" : "ei-noudettavissa",
		// oEmbed-lähteillä (YouTube, Spotify) note kertoo mitä jäi saamatta,
		// vaikka nouto onnistui — siksi note kirjataan myös ok-tapauksessa.
		fetch_note: meta.ok ? meta.note : meta.note,
	});
}

/**
 * GET tai POST /api/add — Shortcut.
 *
 * Kaksi tapaa antaa tiedot, jotta iOS-oikopolku pysyy yksinkertaisena:
 *   1. Kyselyparametrit:  /api/add?source=app&rating=2&url=…  (ei runkoa, url VIIMEISENÄ)
 *   2. JSON-runko:        {url, title?, text?, source?, rating?, lists?}
 *
 * `rating`: 0 perehdy (lukematta) · 1 kelpaa · 2 hyvä · 3 helmi. Jakovalikon
 * vaihtoehdot eroavat vain tästä numerosta.
 *
 * Kyselyparametrit ovat olemassa siksi, että Shortcutsissa muuttujan
 * pudottaminen JSON-merkkijonon lainausmerkkien väliin on käsin tehtynä
 * virhealtista — URL-osoitteen loppuun liittäminen ei ole. Pitkä sivuteksti
 * kuuluu silti runkoon, koska osoitteen pituus on rajallinen.
 */
/**
 * GET on tuettu POSTin rinnalla 13.9.2026 yhdestä käytännön syystä: iOS
 * Shortcutsin POST vaatii *Pyynnön runko* -asetuksen, ja väärä valinta
 * (Tiedosto tyhjällä syötteellä) kaataa pyynnön Cloudflaren reunalla ennen
 * Workeria — oire on puhelimessa "Verkkoyhteys katkesi" eikä pyyntö näy
 * edes `wrangler tail`issa. GETillä runkoa ei ole, joten koko virheluokka
 * katoaa ja oikopolku toimii toiminnon oletusasetuksilla.
 *
 * Mutaatio GETin takana on tietoinen poikkeus: tämä on henkilökohtainen
 * capture-pääte bearer-tokenin takana, ei julkinen API. Vastaus on
 * `no-store`, jottei välimuisti näytä vanhaa tulosta.
 */
/**
 * Siivoa liitetty osoite. Palauttaa null jos siitä ei saa kelvollista.
 *
 * Tämä on olemassa siksi, että selaus-UI:n kenttä oli `type="url"`, ja
 * selaimen oma kelpoisuustarkistus **esti lähetyksen kokonaan** ennen kuin
 * mikään koodi ehti ajautua: ei pyyntöä, ei virhettä, ei riviä kantaan.
 * Oire oli "ei tapahdu mitään". Kenttä on nyt `type="text"` ja tarkistus
 * tehdään täällä, missä siitä voi kertoa suomeksi.
 *
 * Kolme yleisintä tapausta joissa selain sanoi ei:
 *   1. puuttuva skeema — `www.example.com/x.pdf` liitettynä asiakirjasta
 *   2. välilyönnit ja skandit — suomalaisissa PDF-linkeissä tavallista
 *   3. ylimääräiset rivinvaihdot tai lainausmerkit liitettäessä
 */
export function siivoaOsoite(raw: string): string | null {
	let t = raw.trim().replace(/^["'<]+|["'>]+$/g, "").replace(/\s+/g, " ").trim();
	if (!t) return null;
	if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) t = `https://${t}`;
	for (const ehdokas of [t, encodeURI(t)]) {
		try {
			const u = new URL(ehdokas);
			if (/^https?:$/.test(u.protocol) && u.hostname.includes(".")) return u.toString();
		} catch {
			/* kokeillaan seuraava muoto */
		}
	}
	return null;
}

const addHandler = async (c: Context<{ Bindings: Bindings }>) => {
	const db = new Db(c.env.DB);
	const q = c.req.query();
	// `url` luetaan raakana osoitteesta eikä jäsennetyistä parametreista, koska
	// tallennettava osoite voi itse sisältää &-merkkejä (YouTube-soittolistat,
	// seurantaparametrit). Siksi sen on oltava VIIMEINEN parametri: kaikki sen
	// jälkeen tuleva kuuluu arvoon. Näin iOS-oikopolku voi liittää osoitteen
	// perään sellaisenaan ilman erillistä koodausvaihetta.
	const rawQs = c.req.url;
	const at = rawQs.indexOf("url=");
	let qUrl = at >= 0 ? rawQs.slice(at + 4) : "";
	if (qUrl && !/^https?:\/\//i.test(qUrl)) {
		try {
			qUrl = decodeURIComponent(qUrl); // prosenttikoodattu muoto käy myös
		} catch {
			/* jätetään raakana, URL-jäsennys kertoo virheen alla */
		}
	}
	let body: { url?: string; title?: string; text?: string; source?: Source; rating?: number; lists?: string[] } = {};
	if (!qUrl) {
		try {
			body = await c.req.json();
		} catch {
			// Tyhjä url ja tyhjä runko = jaettiin jotain, jossa ei ole osoitetta.
			// Tavallisin syy: kuva tai PDF jaettiin linkkioikopolulla, jonka
			// "Hae URLit syötteestä" ei löydä siitä mitään (todettu 8.10.2026).
			return c.json(
				{
					error: "no url in shared content",
					message: "✗ Tästä ei löytynyt linkkiä. Kuvat ja PDF:t: jaa oikopolulla Lukupino tiedosto",
				},
				400,
			);
		}
	}
	const rawUrl = qUrl || body.url;
	if (!rawUrl) return c.json({ error: "url required", message: "✗ Osoite puuttui" }, 400);
	const url = siivoaOsoite(rawUrl);
	if (!url) {
		return c.json({ error: "invalid url", message: "✗ Osoite ei kelpaa" }, 400);
	}
	body = {
		...body,
		title: q.title ?? body.title,
		text: q.text ?? body.text,
		source: (q.source as Source) ?? body.source,
		rating: q.rating !== undefined ? (wantsResearch(q.rating) ? 4 : parseRating(q.rating) ?? undefined) : body.rating,
	};
	const text = body.text?.trim() || null;
	const [bm, created] = await db.create({
		url,
		title: body.title || null,
		excerpt: text ? text.slice(0, MAX_EXCERPT) : null,
		source: body.source ?? "api",
		status: "inbox",
		rating: parseRating(body.rating),
		lists: body.lists ?? [],
	});
	// Jo olemassa oleva kirjanmerkki: arvio päivittyy, jotta saman linkin voi
	// jakaa uudelleen eri numerolla kun on lukenut sen.
	const newRating = parseRating(body.rating);
	if (!created && newRating !== null && newRating !== bm.rating) await db.update(bm.id, { rating: newRating });
	// 4 ei ole arvosana vaan toimeksianto: tee tästä tutkimus (research.ts).
	const tutki = wantsResearch(body.rating) ? await requestResearch(c.env.DB, bm.id, true) : null;
	if (created) c.executionCtx.waitUntil(enrichInBackground(db, c.env, bm.id, bm.url, !!text));
	const r = newRating ?? bm.rating;
	const tahdet = r != null ? ` ${TAHDET[r]}` : "";
	const lisa = tutki === "pyydetty" ? " · tutkitaan" : tutki === "valmis" ? " · tutkimus on jo valmis" : "";
	const message = (created ? `✓ Tallennettu lukupinoon${tahdet}` : `↻ Oli jo tallessa${tahdet}`) + lisa;
	c.header("Cache-Control", "no-store");
	return c.json({ id: bm.id, url: bm.url, created, title: bm.title, rating: r, message }, created ? 201 : 200);
};
api.post("/api/add", addHandler);
api.get("/api/add", addHandler);

/** Osoitteen viimeinen osa tiedostonimeksi, prosenttikoodaus purettuna. */
function fileNameFromUrl(url: string, type: string): string {
	try {
		const last = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() ?? "");
		if (last) return last.slice(0, 200);
	} catch {
		/* alla varanimi */
	}
	return `dokumentti.${(type.split("/").pop() ?? "bin").slice(0, 8)}`;
}

/**
 * Nouda linkitetty dokumentti ja tallenna se kuten ladattu tiedosto.
 * Palauttaa false jos se ei onnistu — silloin kutsuja jatkaa normaalisti.
 */
async function storeRemoteDocument(db: Db, env: Env, b: Bookmark, type: string): Promise<boolean> {
	try {
		const res = await fetch(b.url, { headers: { "user-agent": "Mozilla/5.0 (compatible; lukupino/1.0)" }, signal: AbortSignal.timeout(20_000) });
		if (!res.ok) return false;
		const len = Number(res.headers.get("content-length") ?? 0);
		if (len > MAX_FILE_BYTES) {
			await db.update(b.id, {
				title: b.title ?? fileNameFromUrl(b.url, type),
				status: "ei-noudettavissa",
				fetch_note: `dokumentti liian suuri talteen (${(len / 1048576).toFixed(1).replace(".", ",")} Mt), linkki toimii`,
			});
			return true;
		}
		const bytes = await res.arrayBuffer();
		if (bytes.byteLength > MAX_FILE_BYTES) return false;
		const name = fileNameFromUrl(b.url, type);
		const key = newFileKey(b.id, name);
		await putFile(env, key, bytes, { name, type });
		await db.update(b.id, {
			title: b.title ?? name,
			file_key: key,
			file_type: type,
			file_size: bytes.byteLength,
			files: [{ key, name, type, size: bytes.byteLength }],
			// Teksti luetaan rutiinilla: PDF:n jäsentäminen ei mahdu 10 ms:n CPU-rajaan.
			status: "inbox",
			fetch_note: "dokumentti noudettu linkistä — teksti luetaan /lukupino-rikasta-rutiinilla",
		});
		return true;
	} catch {
		return false;
	}
}

/**
 * Yhteinen tiedoston vastaanotto: käytössä sekä selaus-UI:sta
 * (`POST /ui/upload`, istuntoeväste) että API:sta (`POST /api/upload`,
 * bearer). Ottaa multipart-lomakkeen kentän `file`.
 *
 * Tiedostolle syntyy oikea, avautuva osoite `<host>/file/<avain>`, joten
 * se käyttäytyy kuten mikä tahansa kirjanmerkki: sama dedup, sama haku,
 * sama arvio. Kuva saa itsensä kansikuvaksi.
 */
export async function receiveUpload(
	env: Env,
	reqUrl: string,
	form: FormData,
	source: Source,
): Promise<{ status: number; body: Record<string, unknown> }> {
	// Kaikki lomakkeen tiedostot kuuluvat YHTEEN tallennukseen: kuusi
	// näyttökuvaa samasta asiasta on yksi nosto, ei kuutta kirjanmerkkiä.
	// Erillisiksi ne saa antamalla ne eri kerroilla.
	const picked = form.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
	if (!picked.length) return { status: 400, body: { error: "Tiedosto puuttui" } };
	const liian = picked.find((f) => f.size > MAX_FILE_BYTES);
	if (liian) {
		return { status: 413, body: { error: `${liian.name || "Tiedosto"} on liian suuri (${(liian.size / 1048576).toFixed(1).replace(".", ",")} Mt). Raja on ${MAX_FILE_BYTES / 1048576} Mt.` } };
	}
	const db = new Db(env.DB);
	const annetut = form.getAll("name").map(String);
	const id = newId();
	const files: FileRef[] = [];
	for (const [i, f] of picked.entries()) {
		// Puhelimen kuvavalitsin antaa joskus tyhjän nimen — varanimi pitää
		// päätteen mukana, jotta tyyppi ja avain pysyvät oikeina.
		const type = guessType(f.name || annetut[i] || "", f.type);
		const name = (annetut[i] || f.name || `kuva-${i + 1}.${(type.split("/").pop() ?? "bin").slice(0, 8)}`).slice(0, 200);
		const key = newFileKey(newId(), name);
		await putFile(env, key, await f.arrayBuffer(), { name, type });
		files.push({ key, name, type, size: f.size });
	}
	const first = files[0];
	const kuvia = files.filter((f) => isImage(f.type)).length;
	const kaikkiKuvia = kuvia === files.length;
	const title = files.length === 1 ? first.name : `${files.length} ${kaikkiKuvia ? "kuvaa" : "tiedostoa"}`;
	const url = new URL(`/file/${first.key}`, reqUrl).toString();
	const luettavia = files.some((f) => isReadableDoc(f.type));
	const [bm, created] = await db.create({
		url,
		title,
		source,
		// Kuva on itsessään sisältö. Dokumentista teksti luetaan rutiinilla,
		// ei täällä: PDF:n jäsentäminen ei mahdu 10 ms:n CPU-rajaan.
		status: kaikkiKuvia ? "noudettu" : luettavia ? "inbox" : "ei-noudettavissa",
		fetch_note: kaikkiKuvia ? null : luettavia ? "tiedosto — teksti luetaan /lukupino-rikasta-rutiinilla" : `tiedosto (${first.type})`,
		image_url: isImage(first.type) ? url : null,
		file_key: first.key,
		file_type: first.type,
		file_size: first.size,
		files,
		rating: parseRating(form.get("rating")),
	});
	const tahdet = bm.rating != null ? ` ${TAHDET[bm.rating]}` : "";
	const montako = files.length > 1 ? ` (${files.length})` : "";
	const tutki = wantsResearch(form.get("rating")) && (await requestResearch(env.DB, bm.id, true)) === "pyydetty" ? " · tutkitaan" : "";
	return {
		status: created ? 201 : 200,
		body: { id: bm.id, url: bm.url, created, title: bm.title, bookmark: bm, message: (created ? `✓ Tallennettu lukupinoon${montako}${tahdet}` : `↻ Oli jo tallessa${tahdet}`) + tutki },
	};
}

api.post("/api/upload", async (c) => {
	const r = await receiveUpload(c.env, c.req.url, await c.req.formData(), "app");
	return c.json(r.body, r.status as 200 | 201 | 400 | 413);
});

/**
 * GET /file/:key — tallennettu tiedosto. Tämä reitti on api-routerissa,
 * mutta se EI ole `/api/*`-polulla eikä siis bearer-vartioinnin takana:
 * pääsy tarkistetaan tässä erikseen, koska kuvan pitää näkyä selaus-UI:n
 * <img>-elementissä, joka ei voi lähettää otsikoita. Istuntoeväste kelpaa,
 * bearer myös.
 */
api.get("/file/:key{.+}", async (c) => {
	const ok =
		(await readSession(c.req.raw, c.env.COOKIE_ENCRYPTION_KEY)) !== null ||
		(() => {
			const t = bearer(c.req.raw);
			return !!t && !!c.env.CAPTURE_TOKEN && timingSafeEqual(t, c.env.CAPTURE_TOKEN);
		})();
	if (!ok) return c.json({ error: "unauthorized" }, 401);
	const f = await getFile(c.env, c.req.param("key"));
	if (!f) return c.json({ error: "not found" }, 404);
	return new Response(f.body, {
		headers: {
			"content-type": f.type,
			"content-disposition": disposition(f.name, f.type),
			"cache-control": "private, max-age=86400",
			...isolationHeaders(f.type),
		},
	});
});

/** POST /api/files/migrate — siirrä kaikki KV:n tiedostot R2:een. Idempotentti. */
api.post("/api/files/migrate", async (c) => {
	if (storageBackend(c.env) !== "r2") return c.json({ error: "R2-bindingia ei ole — lisää se wrangler.jsonc:hen ja deployaa" }, 400);
	const db = new Db(c.env.DB);
	const all = await db.exportAll();
	const moved: string[] = [], skipped: string[] = [];
	for (const b of all.bookmarks) {
		if (!b.file_key) continue;
		(await migrateFileToR2(c.env, b.file_key)) ? moved.push(b.id) : skipped.push(b.id);
	}
	return c.json({ backend: "r2", moved: moved.length, skipped: skipped.length, skippedIds: skipped });
});
api.get("/api/files/backend", async (c) => c.json({ backend: storageBackend(c.env) }));

/**
 * Poisto on yksi paikka, koska sitä kutsutaan kolmesta: selaus-UI, MCP ja
 * (tarvittaessa) API. 20.9.2026 löytyi kolme orpoa tiedostoa KV:stä — MCP:n
 * delete-bookmark poisti vain rivin. Tavut lähtevät nyt aina mukana.
 */
export async function deleteBookmark(env: Env, id: string): Promise<boolean> {
	const db = new Db(env.DB);
	const b = await db.get(id);
	if (!b) return false;
	const ok = await db.delete(id);
	if (ok) {
		// Lähteen poiminnat lähtevät kirjanmerkin mukana, omat sanat jäävät.
		await env.DB.batch([
			env.DB.prepare("DELETE FROM quotes WHERE bookmark_id = ? AND kind = 'lahde' AND starred = 0").bind(id),
			env.DB.prepare("UPDATE quotes SET bookmark_id = NULL WHERE bookmark_id = ?").bind(id),
			env.DB.prepare("DELETE FROM transcripts WHERE bookmark_id = ?").bind(id),
			env.DB.prepare("DELETE FROM research WHERE bookmark_id = ?").bind(id),
		]);
	}
	if (ok) {
		const keys = b.files.length ? b.files.map((f) => f.key) : b.file_key ? [b.file_key] : [];
		for (const k of keys) await deleteFile(env, k);
	}
	return ok;
}

/**
 * POST /api/enrich — aja Workerin oma metatietonouto uudelleen annetuille
 * id:ille. Tarvitaan kun nouto paranee (esim. Spotifyn RSS-reitti 13.9.2026)
 * ja vanhat tallennukset halutaan samalle tasolle. Enintään 20 kerralla,
 * työ tehdään taustalla — vastaus tulee heti.
 *
 * Body: {ids: string[], force?: boolean, feeds?: {"<ohjelman nimi>": "<rss-url>"}}.
 * force=true tyhjentää otsikon, kuvauksen, otteen ja kuvan ennen noutoa.
 * `feeds` esitäyttää podcast-syötteiden välimuistin: iTunes vastaa
 * Cloudflaren osoitteista usein 429, mutta rutiini voi hakea syötteen
 * omasta osoitteestaan ja antaa sen tässä.
 */
api.post("/api/enrich", async (c) => {
	const db = new Db(c.env.DB);
	const body = (await c.req.json()) as { ids?: string[]; force?: boolean; feeds?: Record<string, string> };
	for (const [name, url] of Object.entries(body.feeds ?? {})) {
		if (/^https?:\/\//.test(url)) await c.env.OAUTH_KV.put(`podfeed:${norm(name)}`, url, { expirationTtl: 30 * 86400 });
	}
	const ids = (body.ids ?? []).slice(0, 20);
	const queued: string[] = [];
	for (const id of ids) {
		const b = await db.get(id);
		if (!b) continue;
		if (body.force) await db.update(id, { title: null, description: null, excerpt: null, image_url: null, fetch_note: null });
		c.executionCtx.waitUntil(enrichInBackground(db, c.env, id, b.url, !!(b.excerpt && !body.force)));
		queued.push(id);
	}
	return c.json({ queued });
});

/**
 * POST /api/update — joukkopäivitys id:n perusteella.
 *
 * Olemassa rikastusta varten: `/api/import` luo vain uutta eikä kosketa
 * olemassa olevaa, ja 182 kirjanmerkin tiivistäminen yksi MCP-kutsu
 * kerrallaan on hidasta. Tämä ottaa enintään 100 kerralla.
 *
 * Body: {updates:[{id, summary?, excerpt?, title?, status?, fetchNote?, rating?, lists?}]}
 */
api.post("/api/update", async (c) => {
	const db = new Db(c.env.DB);
	const body = (await c.req.json()) as {
		updates?: Array<{ id: string; summary?: string; excerpt?: string; title?: string; description?: string; note?: string | null; recall?: string | null; imageUrl?: string | null; mediaUrl?: string | null; status?: Status; fetchNote?: string | null; rating?: number; lists?: string[]; media?: string; progress?: string | null }>;
	};
	const ups = (body.updates ?? []).slice(0, 100);
	// Listat luodaan ensin, jotta niihin voi liittää samassa erässä.
	for (const name of new Set(ups.flatMap((u) => u.lists ?? []))) await db.ensureList(name);
	let updated = 0;
	const missing: string[] = [];
	for (const u of ups) {
		const patch: Parameters<Db["update"]>[1] = {};
		if (u.description !== undefined) patch.description = u.description;
		if (u.note !== undefined) patch.note = u.note;
		if (u.recall !== undefined) patch.recall = u.recall;
		if (u.imageUrl !== undefined) patch.image_url = u.imageUrl;
		if (u.mediaUrl !== undefined) patch.media_url = u.mediaUrl;
		if (u.summary !== undefined) patch.summary = u.summary;
		if (u.excerpt !== undefined) patch.excerpt = u.excerpt;
		if (u.title !== undefined) patch.title = u.title;
		if (u.fetchNote !== undefined) patch.fetch_note = u.fetchNote;
		if (u.rating !== undefined) patch.rating = parseRating(u.rating);
		if (u.lists !== undefined) patch.lists = u.lists;
		if (u.media !== undefined && parseMedia(u.media)) patch.media = parseMedia(u.media)!;
		if (u.progress !== undefined) patch.progress = parseProgress(u.progress);
		if (u.status) patch.status = u.status;
		const b = await db.update(u.id, patch);
		if (b) updated++;
		else missing.push(u.id);
		// Litteraatin POIMINNAT-osio → poimintakokoelma, ks. quotes.ts.
		if (b && u.note !== undefined) await syncQuotesFromNote(c.env.DB, u.id, u.note);
	}
	return c.json({ updated, missing });
});

/** POST /api/import — bulk. Body: {bookmarks:[{url,title,description,excerpt,summary,note,saved_at,source,status,lists}], lists:[{name,icon}]} */
api.post("/api/import", async (c) => {
	const db = new Db(c.env.DB);
	const body = (await c.req.json()) as {
		bookmarks?: Array<{
			url: string;
			title?: string | null;
			description?: string | null;
			excerpt?: string | null;
			summary?: string | null;
			note?: string | null;
			saved_at?: string;
			status?: Status;
			rating?: number;
			lists?: string[];
		}>;
		lists?: Array<{ name: string; icon?: string | null }>;
	};
	for (const l of body.lists ?? []) await db.ensureList(l.name, l.icon ?? null);
	let created = 0,
		skipped = 0,
		failed = 0;
	const errors: string[] = [];
	for (const b of body.bookmarks ?? []) {
		try {
			const hasContent = !!(b.excerpt || b.note || b.summary);
			const status: Status = b.status ?? (b.note ? "kortitettu" : hasContent ? "noudettu" : noFetchReason(b.url) ? "ei-noudettavissa" : "inbox");
			const [existing, wasCreated] = await db.create({
				...b,
				source: "import",
				status,
				rating: parseRating(b.rating),
				fetch_note: status === "ei-noudettavissa" ? noFetchReason(b.url) : null,
			});
			if (wasCreated) created++;
			else {
				// Sama URL jo olemassa (esim. Karakeepissa kahdesti): yhdistä listat, täydennä tyhjät kentät.
				skipped++;
				const patch: Parameters<Db["update"]>[1] = {};
				const mergedLists = [...new Set([...existing.lists, ...(b.lists ?? [])])];
				if (mergedLists.length !== existing.lists.length) patch.lists = mergedLists;
				if (!existing.note && b.note) patch.note = b.note;
				if (!existing.summary && b.summary) patch.summary = b.summary;
				if (!existing.excerpt && b.excerpt) patch.excerpt = b.excerpt;
				if (!existing.title && b.title) patch.title = b.title;
				if (Object.keys(patch).length) await db.update(existing.id, patch);
			}
		} catch (e) {
			failed++;
			if (errors.length < 20) errors.push(`${b.url}: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
	return c.json({ created, skipped, failed, errors });
});

/** GET /api/export — koko kanta JSON:na (varmuuskopio repoon). */
api.get("/api/export", async (c) => {
	const db = new Db(c.env.DB);
	const data = await db.exportAll();
	return c.json({ exportedAt: new Date().toISOString(), ...data, quotes: await exportQuotes(c.env.DB) });
});

/**
 * POST /api/quotes — lisää poimintoja suoraan. Body: {quotes:[{text, bookmarkId?, who?, at?, kind?}]}.
 * POST /api/quotes/sync — poimi lainaukset uudelleen annettujen kirjanmerkkien
 * noteista (enintään 50). Body: {ids: string[]}. Käytetään takautuvaan täyttöön.
 */
api.post("/api/quotes", async (c) => {
	const body = (await c.req.json()) as { quotes?: Array<{ text?: string; bookmarkId?: string; who?: string; at?: string; kind?: "lahde" | "oma" }> };
	let added = 0;
	for (const q of (body.quotes ?? []).slice(0, 200)) {
		if (!q.text?.trim()) continue;
		await addQuote(c.env.DB, { text: q.text, bookmark_id: q.bookmarkId, who: q.who, at: q.at, kind: q.kind ?? "oma" });
		added++;
	}
	return c.json({ added });
});
api.post("/api/quotes/sync", async (c) => {
	const db = new Db(c.env.DB);
	const body = (await c.req.json()) as { ids?: string[] };
	let quotes = 0;
	const synced: string[] = [];
	for (const id of (body.ids ?? []).slice(0, 50)) {
		const b = await db.get(id);
		if (!b) continue;
		quotes += await syncQuotesFromNote(c.env.DB, id, b.note);
		synced.push(id);
	}
	return c.json({ synced: synced.length, quotes });
});

/**
 * POST /api/transcript — koko litteraatti kirjanmerkille (skills/litteroi/koko.py).
 * Body: {id, text, source?}. Korvaa aiemman. `text: ""` poistaa.
 * {id, unavailable: "<syy>"} merkitsee, ettei litteraattia saa (words = 0).
 * GET /api/transcript/:id — litteraatti takaisin, esim. tarkistukseen.
 */
api.post("/api/transcript", async (c) => {
	const b = (await c.req.json().catch(() => ({}))) as { id?: string; text?: string; source?: string; unavailable?: string };
	if (b.id && b.unavailable) {
		return (await markUnavailable(c.env.DB, b.id, b.unavailable)) ? c.json({ id: b.id, words: 0, unavailable: b.unavailable }) : c.json({ error: "not found" }, 404);
	}
	if (!b.id || typeof b.text !== "string") return c.json({ error: "Anna id ja text" }, 400);
	if (b.text.length > MAX_TRANSCRIPT) return c.json({ error: `Liian pitkä (yli ${MAX_TRANSCRIPT} merkkiä)` }, 413);
	if (!b.text.trim()) {
		await deleteTranscript(c.env.DB, b.id);
		return c.json({ id: b.id, deleted: true });
	}
	const words = await putTranscript(c.env.DB, b.id, b.text.trim(), b.source ?? null);
	return words === false ? c.json({ error: "not found" }, 404) : c.json({ id: b.id, words });
});
api.get("/api/transcript/:id", async (c) => {
	const t = await getTranscript(c.env.DB, c.req.param("id"));
	return t ? c.json(t) : c.json({ error: "not found" }, 404);
});

/**
 * POST /api/research — tutkimus kirjanmerkille (skills/lukupino-tutki).
 * Body: {id, text} tallentaa markdownin ja merkitsee valmiiksi ·
 * {id, failed: "<syy>"} ei onnistunut · {id, request: true|false} pyytää tai
 * peruu (force: true uusii valmiin). GET /api/research/:id — teksti takaisin.
 * Jono: /api/export, research_status = "pyydetty".
 */
api.post("/api/research", async (c) => {
	const b = (await c.req.json().catch(() => ({}))) as { id?: string; text?: string; failed?: string; request?: boolean; force?: boolean };
	if (!b.id) return c.json({ error: "Anna id" }, 400);
	if (typeof b.request === "boolean") {
		const st = await requestResearch(c.env.DB, b.id, b.request, !!b.force);
		return st === undefined ? c.json({ error: "not found" }, 404) : c.json({ id: b.id, research_status: st });
	}
	if (b.failed) return (await markResearchFailed(c.env.DB, b.id, b.failed)) ? c.json({ id: b.id, research_status: "ei-onnistu" }) : c.json({ error: "not found" }, 404);
	if (typeof b.text !== "string" || !b.text.trim()) return c.json({ error: "Anna text, failed tai request" }, 400);
	if (b.text.length > MAX_RESEARCH) return c.json({ error: `Liian pitkä (yli ${MAX_RESEARCH} merkkiä)` }, 413);
	return (await putResearch(c.env.DB, b.id, b.text.trim())) ? c.json({ id: b.id, research_status: "valmis", chars: b.text.trim().length }) : c.json({ error: "not found" }, 404);
});
api.get("/api/research/:id", async (c) => {
	const r = await getResearch(c.env.DB, c.req.param("id"));
	return r ? c.json(r) : c.json({ error: "not found" }, 404);
});

/**
 * Pistokoe (skills/lukupino-pistokoe). POST /api/quiz {title, scope?, items:
 * [{statement, correct, explanation, bookmark_id?, anchor?, kind?, view?,
 * repeat_of?}]} luo kokeen · GET /api/quiz lista · GET /api/quiz/kertaus
 * kerrattavat · GET /api/quiz/:id väitteet vastauksineen ·
 * POST /api/quiz/:id/feedback {text} palaute.
 */
api.post("/api/quiz", async (c) => {
	const r = await createQuiz(c.env.DB, (await c.req.json().catch(() => ({}))) as Parameters<typeof createQuiz>[1]);
	if ("error" in r) return c.json(r, 400);
	return c.json({ ...r, url: new URL(`/pistokoe/${r.id}`, c.req.url).toString() }, 201);
});
api.get("/api/quiz", async (c) => c.json({ quizzes: await listQuizzes(c.env.DB, Number(c.req.query("limit") ?? 20) || 20) }));
api.get("/api/quiz/kertaus", async (c) => c.json({ items: await dueRepeats(c.env.DB, Number(c.req.query("days") ?? 10) || 10, Number(c.req.query("limit") ?? 6) || 6) }));
api.get("/api/quiz/:id", async (c) => {
	const g = await getQuiz(c.env.DB, c.req.param("id"));
	return g ? c.json(g) : c.json({ error: "not found" }, 404);
});
api.post("/api/quiz/:id/feedback", async (c) => {
	const b = (await c.req.json().catch(() => ({}))) as { text?: string };
	if (typeof b.text !== "string" || !b.text.trim()) return c.json({ error: "Anna text" }, 400);
	if (b.text.length > MAX_FEEDBACK) return c.json({ error: `Liian pitkä (yli ${MAX_FEEDBACK} merkkiä)` }, 413);
	return (await putFeedback(c.env.DB, c.req.param("id"), b.text.trim())) ? c.json({ id: c.req.param("id"), feedback: true }) : c.json({ error: "not found" }, 404);
});

api.get("/api/stats", async (c) => c.json(await new Db(c.env.DB).counts()));
api.get("/api/lists", async (c) => c.json({ lists: await new Db(c.env.DB).lists() }));
