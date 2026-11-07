// Tutkimus omassa taulussaan (migraatio 0012). Omistaja pyytää sen jakaessa
// numerolla 4 tai kortin Tutki-napilla; rutiini kirjoittaa sen sapluunalla
// skills/lukupino-tutki/SKILL.md ja tallentaa markdownina. Lukunäkymä on
// /tutkimus/:id (tutkimus.ts), joka saa valmiin HTML:n renderMarkdownilta.
//
// Tila on kirjanmerkillä (research_status): NULL → pyydetty → valmis, tai
// ei-onnistu syineen. Arvio (0–3) ei muutu: "4" on toimeksianto, ei arvosana.

import { nowIso } from "./db";

export const RESEARCH_STATUS = ["pyydetty", "valmis", "ei-onnistu"] as const;
export type ResearchStatus = (typeof RESEARCH_STATUS)[number];
export const MAX_RESEARCH = 200_000;
/** Jakovalikon numero, joka tarkoittaa "tee tästä tutkimus". */
export const RESEARCH_RATING = 4;

export function wantsResearch(v: unknown): boolean {
	return Number(String(v ?? "").trim()) === RESEARCH_RATING;
}

export interface Research {
	bookmark_id: string;
	text: string;
	note: string | null;
	created_at: string;
}

export async function getResearch(d1: D1Database, bookmarkId: string): Promise<Research | null> {
	const r = await d1.prepare("SELECT * FROM research WHERE bookmark_id = ?").bind(bookmarkId).first();
	return (r as unknown as Research) ?? null;
}

/**
 * Pyydä tai peru. Pyyntö ei koske valmista tutkimusta (sen uusiminen on
 * `force`), jottei sama juttu jaettuna uudelleen tyhjennä tehtyä työtä.
 * Palauttaa uuden tilan, tai undefined jos kirjanmerkkiä ei ole.
 */
export async function requestResearch(d1: D1Database, bookmarkId: string, on: boolean, force = false): Promise<ResearchStatus | null | undefined> {
	const row = (await d1.prepare("SELECT research_status FROM bookmarks WHERE id = ?").bind(bookmarkId).first()) as { research_status: string | null } | null;
	if (!row) return undefined;
	const cur = (row.research_status as ResearchStatus | null) ?? null;
	let next: ResearchStatus | null = cur;
	if (on) next = cur === "valmis" && !force ? "valmis" : "pyydetty";
	else if (cur === "pyydetty") next = null;
	if (next !== cur) await d1.prepare("UPDATE bookmarks SET research_status = ? WHERE id = ?").bind(next, bookmarkId).run();
	return next;
}

/** Tallenna tai korvaa; tila valmiiksi. False, jos kirjanmerkkiä ei ole. */
export async function putResearch(d1: D1Database, bookmarkId: string, text: string): Promise<boolean> {
	const exists = await d1.prepare("SELECT 1 FROM bookmarks WHERE id = ?").bind(bookmarkId).first();
	if (!exists) return false;
	await d1.batch([
		d1
			.prepare(
				`INSERT INTO research (bookmark_id, text, note, created_at) VALUES (?, ?, NULL, ?)
				 ON CONFLICT(bookmark_id) DO UPDATE SET text = excluded.text, note = NULL, created_at = excluded.created_at`,
			)
			.bind(bookmarkId, text, nowIso()),
		d1.prepare("UPDATE bookmarks SET research_status = 'valmis' WHERE id = ?").bind(bookmarkId),
	]);
	return true;
}

/** Ei onnistunut (sisältöä ei saatu, aihe liian ohut): syy talteen, jono ei ota uudelleen. */
export async function markResearchFailed(d1: D1Database, bookmarkId: string, reason: string): Promise<boolean> {
	const r = await d1.prepare("UPDATE bookmarks SET research_status = 'ei-onnistu' WHERE id = ?").bind(bookmarkId).run();
	if (!r.meta.changes) return false;
	await d1
		.prepare(
			`INSERT INTO research (bookmark_id, text, note, created_at) VALUES (?, '', ?, ?)
			 ON CONFLICT(bookmark_id) DO UPDATE SET note = excluded.note, created_at = excluded.created_at`,
		)
		.bind(bookmarkId, reason.slice(0, 500), nowIso())
		.run();
	return true;
}

// --- Markdown → HTML ---
// Rutiinin kirjoittama markdown on tavallista: otsikot, kappaleet, listat,
// lainaukset, viiva, lihavointi, kursiivi, koodi ja linkit. Kaikki teksti
// escapetaan ensin; linkeistä hyväksytään vain http(s).

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(raw: string): string {
	const codes: string[] = [];
	let s = esc(raw).replace(/`([^`]+)`/g, (_, c: string) => {
		codes.push(`<code>${c}</code>`);
		return `\u0000${codes.length - 1}\u0000`;
	});
	s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t: string, u: string) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
	s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
	s = s.replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, "$1<em>$2</em>");
	// Paljas osoite linkiksi; lauseen loppumerkki jää linkin ulkopuolelle.
	s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]*[^\s<).,;:!?])/g, (_, pre: string, u: string) => `${pre}<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
	return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => codes[Number(i)]);
}

// --- Kuvat (1.11.2026) ---
// Tutkimuksessa voi olla 1–5 kuvaa aidattuina lohkoina, kuvateksti
// aloitusrivillä: ```svg Kuvateksti … ``` (oma infograafi, inline-SVG) tai
// ```mermaid Kuvateksti … ``` (kaavio, jonka sivu piirtää Mermaidilla).
// SVG on rutiinin kirjoittamaa, mutta se näytetään myös jaettavassa
// versiossa, joten siitä poistetaan kaikki suoritettava: skriptit,
// tapahtumamääreet, ulkoiset linkit ja foreignObject.
export const MAX_SVG = 80_000;

export function sanitizeSvg(raw: string): string | null {
	let s = raw.trim();
	if (!/^<svg[\s>]/i.test(s) || !/<\/svg>$/i.test(s) || s.length > MAX_SVG) return null;
	s = s.replace(/<(script|foreignObject|iframe|object|embed|style|image|use)\b[\s\S]*?<\/\1\s*>/gi, "");
	s = s.replace(/<(script|foreignObject|iframe|object|embed|style|image|use)\b[^>]*\/?>/gi, "");
	s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
	s = s.replace(/\s(xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*'|(?!["'#])[^\s>]+)/gi, "");
	s = s.replace(/javascript:/gi, "").replace(/<!--[\s\S]*?-->/g, "");
	return s;
}

function figure(kind: string, caption: string, body: string): string {
	const cap = caption ? `<figcaption>${inline(caption)}</figcaption>` : "";
	if (kind === "mermaid") return `<figure class="kuva"><pre class="mermaid">${esc(body)}</pre>${cap}</figure>`;
	const svg = sanitizeSvg(body);
	if (!svg) return "";
	// Leveä kaavio (viewBox yli 600) vierii mobiilissa sivuttain, ettei teksti kutistu lukukelvottomaksi.
	const w = Number(/viewBox\s*=\s*["'][\d.\s-]+?\s([\d.]+)\s+[\d.]+["']/i.exec(svg)?.[1] ?? 0);
	return `<figure class="kuva"><div class="sv${w > 600 ? " leve" : ""}">${svg}</div>${cap}</figure>`;
}

export function renderMarkdown(md: string): string {
	const out: string[] = [];
	const lines = md.replace(/\r\n?/g, "\n").split("\n");
	let para: string[] = [];
	let list: { tag: "ul" | "ol"; items: string[] } | null = null;
	let quote: string[] = [];
	const flushPara = () => {
		if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
		para = [];
	};
	const flushList = () => {
		if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join("")}</${list.tag}>`);
		list = null;
	};
	const flushQuote = () => {
		if (quote.length) out.push(`<blockquote>${inline(quote.join(" "))}</blockquote>`);
		quote = [];
	};
	const flushAll = () => {
		flushPara();
		flushList();
		flushQuote();
	};
	let fence: { kind: string; caption: string; body: string[] } | null = null;
	for (const raw of lines) {
		const line = raw.replace(/\s+$/, "");
		const t = line.trim();
		if (fence) {
			if (/^```\s*$/.test(t)) {
				out.push(figure(fence.kind, fence.caption, fence.body.join("\n")));
				fence = null;
			} else fence.body.push(line);
			continue;
		}
		const f = /^```(svg|mermaid)\b\s*(.*)$/.exec(t);
		if (f) {
			flushAll();
			fence = { kind: f[1], caption: f[2].trim(), body: [] };
			continue;
		}
		if (!t) {
			flushAll();
			continue;
		}
		const h = /^(#{1,4})\s+(.+)$/.exec(t);
		if (h) {
			flushAll();
			const n = Math.min(4, Math.max(2, h[1].length)); // # ja ## → h2: sivun h1 on tallennuksen otsikko
			out.push(`<h${n}>${inline(h[2])}</h${n}>`);
			continue;
		}
		if (/^(-{3,}|\*{3,})$/.test(t)) {
			flushAll();
			out.push("<hr>");
			continue;
		}
		if (t.startsWith(">")) {
			flushPara();
			flushList();
			quote.push(t.replace(/^>\s?/, ""));
			continue;
		}
		const ul = /^[-*]\s+(.+)$/.exec(t);
		const ol = /^\d+[.)]\s+(.+)$/.exec(t);
		const indented = /^\s{2,}/.test(line);
		if (ul || ol) {
			flushPara();
			flushQuote();
			const tag = ul ? "ul" : "ol";
			const text = inline((ul ?? ol)![1]);
			const cur = list as { tag: "ul" | "ol"; items: string[] } | null;
			if (indented && cur && cur.items.length) {
				// Sisennetty kohta: alalista edellisen kohdan sisään.
				const last = cur.items.length - 1;
				const sub = cur.items[last].match(/<(ul|ol)>(.*)<\/\1>$/);
				cur.items[last] = sub ? cur.items[last].replace(/<\/(ul|ol)>$/, `<li>${text}</li></$1>`) : `${cur.items[last]}<${tag}><li>${text}</li></${tag}>`;
				continue;
			}
			if (!cur || cur.tag !== tag) {
				flushList();
				list = { tag, items: [] };
			}
			list!.items.push(text);
			continue;
		}
		if (list && indented) {
			// Listakohdan jatkorivi.
			const cur = list as { tag: "ul" | "ol"; items: string[] };
			cur.items[cur.items.length - 1] += " " + inline(t);
			continue;
		}
		flushList();
		flushQuote();
		para.push(t);
	}
	flushAll();
	return out.join("\n");
}

// --- Jaettava versio ---
// Omistajan omat yhteydet (tallennukset, oma työ) kirjoitetaan sapluunassa
// listakohtiin, jotka alkavat näillä lihavoiduilla nimillä. Jaettavasta
// versiosta ne jätetään pois kokonaan jatkoriveineen (skills/lukupino-tutki).
export const PERSONAL_LABELS = ["Lukupinossasi jo", "Omassa työssäsi"];

export function stripPersonal(md: string): string {
	const out: string[] = [];
	let skipping = false;
	const personal = (t: string) => PERSONAL_LABELS.some((l) => t.replace(/^[-*]\s+/, "").startsWith(`**${l}`));
	for (const line of md.replace(/\r\n?/g, "\n").split("\n")) {
		const t = line.trim();
		if (personal(t)) {
			skipping = true;
			continue;
		}
		if (skipping) {
			// Jatkorivi: sisennetty rivi tai saman kappaleen jatko ilman uutta listakohtaa.
			const newItem = /^([-*]|\d+[.)])\s+/.test(t) && !/^\s{2,}/.test(line);
			if (t && !newItem && !t.startsWith("#")) continue;
			skipping = false;
		}
		out.push(line);
	}
	return out.join("\n");
}
