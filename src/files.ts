// Tiedostovarasto. Tavut KV:ssä, metatiedot D1:ssä (bookmarks.file_*).
//
// Kaksi taustaa: R2 jos binding on, muuten KV. Ks. storageBackend().

/** Varmuusmarginaali KV:n 25 Mt:n rajaan. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Tyypit joita selain osaa näyttää suoraan; muut tarjotaan latauksena. */
const INLINE = /^(image\/(png|jpeg|gif|webp|avif|svg\+xml)|application\/pdf|text\/(plain|html))$/;

/** Tekstimuotoiset liitteet, joita Claude voi tallentaa MCP:llä (attach-file). */
export const TEXT_ATTACH = /^(text\/(html|markdown|plain|csv)|application\/json|image\/svg\+xml)$/;

/**
 * HTML ja SVG ovat koodia. Ne tarjoillaan lukupinon omasta osoitteesta, joten
 * ilman eristystä artefaktin skripti pääsisi istuntoevästeen kanssa /ui/*-
 * reitteihin. CSP sandbox ilman allow-same-origin antaa sivulle läpinäkymättömän
 * alkuperän: skriptit pyörivät, mutta eivät näe lukupinoa. Lisätty 17.10.2026.
 */
export function isolationHeaders(type: string): Record<string, string> {
	if (!/^(text\/html|image\/svg\+xml)$/.test(type)) return {};
	return {
		"content-security-policy": "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals",
		"x-content-type-options": "nosniff",
	};
}

/** HTML:stä haettava teksti otteeksi: skriptit ja tyylit pois, tagit pois, välit tiivistetään. */
export function htmlToText(html: string): string {
	return html
		.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
		.replace(/<br\s*\/?>|<\/(p|div|h[1-6]|li|tr|section|article)>/gi, "\n")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
		.replace(/[ \t]+/g, " ")
		.replace(/\s*\n\s*/g, "\n")
		.trim();
}

const EXT: Record<string, string> = {
	pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
	gif: "image/gif", webp: "image/webp", avif: "image/avif", svg: "image/svg+xml",
	heic: "image/heic", txt: "text/plain", md: "text/markdown", csv: "text/csv", html: "text/html", htm: "text/html",
	json: "application/json", rtf: "application/rtf", epub: "application/epub+zip",
	doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	zip: "application/zip", mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "video/mp4",
};

export function guessType(name: string, given?: string | null): string {
	if (given && given !== "application/octet-stream") return given;
	const ext = name.split(".").pop()?.toLowerCase() ?? "";
	return EXT[ext] ?? "application/octet-stream";
}

export function isImage(type: string): boolean {
	return type.startsWith("image/");
}

/** Onko tyypistä luettavissa tekstiä rutiinilla (/lukupino-rikasta)? */
export function isReadableDoc(type: string): boolean {
	return /^(application\/pdf|text\/|application\/(json|rtf|epub\+zip)|application\/vnd\.openxmlformats)/.test(type);
}

export function newFileKey(id: string, name: string): string {
	const ext = name.includes(".") ? "." + name.split(".").pop()!.toLowerCase().slice(0, 8) : "";
	return `f/${id}${ext.replace(/[^a-z0-9.]/g, "")}`;
}

/**
 * Kaksi taustaa saman rajapinnan takana. R2 kun `FILES_R2`-binding on
 * olemassa (10 Gt ilmaiseksi, tehty tähän), muuten KV (25 Mt/arvo, 1 Gt).
 * Binding lisätään wrangler.jsonc:hen vasta kun ämpäri on luotu — muuten
 * deploy epäonnistuu. Vaihto: bucket create → binding → deploy →
 * POST /api/files/migrate.
 */
function r2(env: Env): R2Bucket | null {
	return (env as { FILES_R2?: R2Bucket }).FILES_R2 ?? null;
}

export function storageBackend(env: Env): "r2" | "kv" {
	return r2(env) ? "r2" : "kv";
}

export async function putFile(env: Env, key: string, bytes: ArrayBuffer, meta: { name: string; type: string }): Promise<void> {
	const b = r2(env);
	if (b) {
		await b.put(key, bytes, { httpMetadata: { contentType: meta.type }, customMetadata: { name: meta.name } });
		return;
	}
	await env.FILES.put(key, bytes, { metadata: meta });
}

export async function getFile(env: Env, key: string): Promise<{ body: ArrayBuffer; name: string; type: string } | null> {
	const b = r2(env);
	if (b) {
		const o = await b.get(key);
		if (o) return { body: await o.arrayBuffer(), name: o.customMetadata?.name ?? "tiedosto", type: o.httpMetadata?.contentType ?? "application/octet-stream" };
		// Siirtymäaika: jos R2:ssa ei ole, katsotaan vielä KV:stä.
	}
	const r = await env.FILES.getWithMetadata<{ name: string; type: string }>(key, "arrayBuffer");
	if (!r.value) return null;
	return { body: r.value, name: r.metadata?.name ?? "tiedosto", type: r.metadata?.type ?? "application/octet-stream" };
}

export async function deleteFile(env: Env, key: string): Promise<void> {
	const b = r2(env);
	if (b) await b.delete(key);
	await env.FILES.delete(key);
}

/** Siirrä yksi tiedosto KV:stä R2:een. Palauttaa false jos R2:ta ei ole tai KV:ssä ei ollut. */
export async function migrateFileToR2(env: Env, key: string): Promise<boolean> {
	const b = r2(env);
	if (!b) return false;
	if (await b.head(key)) return true; // jo siirretty
	const r = await env.FILES.getWithMetadata<{ name: string; type: string }>(key, "arrayBuffer");
	if (!r.value) return false;
	await b.put(key, r.value, { httpMetadata: { contentType: r.metadata?.type ?? "application/octet-stream" }, customMetadata: { name: r.metadata?.name ?? "tiedosto" } });
	await env.FILES.delete(key);
	return true;
}

/** Content-Disposition: kuvat ja PDF:t selaimeen, loput latauksena. */
export function disposition(name: string, type: string): string {
	const safe = name.replace(/["\\\r\n]/g, "_");
	const kind = INLINE.test(type) ? "inline" : "attachment";
	return `${kind}; filename*=UTF-8''${encodeURIComponent(name)}; filename="${safe}"`;
}
