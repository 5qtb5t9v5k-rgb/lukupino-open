// Poiminnat: lainauskokoelma ja "mitä jäi mieleen".
//
// Lähteen poiminnat syntyvät itsestään litteraatin POIMINNAT-osiosta
// (`h:mm:ss – "lainaus"`), kun note kirjoitetaan `/api/update`:lla. Omat
// poiminnat omistaja kirjoittaa selaus-UI:ssa. Tähti ja omat säilyvät aina,
// vaikka litteraatti kirjoitettaisiin uudelleen.

import { newId, nowIso } from "./db";

/** lahde = noten POIMINNAT-osiosta · oma = omin sanoin · korostus = omistaja korosti litteraatista */
export type QuoteKind = "lahde" | "oma" | "korostus";

export interface Quote {
	id: string;
	bookmark_id: string | null;
	text: string;
	who: string | null;
	at: string | null;
	kind: QuoteKind;
	starred: boolean;
	created_at: string;
	// liitetty lähteestä listauksessa
	title?: string | null;
	url?: string | null;
	transcript_words?: number | null;
	media?: string | null;
}

const MAX_TEXT = 2000;

/**
 * Poimi lainaukset noten POIMINNAT-osiosta. Muoto on litterointiohjeen
 * mukainen: `0:03:18 – "lainaus"` tai kirjan sivulta `s. 176 – "lainaus"`,
 * valinnaisesti `– Puhuja: "lainaus"`.
 * Rivit joilta ei löydy lainausmerkeissä olevaa tekstiä ohitetaan.
 */
export function extractQuotes(note: string | null | undefined): Array<{ text: string; at: string | null; who: string | null }> {
	if (!note) return [];
	const parts = note.split(/^(?:##\s*)?POIMINNAT\s*$/im);
	if (parts.length < 2) return [];
	const section = parts[1].split(/^#/m)[0];
	const out: Array<{ text: string; at: string | null; who: string | null }> = [];
	for (const raw of section.split("\n")) {
		const line = raw.trim().replace(/^[-*•]\s*/, "");
		if (!line) continue;
		// Kohta on aikaleima (videot) tai sivunumero (kirjan sivun kuva): "s. 176".
		const m = /^(?:(\d{1,2}:\d{2}(?::\d{2})?|s\.\s?\d{1,4}(?:[–-]\d{1,4})?)\s*[–—-]\s*)?(?:([^"“”:]{2,60}?):\s*)?["“](.+?)["”]\s*$/.exec(line);
		if (!m) continue;
		const text = m[3].trim();
		if (text.length < 8) continue;
		out.push({ text: text.slice(0, MAX_TEXT), at: m[1] ?? null, who: m[2]?.trim() || null });
	}
	return out;
}

function rowToQuote(r: Record<string, unknown>): Quote {
	return {
		id: String(r.id),
		bookmark_id: (r.bookmark_id as string) ?? null,
		text: String(r.text),
		who: (r.who as string) ?? null,
		at: (r.at as string) ?? null,
		kind: (r.kind as QuoteKind) ?? "lahde",
		starred: Number(r.starred) === 1,
		created_at: String(r.created_at),
		title: (r.title as string) ?? null,
		url: (r.url as string) ?? null,
		transcript_words: (r.transcript_words as number) ?? null,
		media: (r.media as string) ?? null,
	};
}

/**
 * Kirjoita kirjanmerkin lähdepoiminnat uudelleen noten perusteella.
 * Tähdellä merkityt säilyvät (tunnistetaan tekstistä), omat eivät koske.
 */
export async function syncQuotesFromNote(d1: D1Database, bookmarkId: string, note: string | null | undefined): Promise<number> {
	const found = extractQuotes(note);
	const starred = await d1
		.prepare("SELECT text FROM quotes WHERE bookmark_id = ? AND kind = 'lahde' AND starred = 1")
		.bind(bookmarkId)
		.all();
	const keep = new Set((starred.results as Array<{ text: string }>).map((r) => r.text));
	const stmts = [d1.prepare("DELETE FROM quotes WHERE bookmark_id = ? AND kind = 'lahde' AND starred = 0").bind(bookmarkId)];
	const now = nowIso();
	for (const q of found) {
		if (keep.has(q.text)) continue;
		stmts.push(
			d1
				.prepare("INSERT INTO quotes (id, bookmark_id, text, who, at, kind, starred, created_at) VALUES (?, ?, ?, ?, ?, 'lahde', 0, ?)")
				.bind(newId(), bookmarkId, q.text, q.who, q.at, now),
		);
	}
	await d1.batch(stmts);
	return found.length;
}

export async function addQuote(
	d1: D1Database,
	input: { text: string; bookmark_id?: string | null; who?: string | null; at?: string | null; kind?: QuoteKind },
): Promise<Quote> {
	const q: Quote = {
		id: newId(),
		bookmark_id: input.bookmark_id || null,
		text: input.text.trim().slice(0, MAX_TEXT),
		who: input.who?.trim() || null,
		at: input.at || null,
		kind: input.kind ?? "oma",
		starred: false,
		created_at: nowIso(),
	};
	await d1
		.prepare("INSERT INTO quotes (id, bookmark_id, text, who, at, kind, starred, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)")
		.bind(q.id, q.bookmark_id, q.text, q.who, q.at, q.kind, q.created_at)
		.run();
	return q;
}

export async function listQuotes(
	d1: D1Database,
	opts: { filter?: "kaikki" | "tahti" | "omat"; q?: string; limit?: number; offset?: number },
): Promise<Quote[]> {
	const where: string[] = [];
	const binds: unknown[] = [];
	if (opts.filter === "tahti") where.push("q.starred = 1");
	if (opts.filter === "omat") where.push("q.kind = 'oma'");
	if (opts.q?.trim()) {
		where.push("(q.text LIKE ? OR q.who LIKE ? OR b.title LIKE ?)");
		const like = `%${opts.q.trim()}%`;
		binds.push(like, like, like);
	}
	const limit = Math.min(Math.max(opts.limit ?? 60, 1), 200);
	const r = await d1
		.prepare(
			`SELECT q.*, b.title AS title, b.url AS url, b.transcript_words AS transcript_words, b.media AS media FROM quotes q LEFT JOIN bookmarks b ON b.id = q.bookmark_id
			 ${where.length ? "WHERE " + where.join(" AND ") : ""}
			 ORDER BY q.starred DESC, q.created_at DESC, q.rowid ASC LIMIT ? OFFSET ?`,
		)
		.bind(...binds, limit, opts.offset ?? 0)
		.all();
	return (r.results as Record<string, unknown>[]).map(rowToQuote);
}

/** Päivän poiminta: sama koko päivän, tähdellä merkityistä jos niitä on. */
export async function quoteOfTheDay(d1: D1Database, day: string): Promise<Quote | null> {
	for (const where of ["WHERE q.starred = 1", ""]) {
		const n = (await d1.prepare(`SELECT COUNT(*) AS n FROM quotes q ${where}`).first<{ n: number }>())?.n ?? 0;
		if (!n) continue;
		let h = 0;
		for (const c of day) h = (h * 31 + c.charCodeAt(0)) >>> 0;
		const r = await d1
			.prepare(`SELECT q.*, b.title AS title, b.url AS url, b.transcript_words AS transcript_words, b.media AS media FROM quotes q LEFT JOIN bookmarks b ON b.id = q.bookmark_id ${where} ORDER BY q.id LIMIT 1 OFFSET ?`)
			.bind(h % n)
			.first();
		return r ? rowToQuote(r as Record<string, unknown>) : null;
	}
	return null;
}

export async function setStar(d1: D1Database, id: string, starred: boolean): Promise<boolean> {
	const r = await d1.prepare("UPDATE quotes SET starred = ? WHERE id = ?").bind(starred ? 1 : 0, id).run();
	return (r.meta.changes ?? 0) > 0;
}

export async function deleteQuote(d1: D1Database, id: string): Promise<boolean> {
	const r = await d1.prepare("DELETE FROM quotes WHERE id = ?").bind(id).run();
	return (r.meta.changes ?? 0) > 0;
}

export async function quoteCounts(d1: D1Database): Promise<{ kaikki: number; tahti: number; omat: number; lahteita: number }> {
	const r = await d1
		.prepare(
			"SELECT COUNT(*) AS kaikki, SUM(starred) AS tahti, SUM(kind = 'oma') AS omat, COUNT(DISTINCT bookmark_id) AS lahteita FROM quotes",
		)
		.first<{ kaikki: number; tahti: number; omat: number; lahteita: number }>();
	return { kaikki: r?.kaikki ?? 0, tahti: r?.tahti ?? 0, omat: r?.omat ?? 0, lahteita: r?.lahteita ?? 0 };
}

export async function exportQuotes(d1: D1Database): Promise<Quote[]> {
	const r = await d1.prepare("SELECT * FROM quotes ORDER BY created_at, rowid").all();
	return (r.results as Record<string, unknown>[]).map(rowToQuote);
}
