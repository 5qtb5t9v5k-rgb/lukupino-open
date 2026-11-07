// Lukupino — tietokerros D1:n päälle. Kaikki SQL täällä, ei muualla.

export type Status = "inbox" | "noudettu" | "ei-noudettavissa" | "kortitettu";
export type Source = "safari" | "app" | "api" | "import";
/** 1 talteen · 2 hyvä · 3 erinomainen. null = ei arvioitu. */
/** 0 perehdy (lukematta, palaa tähän) · 1 kelpaa · 2 hyvä · 3 helmi · null ei arvioitu. */
export type Rating = 0 | 1 | 2 | 3;

export const MEDIA = ["artikkeli", "video", "podcast", "kirja", "some", "dokumentti", "kuva"] as const;
export type Media = (typeof MEDIA)[number];
export const PROGRESS = ["lukematta", "kesken", "luettu"] as const;
export type Progress = (typeof PROGRESS)[number];

export function parseMedia(v: unknown): Media | null {
	return (MEDIA as readonly string[]).includes(String(v)) ? (v as Media) : null;
}
export function parseProgress(v: unknown): Progress | null {
	return (PROGRESS as readonly string[]).includes(String(v)) ? (v as Progress) : null;
}

/** Mediatyyppi osoitteesta ja tiedostotyypistä. Sama sääntö kuin migraatiossa 0010. */
export function mediaFor(url: string, fileType?: string | null): Media {
	if (fileType?.startsWith("image/")) return "kuva";
	if (fileType) return "dokumentti";
	let h = "", p = "";
	try {
		const u = new URL(url);
		h = u.hostname.replace(/^(www|m)\./, "");
		p = u.pathname;
	} catch {
		return "artikkeli";
	}
	if (/(^|\.)(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com)$/.test(h)) return "video";
	if ((h === "open.spotify.com" && /^\/(episode|show)\//.test(p)) || /(^|\.)(podcasts\.apple\.com|overcast\.fm|pca\.st)$/.test(h)) return "podcast";
	if (/^(x\.com|twitter\.com|threads\.net|instagram\.com)$/.test(h) || /(^|\.)reddit\.com$/.test(h) || (h === "substack.com" && p.startsWith("/note")) || (h === "linkedin.com" && p.startsWith("/posts/"))) return "some";
	if (/(^|\.)(goodreads\.com|kirjasampo\.fi|bookbeat\.(com|fi)|audible\.[a-z.]+)$/.test(h) || /^books\.google\./.test(h) || (h === "google.com" && url.includes("tbm=bks"))) return "kirja";
	if ((h === "nextory.com" && /\/book\//.test(p)) || (h === "storytel.com" && /\/books?\//.test(p))) return "kirja";
	return "artikkeli";
}

export function parseRating(v: unknown): Rating | null {
	const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
	return n === 0 || n === 1 || n === 2 || n === 3 ? (n as Rating) : null;
}

/**
 * Tallennuspäivä käsin: "YYYY-MM-DD" → ISO-aikaleima keskipäivällä (UTC), jotta
 * päivä pysyy samana Suomen ajassa. Tulevaisuus ja ennen vuotta 1990 hylätään.
 */
export function parseSavedDate(v: unknown): string | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? "").trim());
	if (!m) return null;
	const d = new Date(`${m[0]}T12:00:00.000Z`);
	if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== m[0]) return null;
	if (Number(m[1]) < 1990 || d.getTime() > Date.now() + 86_400_000) return null;
	return d.toISOString();
}

/**
 * Kirjamuistion osiot (kirja.ts) otsikoittain omistajan omissa sanoissa
 * (`recall`). Runko on Ali Abdaalin kirjamuistiinpanoista, ja siihen on lisätty
 * Mitä teen toisin sekä luvut (17.10.2026). Omistaja täyttää muistion itse.
 */
export const KIRJA_OSIOT = {
	lauseet: "KIRJA KOLMESSA LAUSEESSA",
	vaikutelmat: "VAIKUTELMAT",
	loysin: "MITEN LÖYSIN KIRJAN",
	kenelle: "KENELLE SUOSITTELEN",
	muutti: "MITEN KIRJA MUUTTI MINUA",
	toisin: "MITÄ TEEN TOISIN",
	luvut: "LUVUT",
	muistiinpanot: "MUISTIINPANOT",
} as const;
/** Omin sanoin -kentän yläraja; kirjamuistio luvuittain voi olla pitkä. */
export const MAX_RECALL = 100_000;

export interface Bookmark {
	id: string;
	url: string;
	title: string | null;
	description: string | null;
	excerpt: string | null;
	summary: string | null;
	note: string | null;
	/** Omistajan omin sanoin, lähteeseen katsomatta. Kone ei kirjoita tähän. */
	recall: string | null;
	image_url: string | null;
	/** Ääni- tai videotiedoston osoite (podcast-MP3), litterointia varten. */
	media_url: string | null;
	/** Ensimmäinen tiedosto — kansikuva ja vanhat kutsupaikat. Ks. `files`. */
	file_key: string | null;
	file_type: string | null;
	file_size: number | null;
	/** Kaikki tallennuksen tiedostot järjestyksessä. */
	files: FileRef[];
	saved_at: string;
	updated_at: string;
	source: Source;
	status: Status;
	fetch_note: string | null;
	rating: Rating | null;
	media: Media;
	progress: Progress | null;
	/** Koko litteraatin sanamäärä, jos litteraatti on taulussa transcripts. */
	transcript_words: number | null;
	/** Tutkimuksen tila (research.ts): pyydetty, valmis tai ei-onnistu. */
	research_status: string | null;
	lists: string[];
}

/** Yksi tallennettu tiedosto. Tavut ovat R2:ssa avaimen takana. */
export interface FileRef {
	key: string;
	name: string;
	type: string;
	size: number;
}

export interface List {
	name: string;
	icon: string | null;
	sort: number;
}

export interface SearchOptions {
	q?: string; // vapaateksti + kvalifioijat: after:YYYY-MM-DD before:YYYY-MM-DD list:"Nimi" status:inbox
	limit?: number;
	cursor?: string; // offset merkkijonona
	sort?: "relevance" | "asc" | "desc" | "rating";
}

export interface SearchResult {
	bookmarks: Bookmark[];
	nextCursor: string | null;
	total?: number;
}

const MAX_TITLE = 300;
const MAX_DESC = 600;
export const MAX_EXCERPT = 3000;
const MAX_NOTE = 200_000;

export function newId(): string {
	const bytes = new Uint8Array(9);
	crypto.getRandomValues(bytes);
	let s = "";
	for (const b of bytes) s += b.toString(36).padStart(2, "0");
	return s.slice(0, 12);
}

export function nowIso(): string {
	return new Date().toISOString();
}

export function clip(s: string | null | undefined, max: number): string | null {
	if (s == null) return null;
	const t = s.replace(/\s+/g, " ").trim();
	if (!t) return null;
	return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

export function normalizeUrl(raw: string): string {
	const u = new URL(raw.trim());
	// Vain http(s): muut skeemat (javascript:, data: …) päätyisivät linkkeinä sivuille (auditointi 7.11.2026).
	if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`vain http(s)-osoitteet kelpaavat: ${u.protocol}`);
	u.hash = "";
	// Seurantaparametrit pois, jotta sama artikkeli ei tallennu kahdesti.
	for (const k of [...u.searchParams.keys()]) {
		if (/^(utm_|fbclid|gclid|igsh|si$|ref$|ref_src)/i.test(k)) u.searchParams.delete(k);
	}
	return u.toString();
}

function parseFiles(raw: string | null | undefined): FileRef[] {
	try {
		const a = JSON.parse(raw || "[]");
		return Array.isArray(a) ? a.filter((x) => x && typeof x.key === "string") : [];
	} catch {
		return [];
	}
}

function rowToBookmark(r: Record<string, unknown>): Bookmark {
	let lists: string[] = [];
	try {
		lists = JSON.parse((r.lists_json as string) || "[]");
	} catch {
		lists = [];
	}
	return {
		id: r.id as string,
		url: r.url as string,
		title: (r.title as string) ?? null,
		description: (r.description as string) ?? null,
		excerpt: (r.excerpt as string) ?? null,
		summary: (r.summary as string) ?? null,
		note: (r.note as string) ?? null,
		recall: (r.recall as string) ?? null,
		image_url: (r.image_url as string) ?? null,
		media_url: (r.media_url as string) ?? null,
		file_key: (r.file_key as string) ?? null,
		file_type: (r.file_type as string) ?? null,
		file_size: (r.file_size as number) ?? null,
		files: parseFiles(r.files_json as string),
		saved_at: r.saved_at as string,
		updated_at: r.updated_at as string,
		source: r.source as Source,
		status: r.status as Status,
		fetch_note: (r.fetch_note as string) ?? null,
		rating: parseRating(r.rating),
		transcript_words: (r.transcript_words as number) ?? null,
		research_status: (r.research_status as string) ?? null,
		media: parseMedia(r.media) ?? mediaFor(String(r.url ?? ""), r.file_type as string | null),
		progress: parseProgress(r.progress),
		lists,
	};
}

export class Db {
	constructor(private d1: D1Database) {}

	async get(id: string): Promise<Bookmark | null> {
		const r = await this.d1.prepare("SELECT * FROM bookmarks WHERE id = ?").bind(id).first();
		return r ? rowToBookmark(r as Record<string, unknown>) : null;
	}

	async getByUrl(url: string): Promise<Bookmark | null> {
		const r = await this.d1.prepare("SELECT * FROM bookmarks WHERE url = ?").bind(url).first();
		return r ? rowToBookmark(r as Record<string, unknown>) : null;
	}

	/** Lisää tai palauttaa olemassa olevan (sama URL). Palauttaa [bookmark, created]. */
	async create(input: {
		url: string;
		title?: string | null;
		description?: string | null;
		excerpt?: string | null;
		summary?: string | null;
		note?: string | null;
		image_url?: string | null;
		media_url?: string | null;
		file_key?: string | null;
		file_type?: string | null;
		file_size?: number | null;
		files?: FileRef[];
		saved_at?: string;
		source?: Source;
		status?: Status;
		fetch_note?: string | null;
		rating?: Rating | null;
		lists?: string[];
		media?: Media | null;
		progress?: Progress | null;
	}): Promise<[Bookmark, boolean]> {
		const url = normalizeUrl(input.url);
		const existing = await this.getByUrl(url);
		if (existing) return [existing, false];
		const id = newId();
		const now = nowIso();
		const lists = JSON.stringify(input.lists ?? []);
		await this.d1
			.prepare(
				`INSERT INTO bookmarks (id,url,title,description,excerpt,summary,note,image_url,media_url,file_key,file_type,file_size,files_json,saved_at,updated_at,source,status,fetch_note,rating,lists_json,media,progress)
				 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			)
			.bind(
				id,
				url,
				clip(input.title, MAX_TITLE),
				clip(input.description, MAX_DESC),
				clip(input.excerpt, MAX_EXCERPT),
				clip(input.summary, 2000),
				input.note ? input.note.slice(0, MAX_NOTE) : null,
				clip(input.image_url, 1000),
				clip(input.media_url, 1000),
				input.file_key ?? null,
				input.file_type ?? null,
				input.file_size ?? null,
				JSON.stringify(input.files ?? []),
				input.saved_at ?? now,
				now,
				input.source ?? "api",
				input.status ?? "inbox",
				clip(input.fetch_note, 300),
				input.rating ?? null,
				lists,
				input.media ?? mediaFor(url, input.file_type),
				input.progress ?? null,
			)
			.run();
		return [(await this.get(id))!, true];
	}

	async update(
		id: string,
		patch: Partial<Pick<Bookmark, "title" | "description" | "excerpt" | "summary" | "note" | "recall" | "image_url" | "media_url" | "file_key" | "file_type" | "file_size" | "files" | "status" | "fetch_note" | "rating" | "lists" | "media" | "progress" | "saved_at">>,
	): Promise<Bookmark | null> {
		const sets: string[] = [];
		const vals: unknown[] = [];
		const put = (col: string, v: unknown) => {
			sets.push(`${col} = ?`);
			vals.push(v);
		};
		if ("title" in patch) put("title", clip(patch.title, MAX_TITLE));
		if ("description" in patch) put("description", clip(patch.description, MAX_DESC));
		if ("excerpt" in patch) put("excerpt", clip(patch.excerpt, MAX_EXCERPT));
		if ("summary" in patch) put("summary", clip(patch.summary, 2000));
		if ("note" in patch) put("note", patch.note ? patch.note.slice(0, MAX_NOTE) : null);
		if ("recall" in patch) put("recall", patch.recall ? patch.recall.slice(0, MAX_RECALL) : null);
		if ("image_url" in patch) put("image_url", clip(patch.image_url, 1000));
		if ("media_url" in patch) put("media_url", clip(patch.media_url, 1000));
		if ("file_key" in patch) put("file_key", patch.file_key ?? null);
		if ("file_type" in patch) put("file_type", patch.file_type ?? null);
		if ("file_size" in patch) put("file_size", patch.file_size ?? null);
		if ("files" in patch && patch.files) put("files_json", JSON.stringify(patch.files));
		if ("status" in patch && patch.status) put("status", patch.status);
		if ("fetch_note" in patch) put("fetch_note", clip(patch.fetch_note, 300));
		if ("rating" in patch) put("rating", patch.rating ?? null);
		if ("lists" in patch && patch.lists) put("lists_json", JSON.stringify(patch.lists));
		if ("media" in patch && patch.media) put("media", patch.media);
		if ("progress" in patch) put("progress", patch.progress ?? null);
		if ("saved_at" in patch && patch.saved_at) put("saved_at", patch.saved_at);
		if (!sets.length) return this.get(id);
		put("updated_at", nowIso());
		vals.push(id);
		await this.d1.prepare(`UPDATE bookmarks SET ${sets.join(", ")} WHERE id = ?`).bind(...vals).run();
		return this.get(id);
	}

	async delete(id: string): Promise<boolean> {
		const r = await this.d1.prepare("DELETE FROM bookmarks WHERE id = ?").bind(id).run();
		return (r.meta.changes ?? 0) > 0;
	}

	async lists(): Promise<List[]> {
		const r = await this.d1.prepare("SELECT name, icon, sort FROM lists ORDER BY sort, name").all();
		return (r.results as unknown as List[]) ?? [];
	}

	async ensureList(name: string, icon?: string | null): Promise<void> {
		await this.d1
			.prepare("INSERT OR IGNORE INTO lists(name, icon, sort) VALUES (?, ?, (SELECT COALESCE(MAX(sort),0)+1 FROM lists))")
			.bind(name, icon ?? null)
			.run();
	}

	async addToList(id: string, list: string): Promise<Bookmark | null> {
		const b = await this.get(id);
		if (!b) return null;
		if (!b.lists.includes(list)) {
			await this.ensureList(list);
			return this.update(id, { lists: [...b.lists, list] });
		}
		return b;
	}

	async removeFromList(id: string, list: string): Promise<Bookmark | null> {
		const b = await this.get(id);
		if (!b) return null;
		return this.update(id, { lists: b.lists.filter((l) => l !== list) });
	}

	async counts(): Promise<{ total: number; byStatus: Record<string, number>; byRating: Record<string, number>; byMedia: Record<string, number>; byProgress: Record<string, number> }> {
		const r = await this.d1.prepare("SELECT status, COUNT(*) AS n FROM bookmarks GROUP BY status").all();
		const byStatus: Record<string, number> = {};
		let total = 0;
		for (const row of r.results as { status: string; n: number }[]) {
			byStatus[row.status] = row.n;
			total += row.n;
		}
		const rr = await this.d1.prepare("SELECT rating, COUNT(*) AS n FROM bookmarks GROUP BY rating").all();
		const byRating: Record<string, number> = {};
		for (const row of rr.results as { rating: number | null; n: number }[]) {
			byRating[row.rating === null ? "ei arvioitu" : String(row.rating)] = row.n;
		}
		const mm = await this.d1.prepare("SELECT media, COUNT(*) AS n FROM bookmarks GROUP BY media").all();
		const byMedia: Record<string, number> = {};
		for (const row of mm.results as { media: string | null; n: number }[]) byMedia[row.media ?? "artikkeli"] = (byMedia[row.media ?? "artikkeli"] ?? 0) + row.n;
		const pp = await this.d1.prepare("SELECT progress, COUNT(*) AS n FROM bookmarks WHERE progress IS NOT NULL GROUP BY progress").all();
		const byProgress: Record<string, number> = {};
		for (const row of pp.results as { progress: string; n: number }[]) byProgress[row.progress] = row.n;
		return { total, byStatus, byRating, byMedia, byProgress };
	}

	/**
	 * Haku. Kvalifioijat: after:YYYY-MM-DD, before:YYYY-MM-DD, list:"Nimi" tai list:Nimi,
	 * status:inbox|noudettu|ei-noudettavissa|kortitettu, has:note, -has:note.
	 * Loput on FTS5-vapaatekstiä. Ilman vapaatekstiä järjestys on saved_at DESC.
	 */
	async search(opts: SearchOptions): Promise<SearchResult> {
		const limit = Math.min(Math.max(opts.limit ?? 10, 1), 100);
		const offset = Math.max(parseInt(opts.cursor ?? "0", 10) || 0, 0);
		const { terms, where, binds } = parseQuery(opts.q ?? "");
		const useFts = terms.length > 0;

		let sql: string;
		let order: string;
		if (useFts) {
			const match = terms.map((t) => `"${t.replace(/"/g, '""')}"*`).join(" ");
			binds.unshift(match);
			order =
				opts.sort === "asc" ? "b.saved_at ASC"
				: opts.sort === "desc" ? "b.saved_at DESC"
				: opts.sort === "rating" ? "b.rating DESC NULLS LAST, b.saved_at DESC"
				: "bm25(bookmarks_fts)";
			sql = `SELECT b.* FROM bookmarks_fts f JOIN bookmarks b ON b.rowid = f.rowid
			       WHERE bookmarks_fts MATCH ? ${where ? "AND " + where : ""} ORDER BY ${order} LIMIT ? OFFSET ?`;
		} else {
			order = opts.sort === "asc" ? "b.saved_at ASC" : opts.sort === "rating" ? "b.rating DESC NULLS LAST, b.saved_at DESC" : "b.saved_at DESC";
			sql = `SELECT b.* FROM bookmarks b ${where ? "WHERE " + where : ""} ORDER BY ${order} LIMIT ? OFFSET ?`;
		}
		const rows = await this.d1
			.prepare(sql)
			.bind(...binds, limit + 1, offset)
			.all();
		const results = (rows.results as Record<string, unknown>[]).map(rowToBookmark);
		const more = results.length > limit;
		return {
			bookmarks: more ? results.slice(0, limit) : results,
			nextCursor: more ? String(offset + limit) : null,
		};
	}

	async exportAll(): Promise<{ bookmarks: Bookmark[]; lists: List[] }> {
		const rows = await this.d1.prepare("SELECT * FROM bookmarks ORDER BY saved_at DESC").all();
		return {
			bookmarks: (rows.results as Record<string, unknown>[]).map(rowToBookmark),
			lists: await this.lists(),
		};
	}
}

function parseQuery(q: string): { terms: string[]; where: string; binds: unknown[] } {
	const conds: string[] = [];
	const binds: unknown[] = [];
	const terms: string[] = [];
	// Tunnista kvalifioijat: avain:"arvo välilyönnein" tai avain:arvo
	const re = /(-?)(\w+):(?:"([^"]*)"|(\S+))|"([^"]+)"|(\S+)/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(q))) {
		if (m[2]) {
			const neg = m[1] === "-";
			const key = m[2].toLowerCase();
			const val = m[3] ?? m[4] ?? "";
			switch (key) {
				case "after":
					conds.push("b.saved_at >= ?");
					binds.push(val.length === 10 ? val + "T00:00:00.000Z" : val);
					break;
				case "before":
					conds.push("b.saved_at <= ?");
					binds.push(val.length === 10 ? val + "T23:59:59.999Z" : val);
					break;
				case "list":
					conds.push(`${neg ? "NOT " : ""}EXISTS (SELECT 1 FROM json_each(b.lists_json) WHERE json_each.value = ?)`);
					binds.push(val);
					break;
				case "status":
					conds.push(`b.status ${neg ? "!=" : "="} ?`);
					binds.push(val);
					break;
				case "has":
					if (val === "note") conds.push(neg ? "(b.note IS NULL OR b.note = '')" : "(b.note IS NOT NULL AND b.note <> '')");
					else if (val === "excerpt") conds.push(neg ? "(b.excerpt IS NULL OR b.excerpt = '')" : "(b.excerpt IS NOT NULL AND b.excerpt <> '')");
					else if (val === "summary") conds.push(neg ? "(b.summary IS NULL OR b.summary = '')" : "(b.summary IS NOT NULL AND b.summary <> '')");
					else if (val === "rating") conds.push(neg ? "b.rating IS NULL" : "b.rating IS NOT NULL");
					else if (val === "transcript") conds.push(neg ? "COALESCE(b.transcript_words, 0) = 0" : "b.transcript_words > 0");
					break;
				case "rating": {
					// rating:3 = tasan kolme · rating:2+ = vähintään kaksi · rating:0 = perehdy
					const atLeast = val.endsWith("+");
					const n = parseInt(atLeast ? val.slice(0, -1) : val, 10);
					if (n >= 0 && n <= 3) {
						conds.push(neg ? `(b.rating IS NULL OR b.rating ${atLeast ? "<" : "!="} ?)` : `b.rating ${atLeast ? ">=" : "="} ?`);
						binds.push(n);
					}
					break;
				}
				case "media": {
					// media:kirja · media:podcast,video (pilkulla useampi)
					const ms = val.split(",").map(parseMedia).filter((x): x is Media => !!x);
					if (ms.length) {
						conds.push(`b.media ${neg ? "NOT " : ""}IN (${ms.map(() => "?").join(",")})`);
						binds.push(...ms);
					}
					break;
				}
				case "progress": {
					const pg = parseProgress(val);
					if (pg) conds.push(neg ? "(b.progress IS NULL OR b.progress != ?)" : "b.progress = ?"), binds.push(pg);
					else if (val === "any") conds.push(neg ? "b.progress IS NULL" : "b.progress IS NOT NULL");
					break;
				}
				case "research":
					// research:pyydetty (rutiinin jono) · research:valmis · research:any
					if (val === "any") conds.push(neg ? "b.research_status IS NULL" : "b.research_status IS NOT NULL");
					else if (["pyydetty", "valmis", "ei-onnistu"].includes(val)) conds.push(neg ? "(b.research_status IS NULL OR b.research_status != ?)" : "b.research_status = ?"), binds.push(val);
					break;
				case "is":
					if (val === "inlist") conds.push(neg ? "b.lists_json = '[]'" : "b.lists_json <> '[]'");
					break;
				case "url":
					conds.push(`b.url ${neg ? "NOT " : ""}LIKE ?`);
					binds.push(`%${val}%`);
					break;
				default:
					terms.push(`${m[2]}:${val}`);
			}
		} else {
			const t = (m[5] ?? m[6] ?? "").trim();
			if (t) terms.push(t);
		}
	}
	return { terms, where: conds.join(" AND "), binds };
}
