// MCP-työkalut. Nimet ovat samat kuin Karakeepin MCP:ssä, jotta Karakeepiä
// varten tehdyt skillit toimivat ilman muutoksia.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Db, KIRJA_OSIOT, MEDIA, PROGRESS, parseRating, parseSavedDate, type Bookmark, type Status } from "./db";
import { deleteBookmark, enrichInBackground } from "./api";
import { getTranscript } from "./transcripts";
import { MAX_RESEARCH, getResearch, markResearchFailed, putResearch, requestResearch } from "./research";
import { addQuote, syncQuotesFromNote } from "./quotes";
import { MAX_FEEDBACK, MAX_ITEMS, QUIZ_KINDS, QUIZ_VIEWS, createQuiz, getQuiz, listQuizzes, putFeedback } from "./pistokoe";
import { TEXT_ATTACH, guessType, htmlToText, newFileKey, putFile } from "./files";
import { MAX_EXCERPT, newId, type FileRef } from "./db";

// Asennuksen oma osoite linkkeihin (https://<host>). Asetetaan registerToolsissa
// pyynnön osoitteesta; tyhjä = suhteelliset polut. Sama koko isolaatille, koska
// yksi Worker palvelee yhtä asennusta.
let HOST = "";
const MAX_ATTACH_CHARS = 2_000_000;

const STATUS = z.enum(["inbox", "noudettu", "ei-noudettavissa", "kortitettu"]);
const RATING_HELP = "0 = unread, owner wants to dig into it (perehdy); 1 = kept, 2 = better than average, 3 = excellent. Use it to decide what deserves a card.";

function fmt(b: Bookmark, full = false): string {
	const lines = [
		`Bookmark ID: ${b.id}`,
		`  URL: ${b.url}`,
		`  Title: ${b.title ?? ""}`,
		`  Saved: ${b.saved_at}  Source: ${b.source}  Status: ${b.status}${b.fetch_note ? ` (${b.fetch_note})` : ""}`,
		`  Rating: ${b.rating === 0 ? "0 (perehdy — unread, to dig into)" : b.rating ? `${b.rating}/3` : "not rated"}`,
		`  Media: ${b.media}${b.progress ? `  Progress: ${b.progress}` : ""}`,
		`  Lists: ${b.lists.join(", ") || "-"}`,
		`  Has note: ${b.note ? "yes" : "no"}  Has recall: ${b.recall ? "yes" : "no"}  Excerpt chars: ${b.excerpt?.length ?? 0}`,
	];
	if (b.files.length && (!b.file_key || b.files.length > 1)) lines.push(`  Attachments: ${b.files.map((f) => f.name).join(", ")}`);
	if (b.research_status === "valmis") lines.push(`  Research: ready — read it with get-research (${HOST}/tutkimus/${b.id})`);
	else if (b.research_status === "pyydetty") lines.push("  Research: requested by the owner, not written yet (see the lukupino-tutki skill)");
	else if (b.research_status === "ei-onnistu") lines.push("  Research: could not be done (get-research gives the reason)");
	if (b.transcript_words) lines.push(`  Full transcript: ${b.transcript_words} words — read it with get-transcript`);
	else if (b.transcript_words === 0) lines.push("  Full transcript: not available (Gemini refused verbatim text, RECITATION)");
	if (b.description) lines.push(`  Description: ${b.description}`);
	if (b.summary) lines.push(`  Summary: ${b.summary}`);
	if (full) {
		if (b.recall) lines.push(`  Recall (owner's own words, written without looking at the source — never overwrite):\n${b.recall}`);
		if (b.excerpt) lines.push(`  Excerpt:\n${b.excerpt}`);
		if (b.note) lines.push(`  Note:\n${b.note}`);
	}
	return lines.join("\n");
}

/** Lisää rivi noten "## Muistiinpanot"-osion loppuun; luo osion noten loppuun, jos sitä ei ole. */
export function appendNote(old: string, entry: string): string {
	const lines = old.replace(/\s+$/, "").split("\n");
	const start = lines.findIndex((l) => /^## Muistiinpanot\s*$/.test(l));
	if (start < 0) return (old.trim() ? old.trimEnd() + "\n\n" : "") + "## Muistiinpanot\n\n" + entry + "\n";
	let end = lines.findIndex((l, i) => i > start && /^#/.test(l));
	if (end < 0) end = lines.length;
	let ins = end;
	while (ins > start + 1 && lines[ins - 1].trim() === "") ins--;
	lines.splice(ins, 0, entry);
	return lines.join("\n") + "\n";
}

function text(s: string) {
	return { content: [{ type: "text" as const, text: s }] };
}

export function registerTools(server: McpServer, env: Env, ctx: ExecutionContext | undefined, who: string, host = "") {
	if (host) HOST = host.replace(/\/$/, "");
	const db = () => new Db(env.DB);

	server.tool(
		"search-bookmarks",
		[
			"Search bookmarks. Full-text over title, description, excerpt, summary and note.",
			"Qualifiers: after:YYYY-MM-DD, before:YYYY-MM-DD, list:\"Name\", status:inbox|noudettu|ei-noudettavissa|kortitettu,",
			"rating:3 (exactly), rating:2+ (at least), rating:0 (perehdy), has:rating, -has:rating,",
			"has:note, -has:note, has:excerpt, has:summary, -has:summary, has:transcript, is:inlist, url:substring,",
			"media:artikkeli|video|podcast|kirja|some|dokumentti|kuva (comma for several, e.g. media:podcast,video), progress:lukematta|kesken|luettu|any.",
			"progress:kesken = what the owner is in the middle of right now. research:pyydetty|valmis|any = research the owner asked for (rating 4 when sharing). Empty query lists newest first.",
			"sortOrder 'rating' puts the best first — use it to pick what to read.",
			"Paginate with nextCursor until it is null — never conclude from one page.",
		].join(" "),
		{
			query: z.string().default("").describe("Free text and qualifiers"),
			limit: z.number().int().min(1).max(100).default(10),
			nextCursor: z.string().optional(),
			sortOrder: z.enum(["relevance", "asc", "desc", "rating"]).optional(),
		},
		async ({ query, limit, nextCursor, sortOrder }) => {
			const r = await db().search({ q: query, limit, cursor: nextCursor, sort: sortOrder });
			const body = r.bookmarks.map((b) => fmt(b)).join("\n\n") || "(no results)";
			return text(`${body}\n\nNext cursor: ${r.nextCursor ?? "null"}`);
		},
	);

	server.tool("get-bookmark", "Get one bookmark with full excerpt and note.", { bookmarkId: z.string() }, async ({ bookmarkId }) => {
		const b = await db().get(bookmarkId);
		return text(b ? fmt(b, true) : `Not found: ${bookmarkId}`);
	});

	server.tool(
		"get-bookmark-content",
		"Get the fetched text content (excerpt) of a bookmark. Returns empty if content could not be fetched — do not invent content.",
		{ bookmarkId: z.string() },
		async ({ bookmarkId }) => {
			const b = await db().get(bookmarkId);
			if (!b) return text(`Not found: ${bookmarkId}`);
			if (!b.excerpt) return text(`(no content) status=${b.status}${b.fetch_note ? ` reason=${b.fetch_note}` : ""}`);
			return text(b.excerpt);
		},
	);

	server.tool(
		"create-bookmark",
		"Save a link. Title/description are fetched in the background for fetchable domains; X, Reddit, Spotify stay as bare links.",
		{
			url: z.string().url(),
			title: z.string().optional(),
			text: z.string().optional().describe("Page text if the caller already has it (e.g. shared from Safari)"),
			rating: z.number().int().min(0).max(3).optional().describe(RATING_HELP),
			lists: z.array(z.string()).optional(),
			media: z.enum(MEDIA).optional().describe("Inferred from the URL when omitted"),
			progress: z.enum(PROGRESS).optional(),
		},
		async ({ url, title, text: pageText, rating, lists, media, progress }) => {
			const d = db();
			const [b, created] = await d.create({ url, title, excerpt: pageText, lists, source: "api", status: "inbox", rating: parseRating(rating), media, progress });
			if (created) {
				const p = enrichInBackground(d, env, b.id, b.url, !!pageText);
				ctx?.waitUntil(p);
			}
			return text(`${created ? "Created" : "Already existed"}\n${fmt(b)}`);
		},
	);

	server.tool(
		"update-bookmark",
		"Update fields. /kortti writes summary and note; note is indexed for search. Setting note sets status=kortitettu unless status given. `recall` is the owner's own memory-write — read it before writing a card, never replace it.",
		{
			bookmarkId: z.string(),
			title: z.string().optional(),
			description: z.string().optional(),
			excerpt: z.string().optional(),
			summary: z.string().optional(),
			note: z.string().optional(),
			status: STATUS.optional(),
			rating: z.number().int().min(0).max(3).optional().describe(RATING_HELP),
			fetchNote: z.string().optional().describe("Why content could not be fetched"),
			recall: z.string().optional().describe(`Owner's own words. Only the owner writes this; set it only when the owner dictated the text. For books this holds the book memo (/kirja/<id>) with headings ${Object.values(KIRJA_OSIOT).join(", ")}; sentences under the first heading are numbered 1.–3., chapters under LUVUT start with '## '. If the owner dictates answers, place them under those headings in their words and keep everything already there. Book quotes go to add-quote with the page as 'at' (e.g. 's. 42').`),
			media: z.enum(MEDIA).optional().describe("Correct the media type"),
			progress: z.enum(PROGRESS).nullable().optional().describe("lukematta | kesken (reading/listening now) | luettu; null stops tracking"),
			savedAt: z.string().optional().describe("Correct the saved date, YYYY-MM-DD — e.g. a book added now but read in spring. Not in the future."),
		},
		async ({ bookmarkId, title, description, excerpt, summary, note, status, rating, fetchNote, recall, media, progress, savedAt }) => {
			const patch: Parameters<Db["update"]>[1] = {};
			if (title !== undefined) patch.title = title;
			if (description !== undefined) patch.description = description;
			if (excerpt !== undefined) patch.excerpt = excerpt;
			if (summary !== undefined) patch.summary = summary;
			if (note !== undefined) patch.note = note;
			if (fetchNote !== undefined) patch.fetch_note = fetchNote;
			if (recall !== undefined) patch.recall = recall;
			if (rating !== undefined) patch.rating = parseRating(rating);
			if (media) patch.media = media;
			if (progress !== undefined) patch.progress = progress;
			if (savedAt !== undefined) {
				const d = parseSavedDate(savedAt);
				if (!d) return text(`Invalid savedAt: ${savedAt} (expected YYYY-MM-DD, not in the future)`);
				patch.saved_at = d;
			}
			if (status) patch.status = status as Status;
			else if (note) patch.status = "kortitettu";
			else if (excerpt) patch.status = "noudettu";
			const b = await db().update(bookmarkId, patch);
			// Noten POIMINNAT-osio poimintakokoelmaan, kuten /api/update tekee.
			if (b && note !== undefined) await syncQuotesFromNote(env.DB, b.id, note);
			return text(b ? fmt(b) : `Not found: ${bookmarkId}`);
		},
	);

	// Muistiinpanot keskustelusta (17.10.2026): omistaja haluaa lisätä
	// ajatuksia tavallisesta Claudesta. Lisätään noten loppuun omaan osioonsa,
	// ei koskaan korvata — note sisältää litteraatin aiheet ja poiminnat.
	server.tool(
		"add-note",
		[
			"Append a note to a bookmark without touching what is already there.",
			"Goes under the heading '## Muistiinpanot' at the end of the note, dated, and becomes full-text searchable.",
			"Use for the owner's thoughts, takeaways, to-dos or context about a source. Never use update-bookmark's `note` for this — it replaces the whole note.",
		].join(" "),
		{
			bookmarkId: z.string(),
			text: z.string().min(1).describe("The note, in the owner's words or as they asked it written"),
		},
		async ({ bookmarkId, text: t }) => {
			const d = db();
			const b = await d.get(bookmarkId);
			if (!b) return text(`Not found: ${bookmarkId}`);
			const day = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
			const entry = `- ${day}: ${t.trim().replace(/\n+/g, "\n  ")}`;
			const u = await d.update(bookmarkId, { note: appendNote(b.note ?? "", entry) });
			if (u) await syncQuotesFromNote(env.DB, u.id, u.note ?? "");
			return text(`Note added to "${b.title}".\n\n${entry}`);
		},
	);

	server.tool(
		"add-quote",
		[
			"Add to the owner's quote collection (Poiminnat).",
			"kind 'oma' = the owner's own words, 'what stuck with me' (default); kind 'korostus' = a passage from a source the owner wants to keep, verbatim.",
			"Link it to a bookmark when it comes from one; `at` is a timestamp (0:49:56) or page (s. 176).",
		].join(" "),
		{
			text: z.string().min(1),
			kind: z.enum(["oma", "korostus"]).default("oma"),
			bookmarkId: z.string().optional(),
			who: z.string().optional().describe("Speaker or author"),
			at: z.string().optional().describe("Timestamp or page"),
		},
		async ({ text: t, kind, bookmarkId, who, at }) => {
			if (bookmarkId && !(await db().get(bookmarkId))) return text(`Not found: ${bookmarkId}`);
			const q = await addQuote(env.DB, { text: t, bookmark_id: bookmarkId ?? null, who: who ?? null, at: at ?? null, kind });
			return text(`Saved to Poiminnat (${q.kind}): "${q.text}"${q.who ? ` — ${q.who}` : ""}${q.at ? ` · ${q.at}` : ""}`);
		},
	);

	// Liitteet keskustelusta (17.10.2026): omistaja tekee claude.ai:ssa
	// artefaktin, esim. yhteenvedon kirjasta tai jaksosta, ja haluaa sen
	// lukupinoon. Vain tekstimuodot — binääriä ei voi järkevästi kuljettaa
	// MCP-argumenttina. HTML näytetään eristettynä (files.ts isolationHeaders).
	server.tool(
		"attach-file",
		[
			"Save a text file — typically an artifact the owner made with you (an HTML page, a Markdown summary of a book or episode) — into lukupino.",
			"With bookmarkId: attached to that bookmark (shown on its card; a dated line goes to its Muistiinpanot). Without: becomes its own bookmark.",
			"Allowed: .html, .md, .txt, .csv, .json, .svg. Pass the complete file content as text. HTML is shown sandboxed, so scripts work but cannot reach lukupino.",
		].join(" "),
		{
			filename: z.string().min(1).max(200).describe("e.g. 'measure-what-matters-yhteenveto.html'"),
			content: z.string().min(1),
			bookmarkId: z.string().optional(),
			title: z.string().optional().describe("Title for a new bookmark (without bookmarkId)"),
			lists: z.array(z.string()).optional().describe("Lists for a new bookmark"),
		},
		async ({ filename, content, bookmarkId, title, lists }) => {
			const type = guessType(filename, null);
			if (!TEXT_ATTACH.test(type)) return text(`Not allowed: ${filename} (${type}). Use .html, .md, .txt, .csv, .json or .svg.`);
			if (content.length > MAX_ATTACH_CHARS) return text(`Too large: ${content.length} characters (limit ${MAX_ATTACH_CHARS}).`);
			const d = db();
			const target = bookmarkId ? await d.get(bookmarkId) : null;
			if (bookmarkId && !target) return text(`Not found: ${bookmarkId}`);
			const bytes = new TextEncoder().encode(content);
			const key = newFileKey(newId(), filename);
			await putFile(env, key, bytes.buffer as ArrayBuffer, { name: filename, type });
			const ref: FileRef = { key, name: filename, type, size: bytes.byteLength };
			const view = `${HOST}/ui/view/${key}?t=${encodeURIComponent(filename)}`;
			if (target) {
				const day = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
				const note = appendNote(target.note ?? "", `- ${day}: liite ${filename}`);
				const u = await d.update(target.id, { files: [...target.files, ref], note });
				if (u) await syncQuotesFromNote(env.DB, u.id, u.note ?? "");
				return text(`Attached ${filename} (${ref.size} bytes) to "${target.title}".\nOpen: ${view}`);
			}
			const plain = type === "text/html" ? htmlToText(content) : content;
			const [b] = await d.create({
				url: `${HOST}/file/${key}`,
				title: title || filename,
				source: "api",
				status: "noudettu",
				excerpt: plain.slice(0, MAX_EXCERPT),
				file_key: key,
				file_type: type,
				file_size: ref.size,
				files: [ref],
				lists: lists ?? [],
			});
			return text(`Saved ${filename} as a new bookmark.\n${fmt(b)}\nOpen: ${view}`);
		},
	);

	// Kirjat (17.10.2026): kirjalla ei usein ole linkkiä, joten osoitteeksi tulee
	// Google-kirjahaku. Lukutila pitää kesken olevat näkyvissä.
	server.tool(
		"add-book",
		[
			"Add a book to lukupino by title (books often have no URL). media=kirja, progress defaults to lukematta.",
			"Set progress kesken when the owner is reading it now — kesken books stay pinned at the top of lukupino.",
			"Mark finished with update-bookmark progress=luettu. If the book already exists, it is returned and progress/rating updated.",
		].join(" "),
		{
			title: z.string().min(1),
			author: z.string().optional(),
			progress: z.enum(PROGRESS).default("lukematta"),
			rating: z.number().int().min(0).max(3).optional().describe(RATING_HELP),
			url: z.string().url().optional().describe("Optional page for the book (Goodreads etc.); default is a Google Books search"),
			lists: z.array(z.string()).optional(),
		},
		async ({ title, author, progress, rating, url, lists }) => {
			const nimi = author ? `${title} — ${author}` : title;
			const d = db();
			const [b, created] = await d.create({
				url: url ?? `https://www.google.com/search?tbm=bks&q=${encodeURIComponent(nimi)}`,
				title: nimi,
				source: "api",
				status: "noudettu",
				fetch_note: "kirja — ei verkkosisältöä",
				media: "kirja",
				progress,
				rating: parseRating(rating),
				lists: lists ?? [],
			});
			const u = created ? b : await d.update(b.id, { progress, ...(rating !== undefined ? { rating: parseRating(rating) } : {}) });
			return text(`${created ? "Book added" : "Book already existed, updated"}\n${fmt(u ?? b)}`);
		},
	);

	server.tool("delete-bookmark", "Delete a bookmark permanently.", { bookmarkId: z.string() }, async ({ bookmarkId }) => {
		return text((await deleteBookmark(env, bookmarkId)) ? `Deleted ${bookmarkId} (and its file, if any)` : `Not found: ${bookmarkId}`);
	});

	server.tool("get-lists", "List all lists with icons.", {}, async () => {
		const ls = await db().lists();
		return text(ls.map((l) => `${l.icon ?? ""} ${l.name}`).join("\n") || "(no lists)");
	});

	server.tool(
		"get-list-bookmarks",
		"Bookmarks in a list, newest first. Paginate with nextCursor.",
		{ listName: z.string(), limit: z.number().int().min(1).max(100).default(20), nextCursor: z.string().optional() },
		async ({ listName, limit, nextCursor }) => {
			const r = await db().search({ q: `list:"${listName}"`, limit, cursor: nextCursor, sort: "desc" });
			return text(`${r.bookmarks.map((b) => fmt(b)).join("\n\n") || "(empty)"}\n\nNext cursor: ${r.nextCursor ?? "null"}`);
		},
	);

	server.tool("add-bookmark-to-list", "Add a bookmark to a list (creates the list if missing).", { bookmarkId: z.string(), listName: z.string() }, async ({ bookmarkId, listName }) => {
		const b = await db().addToList(bookmarkId, listName);
		return text(b ? fmt(b) : `Not found: ${bookmarkId}`);
	});

	server.tool("remove-bookmark-from-list", "Remove a bookmark from a list.", { bookmarkId: z.string(), listName: z.string() }, async ({ bookmarkId, listName }) => {
		const b = await db().removeFromList(bookmarkId, listName);
		return text(b ? fmt(b) : `Not found: ${bookmarkId}`);
	});

	// Koko litteraatti (taulu transcripts, 5.10.2026). 2 h jakso on ~140 000
	// merkkiä, joten työkalu palauttaa joko hakuosumat tai paloja ajasta alkaen.
	server.tool(
		"get-research",
		"Read the research report written for a bookmark (markdown, the lukupino-tutki template: what it is about, key concepts, relation to theory, what it resembles, learning path, further reading, open questions). Search research:valmis to list them.",
		{ bookmarkId: z.string() },
		async ({ bookmarkId }) => {
			const b = await db().get(bookmarkId);
			if (!b) return text(`Not found: ${bookmarkId}`);
			const r = await getResearch(env.DB, bookmarkId);
			if (b.research_status === "ei-onnistu") return text(`Research for "${b.title}" could not be done: ${r?.note ?? "no reason recorded"}`);
			if (!r || !r.text) return text(`No research for "${b.title}" yet${b.research_status === "pyydetty" ? " (requested, waiting)" : ""}.`);
			return text(`# Research: ${b.title ?? b.url}\n${HOST}/tutkimus/${b.id}\n\n${r.text}`);
		},
	);

	server.tool(
		"request-research",
		"Ask for a research report on a bookmark (the same as the owner sharing it with 4 or pressing Tutki). cancel: true withdraws a pending request; force: true redoes a finished one. The daily routine writes requested reports.",
		{ bookmarkId: z.string(), cancel: z.boolean().default(false), force: z.boolean().default(false) },
		async ({ bookmarkId, cancel, force }) => {
			const st = await requestResearch(env.DB, bookmarkId, !cancel, force);
			return text(st === undefined ? `Not found: ${bookmarkId}` : `Research status: ${st ?? "none"}`);
		},
	);

	server.tool(
		"save-research",
		"Save a finished research report (markdown, follow skills/lukupino-tutki/SKILL.md) and mark it ready; replaces an earlier one. If the research could not be done, pass failedReason instead of text. Never invent sources: every link must have been fetched.",
		{
			bookmarkId: z.string(),
			text: z.string().max(MAX_RESEARCH).optional(),
			failedReason: z.string().optional().describe("Why no report could be written, e.g. the content could not be fetched"),
		},
		async ({ bookmarkId, text: md, failedReason }) => {
			if (failedReason) return text((await markResearchFailed(env.DB, bookmarkId, failedReason)) ? "Marked: research could not be done." : `Not found: ${bookmarkId}`);
			if (!md?.trim()) return text("Give text or failedReason.");
			return text((await putResearch(env.DB, bookmarkId, md.trim())) ? `Saved (${md.trim().length} chars): ${HOST}/tutkimus/${bookmarkId}` : `Not found: ${bookmarkId}`);
		},
	);

	// Pistokoe ja lähtötasotesti (21.10.2026; ks. pistokoe.ts ja
	// skills/lukupino-pistokoe). Omistaja vastaa sivulla /pistokoe/<id>.
	server.tool(
		"list-quizzes",
		"List quizzes (weekly true/false quizzes on what the owner read, and baseline tests like 'Lähtötasotesti: Claude Code'), newest first, with score and whether feedback is written.",
		{ limit: z.number().int().min(1).max(50).default(10) },
		async ({ limit }) => {
			const qs = await listQuizzes(env.DB, limit);
			if (!qs.length) return text("No quizzes yet.");
			return text(
				qs
					.map((q) => {
						const n = Number(q.n), a = Number(q.answered);
						const tila = a === n && n > 0 ? `${q.right}/${n} right` : a ? `${a}/${n} answered` : "not answered";
						return `${q.id}  ${q.title}  [${q.scope ?? "-"}]  ${String(q.created_at).slice(0, 10)}  ${tila}${q.feedback_at ? "  feedback: yes" : ""}\n  ${HOST}/pistokoe/${q.id}`;
					})
					.join("\n"),
			);
		},
	);

	server.tool(
		"get-quiz",
		"Read one quiz with every statement, the correct answer, the owner's answer (1 true, 0 false, -1 don't know) and confidence (1 sure, 0 guess), the explanation, source and feedback. Use it to discuss what went wrong or to write feedback.",
		{ quizId: z.string() },
		async ({ quizId }) => {
			const g = await getQuiz(env.DB, quizId);
			if (!g) return text(`Not found: ${quizId}`);
			const { quiz: q, items } = g;
			const vast = (x: number | null) => (x === null ? "not answered" : x === -1 ? "don't know" : x === 1 ? "true" : "false");
			const rivit = items.map((i) => {
				const ok = i.answer === null ? "" : i.answer === i.correct ? " ✓" : i.answer === -1 ? " –" : " ✗";
				return [
					`${i.pos}. ${i.statement}${i.area ? `  [${i.area}${i.level ? `, ${i.level}` : ""}]` : ""}`,
					`   correct: ${i.correct ? "true" : "false"} · answer: ${vast(i.answer)}${i.confident === 1 ? " (sure)" : i.confident === 0 ? " (guess)" : ""}${ok}`,
					`   why: ${i.explanation}`,
					i.anchor ? `   source text: "${i.anchor}"` : "",
					i.b_title || i.src_title ? `   source: ${i.b_title ?? i.src_title}${i.bookmark_id ? ` (${i.bookmark_id})` : i.src_url ? ` ${i.src_url}` : ""}` : "",
				]
					.filter(Boolean)
					.join("\n");
			});
			return text(`# ${q.title}\n${HOST}/pistokoe/${q.id}  scope: ${q.scope ?? "-"}  created: ${q.created_at}${q.answered_at ? `  answered: ${q.answered_at}` : ""}\n\n${rivit.join("\n\n")}${q.feedback ? `\n\n## Feedback\n${q.feedback}` : ""}`);
		},
	);

	server.tool(
		"create-quiz",
		`Create a quiz the owner answers on their phone. Follow skills/lukupino-pistokoe/SKILL.md: weekly quiz = ~12 statements only from content stored in lukupino (summary, excerpt, transcript, recall, quotes, research) of items the owner consumed (rating 1–3, progress, own quotes — rating 0 means unread); 5–7 true; name the source in each statement; false ones clearly false per the source. A baseline test (scope "lähtötaso:<topic>") = 16 statements, 8 areas × perus/edistynyt, checked against the primary source with area, level, srcUrl and srcTitle. 3–${MAX_ITEMS} statements. Returns the link to send the owner.`,
		{
			title: z.string().describe('e.g. "Viikko 43 · 14.–20.10." or "Lähtötasotesti: Claude Code"'),
			scope: z.string().optional().describe('"viikko", "aihe:<name>" or "lähtötaso:<topic>"'),
			items: z
				.array(
					z.object({
						statement: z.string(),
						correct: z.boolean(),
						explanation: z.string().describe("1–2 sentences: what the source actually says; shown right after answering"),
						bookmarkId: z.string().optional(),
						anchor: z.string().optional().describe("Short verbatim passage from the source"),
						kind: z.enum(QUIZ_KINDS).optional(),
						view: z.enum(QUIZ_VIEWS).optional().describe("Where the source link opens"),
						repeatOf: z.string().optional().describe("quizId:pos of an earlier statement being repeated"),
						area: z.string().optional(),
						level: z.enum(["perus", "edistynyt"]).optional(),
						srcUrl: z.string().url().optional(),
						srcTitle: z.string().optional(),
					}),
				)
				.min(3)
				.max(MAX_ITEMS),
		},
		async ({ title, scope, items }) => {
			const r = await createQuiz(env.DB, {
				title,
				scope,
				items: items.map((i) => ({
					statement: i.statement, correct: i.correct, explanation: i.explanation, bookmark_id: i.bookmarkId, anchor: i.anchor,
					kind: i.kind, view: i.view, repeat_of: i.repeatOf, area: i.area, level: i.level, src_url: i.srcUrl, src_title: i.srcTitle,
				})),
			});
			return text("error" in r ? `Not created: ${r.error}` : `Created ${r.n} statements: ${HOST}/pistokoe/${r.id}`);
		},
	);

	server.tool(
		"save-quiz-feedback",
		"Save feedback for an answered quiz (markdown, headings per skills/lukupino-pistokoe: Mikä jäi mieleen, Mikä ei, Varmuus, Mihin syventyä, Kertaukseen). Shown on the quiz page.",
		{ quizId: z.string(), text: z.string().max(MAX_FEEDBACK) },
		async ({ quizId, text: md }) => text((await putFeedback(env.DB, quizId, md.trim())) ? `Saved: ${HOST}/pistokoe/${quizId}` : `Not found: ${quizId}`),
	);

	server.tool(
		"get-transcript",
		[
			"Read the full verbatim transcript of a video or podcast (timestamps and speakers, one paragraph per line: `[0:04:22] Speaker: text`).",
			"With `query`: returns only matching paragraphs with their timestamps (use this first for long episodes).",
			"Without `query`: returns paragraphs starting at `fromSeconds`, up to `maxChars`; continue with the returned next fromSeconds.",
			"Bookmarks that have one show 'Full transcript: N words' in search results; search with has:transcript.",
			"Link to a spot for the owner: <this server's origin>/litteraatti/<id>#t=<seconds> (the origin is in every Reader link this tool returns).",
		].join(" "),
		{
			bookmarkId: z.string(),
			query: z.string().optional().describe("Words or phrase to find; case-insensitive"),
			fromSeconds: z.number().int().min(0).default(0),
			maxChars: z.number().int().min(1000).max(60000).default(20000),
		},
		async ({ bookmarkId, query, fromSeconds, maxChars }) => {
			const b = await db().get(bookmarkId);
			if (!b) return text(`Not found: ${bookmarkId}`);
			const t = await getTranscript(env.DB, bookmarkId);
			if (!t || !t.text) {
				return text(
					t ? `No full transcript for "${b.title}": ${t.source ?? "not available"}. The note may still have a summary, topics and quotes (get-bookmark).`
						: `No full transcript for "${b.title}" yet. The note may have a summary, topics and quotes (get-bookmark).`,
				);
			}
			const paras = t.text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
				const m = /^\[(\d+):(\d\d):(\d\d)\]/.exec(l);
				return { s: m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : -1, l };
			});
			const head = `Transcript of "${b.title}" (${t.words} words, ${b.url})\nReader: ${HOST}/litteraatti/${b.id}`;
			if (query?.trim()) {
				const q = query.trim().toLowerCase();
				const words = q.split(/\s+/);
				const hits = paras.filter((p) => {
					const x = p.l.toLowerCase();
					return x.includes(q) || words.every((w) => x.includes(w));
				});
				let out = "", n = 0;
				for (const h of hits) {
					if (out.length + h.l.length > maxChars) break;
					out += h.l + "\n\n";
					n++;
				}
				return text(`${head}\n${hits.length} matching paragraphs for "${query}"${n < hits.length ? `, showing ${n}` : ""}:\n\n${out || "(no matches)"}`);
			}
			let i = paras.findIndex((p) => p.s >= fromSeconds);
			if (i < 0) i = paras.length;
			let out = "";
			while (i < paras.length && out.length + paras[i].l.length <= maxChars) out += paras[i++].l + "\n\n";
			const next = i < paras.length ? `Next fromSeconds: ${paras[i].s}` : "End of transcript.";
			return text(`${head}\nFrom ${fromSeconds} s:\n\n${out}${next}`);
		},
	);

	// Poiminnat (taulu quotes, 4.10.2026): lähteiden lainaukset, omistajan
	// korostukset litteraateista ja omat sanat.
	server.tool(
		"search-quotes",
		[
			"Search the owner's quote collection (Poiminnat): quotes extracted from sources (kind lahde),",
			"passages the owner highlighted in transcripts (kind korostus), and the owner's own words (kind oma).",
			"Starred ones are the owner's favourites. Each result has the source title and timestamp/page.",
		].join(" "),
		{
			query: z.string().default("").describe("Text to find in the quote, speaker or source title"),
			kind: z.enum(["lahde", "korostus", "oma"]).optional(),
			starredOnly: z.boolean().default(false),
			bookmarkId: z.string().optional(),
			limit: z.number().int().min(1).max(200).default(30),
		},
		async ({ query, kind, starredOnly, bookmarkId, limit }) => {
			const where: string[] = [];
			const binds: unknown[] = [];
			if (query.trim()) {
				where.push("(q.text LIKE ? OR q.who LIKE ? OR b.title LIKE ?)");
				const like = `%${query.trim()}%`;
				binds.push(like, like, like);
			}
			if (kind) (where.push("q.kind = ?"), binds.push(kind));
			if (starredOnly) where.push("q.starred = 1");
			if (bookmarkId) (where.push("q.bookmark_id = ?"), binds.push(bookmarkId));
			const r = await env.DB.prepare(
				`SELECT q.*, b.title AS title FROM quotes q LEFT JOIN bookmarks b ON b.id = q.bookmark_id
				 ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY q.starred DESC, q.created_at DESC LIMIT ?`,
			)
				.bind(...binds, limit)
				.all();
			const rows = r.results as Array<Record<string, unknown>>;
			const body = rows
				.map((x) => `${x.starred ? "★ " : ""}"${x.text}"${x.who ? ` — ${x.who}` : ""}\n  ${x.kind}${x.at ? ` · ${x.at}` : ""}${x.title ? ` · ${x.title}` : ""}${x.bookmark_id ? ` (${x.bookmark_id})` : ""}`)
				.join("\n\n");
			return text(`${rows.length} quotes${rows.length === limit ? " (limit reached)" : ""}:\n\n${body || "(none)"}`);
		},
	);

	server.tool("get-stats", "Counts by status. Use for the weekly review inbox size.", {}, async () => {
		const c = await db().counts();
		return text(
			[
				`Total: ${c.total}`,
				...Object.entries(c.byStatus).map(([k, v]) => `  ${k}: ${v}`),
				"Rating:",
				...Object.entries(c.byRating).map(([k, v]) => `  ${k}: ${v}`),
				"Media:",
				...Object.entries(c.byMedia).map(([k, v]) => `  ${k}: ${v}`),
				"Progress:",
				...Object.entries(c.byProgress).map(([k, v]) => `  ${k}: ${v}`),
				`Authenticated as: ${who}`,
			].join("\n"),
		);
	});
}
