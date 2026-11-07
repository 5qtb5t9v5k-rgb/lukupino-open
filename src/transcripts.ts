// Koko litteraatti omassa taulussaan (migraatio 0009). Muoto on rivi per
// kappale: `[0:04:22] Puhuja: teksti`, mainoskatko `[0:22:58] [mainos]`.
// Tuottaja on skills/litteroi/koko.py. Lukunäkymä on /litteraatti/:id.

import { nowIso } from "./db";

export const MAX_TRANSCRIPT = 800_000;

export interface Transcript {
	bookmark_id: string;
	text: string;
	source: string | null;
	words: number;
	created_at: string;
}

export function countWords(text: string): number {
	// Aikaleimat ja puhujanimet eivät ole luettavaa, mutta virhe on pieni.
	return text.split(/\s+/).filter(Boolean).length;
}

export async function getTranscript(d1: D1Database, bookmarkId: string): Promise<Transcript | null> {
	const r = await d1.prepare("SELECT * FROM transcripts WHERE bookmark_id = ?").bind(bookmarkId).first();
	return (r as unknown as Transcript) ?? null;
}

/** Tallenna tai korvaa. Palauttaa false, jos kirjanmerkkiä ei ole. */
export async function putTranscript(d1: D1Database, bookmarkId: string, text: string, source: string | null): Promise<number | false> {
	const exists = await d1.prepare("SELECT 1 FROM bookmarks WHERE id = ?").bind(bookmarkId).first();
	if (!exists) return false;
	const words = countWords(text);
	await d1.batch([
		d1
			.prepare(
				`INSERT INTO transcripts (bookmark_id, text, source, words, created_at) VALUES (?, ?, ?, ?, ?)
				 ON CONFLICT(bookmark_id) DO UPDATE SET text = excluded.text, source = excluded.source, words = excluded.words, created_at = excluded.created_at`,
			)
			.bind(bookmarkId, text, source, words, nowIso()),
		d1.prepare("UPDATE bookmarks SET transcript_words = ? WHERE id = ?").bind(words, bookmarkId),
	]);
	return words;
}

/**
 * Merkitse ettei koko litteraattia saa (esim. Geminin RECITATION-suodatin).
 * transcript_words = 0 erottaa sen yrittämättömästä (NULL), joten rutiinin
 * jono D ei ota sitä uudelleen, eikä kortille tule linkkiä.
 */
export async function markUnavailable(d1: D1Database, bookmarkId: string, reason: string): Promise<boolean> {
	const r = await d1.prepare("UPDATE bookmarks SET transcript_words = 0 WHERE id = ?").bind(bookmarkId).run();
	if (!r.meta.changes) return false;
	await d1
		.prepare(
			`INSERT INTO transcripts (bookmark_id, text, source, words, created_at) VALUES (?, '', ?, 0, ?)
			 ON CONFLICT(bookmark_id) DO UPDATE SET text = '', source = excluded.source, words = 0, created_at = excluded.created_at`,
		)
		.bind(bookmarkId, `ei saatavilla: ${reason}`, nowIso())
		.run();
	return true;
}

export async function deleteTranscript(d1: D1Database, bookmarkId: string): Promise<void> {
	await d1.batch([
		d1.prepare("DELETE FROM transcripts WHERE bookmark_id = ?").bind(bookmarkId),
		d1.prepare("UPDATE bookmarks SET transcript_words = NULL WHERE id = ?").bind(bookmarkId),
	]);
}
