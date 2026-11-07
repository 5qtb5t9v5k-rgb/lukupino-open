// Kevyt sivun metatietojen nouto. Tarkoituksella vain regex — Workerin ilmaistaso
// antaa 10 ms CPU:ta per pyyntö, joten HTML:ää ei jäsennetä. Syvempi ote
// (excerpt) haetaan Claude-rutiinilla (/lukupino-rikasta), ei täällä.

import { clip } from "./db";

/** Domainit joista konesalista ei saa sisältöä ilman kirjautumista tai selainta.
 *  Mitattu 27.8.2026: X antaa tyhjän og:descriptionin, Reddit 403, Spotify pelkän sivukehyksen. */
export const NO_FETCH_DOMAINS: Record<string, string> = {
	"x.com": "X vaatii kirjautumisen ja selainrenderöinnin",
	"twitter.com": "X vaatii kirjautumisen ja selainrenderöinnin",
	"reddit.com": "Reddit estää konesalin IP:t (403)",
	"instagram.com": "Instagram vaatii kirjautumisen",
	"facebook.com": "Facebook vaatii kirjautumisen",
	"linkedin.com": "LinkedIn vaatii kirjautumisen",
};

export function noFetchReason(url: string): string | null {
	try {
		const host = new URL(url).hostname.replace(/^(www|m|open|old)\./, "");
		for (const [d, why] of Object.entries(NO_FETCH_DOMAINS)) {
			if (host === d || host.endsWith("." + d)) return why;
		}
	} catch {
		return "virheellinen URL";
	}
	return null;
}

export interface Meta {
	title: string | null;
	description: string | null;
	/** Pidempi sisältö silloin kun lähde antaa sen suoraan (esim. jakson show notes RSS:stä). */
	excerpt?: string | null;
	/** Vastauksen content-type, kun osoite ei ollutkaan HTML-sivu (PDF, kuva, …). */
	contentType?: string | null;
	image: string | null;
	ok: boolean;
	note: string | null;
}

/**
 * oEmbed-palvelut. YouTube ja Spotify eivät anna og-tageja konesalista —
 * YouTube vastaa evästekyselyllä (myös WebFetchille) ja Spotifyn
 * og:description on pelkkä "Podcast · Episode". Molemmilla on kuitenkin
 * avaimeton oEmbed-pääte joka antaa otsikon ja kansikuvan. Mitattu 13.9.2026.
 *
 * Kuvausta oEmbed ei anna kummastakaan: se vaatisi YouTube Data API:n tai
 * Spotify Web API:n avaimen.
 */
const OEMBED: Array<{ hosts: string[]; endpoint: (u: string) => string }> = [
	{ hosts: ["youtube.com", "youtu.be"], endpoint: (u) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}` },
	{ hosts: ["spotify.com"], endpoint: (u) => `https://open.spotify.com/oembed?url=${encodeURIComponent(u)}` },
];

function oembedEndpoint(url: string): string | null {
	try {
		const host = new URL(url).hostname.replace(/^(www|m|open)\./, "");
		for (const o of OEMBED) {
			if (o.hosts.some((d) => host === d || host.endsWith("." + d))) return o.endpoint(url);
		}
	} catch {
		return null;
	}
	return null;
}

function youtubeId(url: string): string | null {
	try {
		const u = new URL(url);
		if (u.hostname.endsWith("youtu.be")) return u.pathname.slice(1).split("/")[0] || null;
		const v = u.searchParams.get("v");
		if (v) return v;
		const m = /\/(shorts|embed|live)\/([^/?#]+)/.exec(u.pathname);
		return m?.[2] ?? null;
	} catch {
		return null;
	}
}

function spotifyId(url: string): { type: string; id: string } | null {
	try {
		const m = /\/(episode|show|track|album|playlist)\/([A-Za-z0-9]+)/.exec(new URL(url).pathname);
		return m ? { type: m[1], id: m[2] } : null;
	} catch {
		return null;
	}
}

/** YouTube Data API v3. videos.list maksaa 1 yksikön; ilmaiskiintiö 10 000/pv. */
async function youtubeDescription(url: string, key: string, signal: AbortSignal): Promise<string | null> {
	const id = youtubeId(url);
	if (!id) return null;
	const ep = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`;
	const res = await fetch(ep, { headers: { accept: "application/json" }, signal });
	if (!res.ok) return null;
	const j = (await res.json()) as { items?: Array<{ snippet?: { description?: string } }> };
	return j.items?.[0]?.snippet?.description?.trim() || null;
}

/**
 * Spotify Web API, client credentials. Token elää tunnin, joten se
 * välimuistitetaan KV:hen — muuten jokainen tallennus tekisi kaksi kutsua.
 */
async function spotifyToken(env: Env, signal: AbortSignal): Promise<string | null> {
	if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) return null;
	const cached = await env.OAUTH_KV.get("spotify:token");
	if (cached) return cached;
	const res = await fetch("https://accounts.spotify.com/api/token", {
		method: "POST",
		headers: {
			authorization: "Basic " + btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`),
			"content-type": "application/x-www-form-urlencoded",
		},
		body: "grant_type=client_credentials",
		signal,
	});
	if (!res.ok) return null;
	const j = (await res.json()) as { access_token?: string; expires_in?: number };
	if (!j.access_token) return null;
	await env.OAUTH_KV.put("spotify:token", j.access_token, { expirationTtl: Math.max((j.expires_in ?? 3600) - 120, 60) });
	return j.access_token;
}

/** Normalisointi otsikkovertailuun: pienet kirjaimet, ei välimerkkejä, yksi väli. */
export function norm(t: string): string {
	return t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function stripHtml(h: string): string {
	return decodeEntities(h.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/**
 * Spotify-jakso ilman avainta: Spotify on vain jakelukanava, jakso on
 * julkinen ohjelman RSS-syötteessä (areas.yaml → sources_notes.podcast).
 * Ketju: Spotify-sivun og:description antaa ohjelman nimen → iTunes-haku
 * antaa syötteen → syötteestä jakso TARKALLA otsikolla. Mitattu 13.9.2026:
 * Sijoituskästi-jakso löytyi 2 865 merkin kuvauksella, kestolla ja MP3:lla.
 *
 * Osumasuoja on tarkoituksella tiukka: ohjelman nimen ja jakson otsikon on
 * täsmättävä normalisoituna. Väärä jakso on huonompi kuin ei jaksoa.
 * Syötteestä luetaan enintään 600 kt — jaksot ovat uusin ensin, ja
 * tallennettu jakso on lähes aina tuore.
 */
/**
 * Ohjelman nimi → RSS-syöte. iTunes on kattavin (löytää suomalaisetkin),
 * mutta vastaa Cloudflaren jaetuista osoitteista usein 429 — mitattu
 * 13.9.2026, myös yksittäiselle pyynnölle. Siksi:
 *   1. KV-välimuisti 30 pv, avain podfeed:<normalisoitu nimi>. Rutiini voi
 *      esitäyttää sen omasta osoitteestaan (/api/enrich, `feeds`).
 *   2. iTunes, yksi uusinta 429:n jälkeen.
 *   3. gpodder.net — toimii englanninkielisille, ei löytänyt suomalaisia.
 */
export async function podcastFeedUrl(show: string, env: Env, signal: AbortSignal): Promise<{ feedUrl: string; via: string } | { fail: string }> {
	const key = `podfeed:${norm(show)}`;
	const cached = await env.OAUTH_KV.get(key);
	if (cached) return { feedUrl: cached, via: "välimuisti" };
	const ns = norm(show);
	const pick = (rs: Array<{ name: string; url: string }>) =>
		rs.find((r) => norm(r.name) === ns) ??
		rs.find((r) => norm(r.name).includes(ns) || ns.includes(norm(r.name))) ??
		(rs.length === 1 ? rs[0] : undefined);
	const fails: string[] = [];
	for (let attempt = 0; attempt < 2; attempt++) {
		const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(show)}&entity=podcast&limit=5`, { headers: { accept: "application/json" }, signal });
		if (res.status === 429 && attempt === 0) {
			await new Promise((r) => setTimeout(r, 1500));
			continue;
		}
		if (!res.ok) {
			fails.push(`itunes ${res.status}`);
			break;
		}
		const j = (await res.json()) as { results?: Array<{ collectionName?: string; feedUrl?: string }> };
		const hit = pick((j.results ?? []).filter((r) => r.collectionName && r.feedUrl).map((r) => ({ name: r.collectionName!, url: r.feedUrl! })));
		if (hit) {
			await env.OAUTH_KV.put(key, hit.url, { expirationTtl: 30 * 86400 });
			return { feedUrl: hit.url, via: "itunes" };
		}
		fails.push(`itunes: ei osumaa nimelle "${show}"`);
		break;
	}
	try {
		const g = await fetch(`https://gpodder.net/search.json?q=${encodeURIComponent(show)}`, { headers: { accept: "application/json", "user-agent": "lukupino/1.0" }, signal });
		if (g.ok) {
			const arr = (await g.json()) as Array<{ title?: string; url?: string }>;
			const hit = pick(arr.filter((r) => r.title && r.url).map((r) => ({ name: r.title!, url: r.url! })));
			if (hit) {
				await env.OAUTH_KV.put(key, hit.url, { expirationTtl: 30 * 86400 });
				return { feedUrl: hit.url, via: "gpodder" };
			}
			fails.push("gpodder: ei osumaa");
		} else fails.push(`gpodder ${g.status}`);
	} catch {
		fails.push("gpodder: virhe");
	}
	return { fail: fails.join(", ") };
}

async function spotifyViaRss(url: string, title: string, env: Env, signal: AbortSignal): Promise<{ description: string; note: string } | { fail: string }> {
	const it = spotifyId(url);
	if (!it || it.type !== "episode") return { fail: "ei jakso" };
	// Spotify antaa og-tagit VAIN botilta näyttävälle tunnisteelle; Safari-
	// tunnisteelle tulee tyhjä JS-sivu ilman metatietoja. Mitattu 13.9.2026.
	const page = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (compatible; lukupino/1.0)", accept: "text/html" }, signal });
	if (!page.ok) return { fail: `spotify-sivu HTTP ${page.status}` };
	const html = await readHead(page);
	const ogd = metaContent(html, ["og:description"]) ?? "";
	const show = ogd.split("·")[0].trim();
	if (!show || show.length < 2) return { fail: `og:description ei anna ohjelmaa (${ogd.slice(0, 40)})` };
	// Ohjelman nimi on vain HAKUAVAIN — varsinainen osumasuoja on jakson
	// otsikko alempana. Spotifyn og-tagi antaa joskus tekijän nimen ohjelman
	// sijaan (mitattu: "Chamath Palihapitiya" → All-In).
	const dir = await podcastFeedUrl(show, env, signal);
	if ("fail" in dir) return { fail: dir.fail };
	const feed = await fetch(dir.feedUrl, { headers: { "user-agent": UA, accept: "application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.5" }, signal });
	if (!feed.ok) return { fail: `syöte HTTP ${feed.status}` };
	const reader = feed.body?.getReader();
	if (!reader) return { fail: "syöte tyhjä" };
	const dec = new TextDecoder();
	let xml = "";
	const want = norm(title);
	let found: string | null = null;
	let seen = 0;
	while (xml.length < 600_000) {
		const { done, value } = await reader.read();
		if (done) break;
		xml += dec.decode(value, { stream: true });
		let m: RegExpExecArray | null;
		const rx = /<item>([\s\S]*?)<\/item>/g;
		let lastEnd = 0;
		while ((m = rx.exec(xml))) {
			lastEnd = rx.lastIndex;
			seen++;
			const t = norm(stripHtml(/<title>([\s\S]*?)<\/title>/.exec(m[1])?.[1] ?? ""));
			// Tarkka osuma, tai etuliite kun toinen on toisen alku ja yhteinen osa
			// on vähintään 25 merkkiä — syöteotsikossa on usein vieraan nimi perässä.
			const pre = Math.min(t.length, want.length);
			if (t === want || (pre >= 25 && (t.startsWith(want) || want.startsWith(t)))) {
				found = m[1];
				break;
			}
		}
		if (found) break;
		xml = xml.slice(lastEnd); // jo käsitellyt jaksot pois muistista
	}
	try {
		await reader.cancel();
	} catch {}
	if (!found) return { fail: `syötteestä ei löytynyt jaksoa "${title.slice(0, 40)}" (luettu ${seen} jaksoa)` };
	const rawDesc =
		/<content:encoded>([\s\S]*?)<\/content:encoded>/.exec(found)?.[1] ??
		/<description>([\s\S]*?)<\/description>/.exec(found)?.[1] ??
		/<itunes:summary>([\s\S]*?)<\/itunes:summary>/.exec(found)?.[1] ??
		"";
	const description = stripHtml(rawDesc);
	if (description.length < 40) return { fail: "jakso löytyi mutta kuvaus tyhjä" };
	const dur = /<itunes:duration>([^<]+)<\/itunes:duration>/.exec(found)?.[1]?.trim();
	const mp3 = /<enclosure[^>]*url="([^"]+)"/.exec(found)?.[1];
	const note = [`kuvaus RSS-syötteestä (${dir.via})`, decodeEntities(show), dur ? `kesto ${dur}` : null, mp3 ? "mp3 saatavilla" : null].filter(Boolean).join(" · ");
	return { description, note };
}

async function spotifyDescription(url: string, env: Env, signal: AbortSignal): Promise<string | null> {
	const it = spotifyId(url);
	if (!it || !["episode", "show"].includes(it.type)) return null;
	const tok = await spotifyToken(env, signal);
	if (!tok) return null;
	const res = await fetch(`https://api.spotify.com/v1/${it.type}s/${it.id}?market=FI`, {
		headers: { authorization: `Bearer ${tok}`, accept: "application/json" },
		signal,
	});
	if (!res.ok) return null;
	const j = (await res.json()) as { description?: string };
	return j.description?.trim() || null;
}

async function fetchOembed(url: string, endpoint: string, env: Env, signal: AbortSignal): Promise<Meta> {
	const res = await fetch(endpoint, { headers: { "user-agent": UA, accept: "application/json" }, signal });
	if (!res.ok) return { title: null, description: null, image: null, ok: false, note: `oEmbed HTTP ${res.status}` };
	const j = (await res.json()) as { title?: string; author_name?: string; provider_name?: string; thumbnail_url?: string };
	const title = clip(j.title ?? null, 300);
	// Kuvausta ei ole — tekijä on ainoa lisätieto jonka oEmbed antaa.
	const who = [j.author_name, j.provider_name].filter(Boolean).join(" · ");
	const image = clip(j.thumbnail_url ?? null, 1000);
	// Jos API-avain on asetettu, haetaan oikea kuvaus. Ilman avainta
	// jäädään oEmbedin varaan, ja silloin ok on tarkoituksella false:
	// status kertoo SISÄLLÖSTÄ, eikä oEmbed anna sitä. Otsikko ja kansikuva
	// kirjoitetaan silti, joten selatessa näkyy mistä on kyse.
	let real: string | null = null;
	let rssFail: string | null = null;
	try {
		const host = new URL(url).hostname;
		if (/youtube\.com$|youtu\.be$/.test(host.replace(/^(www|m)\./, "")) && env.YOUTUBE_API_KEY) {
			real = await youtubeDescription(url, env.YOUTUBE_API_KEY, signal);
		} else if (/spotify\.com$/.test(host.replace(/^(www|open)\./, ""))) {
			// RSS ensin (ei avainta, pisin kuvaus), Web API toisena jos avain on.
			const rss = title ? await spotifyViaRss(url, title, env, signal) : { fail: "ei otsikkoa" };
			if ("description" in rss) return { title, description: clip(rss.description, 600), excerpt: clip(rss.description, 3000), image, ok: true, note: rss.note };
			rssFail = rss.fail;
			real = await spotifyDescription(url, env, signal);
		}
	} catch (e) {
		real = null; // avain väärin, kiintiö täynnä tai syöte ei vastaa — oEmbed riittää silti
		rssFail = rssFail ?? `virhe: ${e instanceof Error ? e.name + " " + e.message.slice(0, 60) : String(e).slice(0, 60)}`;
	}
	if (real) {
		return { title, description: clip(real, 600), image, ok: true, note: null };
	}
	return {
		title,
		description: clip(who || null, 600),
		image,
		ok: false,
		note: title ? `oEmbed: otsikko ja kansikuva saatu, kuvaus vaatisi API-avaimen${rssFail ? ` · rss: ${rssFail}` : ""}` : "oEmbed ei palauttanut otsikkoa",
	};
}

const UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 lukupino/1.0";

function decodeEntities(s: string): string {
	return s
		.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
		.replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#?39;|&apos;/g, "'")
		.replace(/&nbsp;/g, " ");
}

function metaContent(html: string, names: string[]): string | null {
	for (const n of names) {
		// property/name ensin, content jälkeen — tai toisinpäin
		const a = new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']*)["']`, "i").exec(html);
		if (a?.[1]) return decodeEntities(a[1]);
		const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${n}["']`, "i").exec(html);
		if (b?.[1]) return decodeEntities(b[1]);
	}
	return null;
}

/** Lue vastauksen alku (≤ 256 kt tai </head> asti). */
async function readHead(res: Response): Promise<string> {
	const reader = res.body?.getReader();
	let html = "";
	if (!reader) return html;
	const dec = new TextDecoder();
	while (html.length < 262_144) {
		const { done, value } = await reader.read();
		if (done) break;
		html += dec.decode(value, { stream: true });
		if (/<\/head>/i.test(html)) break;
	}
	try {
		await reader.cancel();
	} catch {}
	return html;
}

/** <meta http-equiv="refresh" content="0;URL=..."> — esim. open.substack.com vastaa 200:lla ja ohjaa näin. */
function metaRefreshUrl(html: string, base: string): string | null {
	const m = /<meta[^>]+http-equiv=["']refresh["'][^>]*content=["'][^"']*?url=([^"'>\s]+)/i.exec(html);
	if (!m) return null;
	try {
		return new URL(decodeEntities(m[1]), base).toString();
	} catch {
		return null;
	}
}

export async function fetchMeta(url: string, env: Env, timeoutMs = 8000): Promise<Meta> {
	const why = noFetchReason(url);
	if (why) return { title: null, description: null, image: null, ok: false, note: why };
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const oe = oembedEndpoint(url);
		if (oe) {
			// oEmbed-lähteillä on oma, pidempi budjetti: Spotifyn RSS-ketju hakee
			// 1–3 Mt:n syötteen, ja 8 s ei riittänyt (mitattu 13.9.2026: 1/7).
			// Työ tehdään waitUntil-taustalla, jossa raja on 30 s.
			clearTimeout(t);
			const t2 = setTimeout(() => ctrl.abort(), 22_000);
			try {
				return await fetchOembed(url, oe, env, ctrl.signal);
			} finally {
				clearTimeout(t2);
			}
		}
		let current = url;
		for (let hop = 0; hop < 3; hop++) {
			const res = await fetch(current, {
				headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "accept-language": "fi,en;q=0.8" },
				redirect: "follow",
				signal: ctrl.signal,
			});
			const ct = res.headers.get("content-type") ?? "";
			if (!res.ok) return { title: null, description: null, image: null, ok: false, note: `HTTP ${res.status}` };
			if (!/html|xml/i.test(ct)) return { title: null, description: null, image: null, contentType: ct.split(";")[0].trim(), ok: true, note: `ei HTML (${ct.split(";")[0]})` };
			const html = await readHead(res);
			const next = metaRefreshUrl(html, current);
			if (next && next !== current && hop < 2) {
				current = next;
				continue;
			}
			const ogTitle = metaContent(html, ["og:title", "twitter:title"]);
			const tTag = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1];
			const title = clip(ogTitle || (tTag ? decodeEntities(tTag) : null), 300);
			const description = clip(metaContent(html, ["og:description", "twitter:description", "description"]), 600);
			let image: string | null = null;
			const rawImg = metaContent(html, ["og:image", "og:image:secure_url", "twitter:image"]);
			if (rawImg) {
				try {
					image = clip(new URL(rawImg, current).toString(), 1000);
				} catch {
					image = null;
				}
			}
			return { title, description, image, ok: true, note: title ? null : "sivulla ei otsikkoa" };
		}
		return { title: null, description: null, image: null, ok: false, note: "liikaa uudelleenohjauksia" };
	} catch (e) {
		const msg = e instanceof Error ? (e.name === "AbortError" ? "aikakatkaisu" : e.message) : String(e);
		return { title: null, description: null, image: null, ok: false, note: clip(msg, 200) };
	} finally {
		clearTimeout(t);
	}
}
