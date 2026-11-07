// Selaus-UI:n istunto: HMAC-allekirjoitettu cookie. Avain = COOKIE_ENCRYPTION_KEY.
// Ei tietokantaa, ei tilaa — cookie sisältää loginin ja vanhenemisajan.

const COOKIE = "lp_session";
const TTL_S = 60 * 60 * 24 * 30; // 30 pv

async function hmac(key: string, data: string): Promise<string> {
	const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
	return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export async function makeSessionCookie(key: string, login: string): Promise<string> {
	if (!key) throw new Error("COOKIE_ENCRYPTION_KEY puuttuu");
	const exp = Math.floor(Date.now() / 1000) + TTL_S;
	const payload = `${login}.${exp}`;
	const sig = await hmac(key, payload);
	return `${COOKIE}=${payload}.${sig}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_S}`;
}

export function clearSessionCookie(): string {
	return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** Palauttaa loginin jos cookie on ehjä ja voimassa, muuten null. */
export async function readSession(req: Request, key: string): Promise<string | null> {
	// Ilman avainta mikään eväste ei ole voimassa (ei edes tyhjällä avaimella allekirjoitettu).
	if (!key) return null;
	const raw = req.headers.get("cookie") ?? "";
	const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`).exec(raw);
	if (!m) return null;
	const parts = m[1].split(".");
	if (parts.length !== 3) return null;
	const [login, expS, sig] = parts;
	const exp = parseInt(expS, 10);
	if (!exp || exp < Math.floor(Date.now() / 1000)) return null;
	const expect = await hmac(key, `${login}.${exp}`);
	if (expect.length !== sig.length) return null;
	let r = 0;
	for (let i = 0; i < sig.length; i++) r |= sig.charCodeAt(i) ^ expect.charCodeAt(i);
	return r === 0 ? login : null;
}
