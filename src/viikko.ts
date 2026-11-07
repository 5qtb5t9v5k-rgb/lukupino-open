// Viikko mediassa: /viikko ja /viikko/:pvm (22.10.2026).
//
// Spotify Wrappedin tapainen kolmen ruudun tarina yhdestä viikosta:
// kansi (määrä, helmet, kuunneltavaa, tutkitut), mitä kulutit (media, pisin
// kuuntelu, tallennusajat) ja ajatus joka jäi (aihe, oma poiminta, pistokoe,
// perehdy-jono). Luvut lasketaan kannasta pyynnön aikana; mallia ei kutsuta.
//
// Viikko on maanantaista sunnuntaihin Helsingin aikaa. Oletus on viimeisin
// päättynyt viikko, sunnuntaina klo 17 jälkeen kuluva viikko (pistokoe
// tulee samaan aikaan). Luvut kertovat mitä tallensit, eivät mitä luit:
// lukutilaa merkitään liian harvoin, jotta siitä voisi laskea kulutusta.
//
// Huom: asiakaskoodi on template literalissa, joten siinä ei saa olla
// kenoviivoja eikä dollari-aaltosulkeita.

import { ICON_LINKS } from "./icon";

const TZ = "Europe/Helsinki";
// Puhetta noin 212 sanaa minuutissa (mitattu: 14 013 sanaa, 66 min jakso).
const SANAA_MIN = 212;

const MEDIA_LBL: Record<string, string> = {
	artikkeli: "Artikkelit", podcast: "Podcastit", video: "Videot", some: "Some",
	kirja: "Kirjat", dokumentti: "Dokumentit", kuva: "Kuvat",
};
const MEDIA_VARI: Record<string, string> = {
	artikkeli: "#e3b341", podcast: "#8fd3b0", some: "#f08a64", kirja: "#b8a6f0",
	video: "#7fb2f0", dokumentti: "#d9d4c7", kuva: "#f0a6c8",
};

function esc(s: unknown): string {
	return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Helsingin paikallisaika osina; Workers tukee Intl-aikavyöhykkeitä. */
function osat(d: Date) {
	const p = Object.fromEntries(
		new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })
			.formatToParts(d)
			.map((x) => [x.type, x.value]),
	);
	return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, wd: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday) };
}

/** Helsingin keskiyö päivälle y-m-d UTC-hetkenä (kesäaika huomioiden). */
function keskiyo(y: number, m: number, d: number): Date {
	const arvaus = new Date(Date.UTC(y, m - 1, d, 0, 0));
	const o = osat(arvaus);
	const ero = (o.h * 60 + o.min) - (o.d !== d ? -24 * 60 : 0);
	return new Date(arvaus.getTime() - ero * 60_000);
}

/** Viikon maanantai (YYYY-MM-DD). Ilman parametria oletusviikko. */
export function viikonAlku(param?: string): string {
	let y: number, m: number, d: number;
	if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) [y, m, d] = param.split("-").map(Number);
	else {
		const nyt = osat(new Date());
		const kuluva = nyt.wd === 6 && nyt.h >= 17;
		const t = new Date(Date.UTC(nyt.y, nyt.m - 1, nyt.d) - (kuluva ? 0 : 7 * 864e5));
		[y, m, d] = [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
	}
	const t = new Date(Date.UTC(y, m - 1, d));
	const wd = (t.getUTCDay() + 6) % 7;
	return new Date(t.getTime() - wd * 864e5).toISOString().slice(0, 10);
}

/** Tämä päivä Helsingin aikaa (YYYY-MM-DD). */
export function tanaan(): string {
	const o = osat(new Date());
	return `${o.y}-${String(o.m).padStart(2, "0")}-${String(o.d).padStart(2, "0")}`;
}

export function lisaa(pvm: string, paivia: number): string {
	return new Date(Date.parse(pvm + "T00:00:00Z") + paivia * 864e5).toISOString().slice(0, 10);
}

function rajat(alku: string): [string, string] {
	const [y, m, d] = alku.split("-").map(Number);
	const loppu = lisaa(alku, 7).split("-").map(Number);
	return [keskiyo(y, m, d).toISOString(), keskiyo(loppu[0], loppu[1], loppu[2]).toISOString()];
}

type Rivi = Record<string, unknown>;

export async function viikko(db: D1Database, alku: string) {
	const [a, b] = rajat(alku);
	const [ea, eb] = rajat(lisaa(alku, -7));
	const [tall, ed, tutk, poim, oma, koe, perehdy] = await db.batch([
		db.prepare("SELECT id, title, url, media, rating, saved_at, transcript_words, lists_json FROM bookmarks WHERE saved_at >= ? AND saved_at < ?").bind(a, b),
		db.prepare("SELECT COUNT(*) AS n FROM bookmarks WHERE saved_at >= ? AND saved_at < ?").bind(ea, eb),
		db.prepare("SELECT COUNT(*) AS n FROM research WHERE created_at >= ? AND created_at < ?").bind(a, b),
		db.prepare("SELECT COUNT(*) AS n, SUM(kind <> 'lahde') AS omat FROM quotes WHERE created_at >= ? AND created_at < ?").bind(a, b),
		db.prepare(
			`SELECT q.text, q.who, b.title FROM quotes q LEFT JOIN bookmarks b ON b.id = q.bookmark_id
			 WHERE q.created_at >= ? AND q.created_at < ? AND (q.kind <> 'lahde' OR q.starred = 1)
			 ORDER BY q.starred DESC, q.kind = 'oma' DESC, q.created_at DESC LIMIT 1`,
		).bind(a, b),
		db.prepare(
			`SELECT q.title, COUNT(i.pos) AS n, SUM(i.answer IS NOT NULL) AS vastattu, SUM(i.answer = i.correct) AS oikein
			 FROM quizzes q JOIN quiz_items i ON i.quiz_id = q.id
			 WHERE q.created_at >= ? AND q.created_at < ? AND (q.scope IS NULL OR q.scope NOT LIKE 'lähtötaso:%')
			 GROUP BY q.id ORDER BY q.created_at DESC LIMIT 1`,
		).bind(a, b),
		db.prepare("SELECT COUNT(*) AS n FROM bookmarks WHERE rating = 0 AND (progress IS NULL OR progress <> 'luettu')"),
	]);
	const rivit = (tall.results ?? []) as Rivi[];
	const media = new Map<string, number>();
	const aiheet = new Map<string, number>();
	const tunnit = new Array(24).fill(0);
	let sanat = 0, jaksot = 0, helmet = 0, perehdyt = 0;
	let pisin: Rivi | null = null;
	for (const r of rivit) {
		const md = (r.media as string) || "artikkeli";
		media.set(md, (media.get(md) ?? 0) + 1);
		for (const l of JSON.parse((r.lists_json as string) || "[]") as string[]) if (l !== "Sisältö puuttuu" && l !== "Luettavaa") aiheet.set(l, (aiheet.get(l) ?? 0) + 1);
		tunnit[osat(new Date(r.saved_at as string)).h]++;
		const w = Number(r.transcript_words) || 0;
		if (w > 0) {
			sanat += w;
			jaksot++;
			if (!pisin || w > Number(pisin.transcript_words)) pisin = r;
		}
		if (r.rating === 3) helmet++;
		if (r.rating === 0) perehdyt++;
	}
	const k = (koe.results?.[0] ?? null) as Rivi | null;
	const p = (poim.results?.[0] ?? {}) as Rivi;
	return {
		alku,
		loppu: lisaa(alku, 6),
		n: rivit.length,
		edellinen: Number((ed.results?.[0] as Rivi)?.n) || 0,
		helmet,
		perehdyt,
		tunnit: sanat / SANAA_MIN / 60,
		jaksot,
		tutkitut: Number((tutk.results?.[0] as Rivi)?.n) || 0,
		poiminnat: Number(p.n) || 0,
		omat: Number(p.omat) || 0,
		media: [...media].sort((x, y) => y[1] - x[1]),
		aiheet: [...aiheet].sort((x, y) => y[1] - x[1]),
		tuntijakauma: tunnit,
		ilta: tunnit.slice(19).reduce((s, x) => s + x, 0),
		pisin: pisin ? { title: pisin.title || pisin.url, min: Math.round(Number(pisin.transcript_words) / SANAA_MIN), media: pisin.media } : null,
		ajatus: (oma.results?.[0] ?? null) as { text: string; who: string | null; title: string | null } | null,
		koe: k && Number(k.vastattu) === Number(k.n) ? { n: Number(k.n), oikein: Number(k.oikein) || 0 } : null,
		perehdyJono: Number((perehdy.results?.[0] as Rivi)?.n) || 0,
	};
}

type Viikko = Awaited<ReturnType<typeof viikko>>;

const fmt = (x: number) => x.toLocaleString("fi-FI", { maximumFractionDigits: 1 });
function pv(iso: string) {
	const [, m, d] = iso.split("-").map(Number);
	return `${d}.${m}.`;
}

function palkit(n: number, aktiivinen: number) {
	return `<div class="pb">${Array.from({ length: n }, (_, i) => `<i class="${i <= aktiivinen ? "on" : ""}"></i>`).join("")}</div>`;
}

function kansi(v: Viikko) {
	const ero = v.n - v.edellinen;
	return `<section class="r r1">${palkit(3, 0)}
<div class="yl"><b>LUKUPINO</b><span>${pv(v.alku)}–${pv(v.loppu)}${v.loppu.slice(0, 4)}</span></div>
<h1>Viikkosi<br>mediassa</h1>
<div class="iso">${v.n}</div>
<p class="ala">tallennusta${v.edellinen || v.n ? ` · ${ero >= 0 ? "+" : "−"}${Math.abs(ero)} edelliseen viikkoon` : ""}</p>
<div class="kolme">
<div><span>${v.helmet}</span><em>helmeä ★★★</em></div>
<div><span>${fmt(Math.round(v.tunnit * 10) / 10)} h</span><em>kuunneltavaa</em></div>
<div><span>${v.tutkitut}</span><em>tutkittua</em></div>
</div></section>`;
}

function kulutus(v: Viikko) {
	const max = Math.max(1, ...v.tuntijakauma.slice(6));
	const tunnit = v.tuntijakauma.slice(6).map((x, i) => `<i style="height:max(3px,${Math.round((x / max) * 100)}%)" class="${i + 6 >= 19 ? "ilta" : ""}"></i>`).join("");
	const osuus = v.n ? Math.round((v.ilta / v.n) * 100) : 0;
	return `<section class="r r2">${palkit(3, 1)}
<h2>${v.media[0] ? `Eniten: ${esc((MEDIA_LBL[v.media[0][0]] ?? v.media[0][0]).toLowerCase())}` : "Hiljainen viikko"}</h2>
<div class="jana">${v.media.map(([m, n]) => `<i style="flex-grow:${n};background:${MEDIA_VARI[m] ?? "#d9d4c7"}"></i>`).join("")}</div>
<div class="sel">${v.media.map(([m, n]) => `<span><i style="background:${MEDIA_VARI[m] ?? "#d9d4c7"}"></i>${esc(MEDIA_LBL[m] ?? m)}<b>${n}</b></span>`).join("")}</div>
${v.pisin ? `<div class="pisin"><div class="min"><span>${v.pisin.min}</span><em>MIN</em></div><div><em>PISIN KUUNTELU</em><b>${esc(v.pisin.title)}</b><span>${v.jaksot} litteroitua jaksoa viikolla</span></div></div>` : ""}
<div class="lbl">MILLOIN TALLENSIT</div>
<div class="tunnit">${tunnit}</div>
<div class="akseli"><span>klo 6</span><span>12</span><span>18</span><span>24</span></div>
<p class="loppu">${v.ilta} / ${v.n} tallennusta<br><span>klo 19 jälkeen${osuus ? ` · ${osuus} %` : ""}.</span></p>
</section>`;
}

function ajatus(v: Viikko) {
	const aihe = v.aiheet[0];
	const osuus = aihe && v.n ? Math.round((aihe[1] / v.n) * 100) : 0;
	return `<section class="r r3">${palkit(3, 2)}
${aihe ? `<div class="lbl">VIIKON AIHE</div>
<div class="aihe"><span>${osuus} %</span><b>${esc(aihe[0])}<em>${aihe[1]} / ${v.n} tallennusta</em></b></div>
<div class="chip">${v.aiheet.slice(1, 4).map(([l, n]) => `<span>${esc(l)} ${n}</span>`).join("")}</div>` : ""}
${v.ajatus ? `<div class="lbl">AJATUS JOKA JÄI</div>
<blockquote>”${esc(v.ajatus.text.length > 220 ? v.ajatus.text.slice(0, 217) + "…" : v.ajatus.text)}”</blockquote>
<p class="kuka">${esc([v.ajatus.who, v.ajatus.title].filter(Boolean).join(" — "))}</p>` : `<div class="lbl">AJATUS JOKA JÄI</div><p class="kuka">Tällä viikolla ei omia poimintoja. ${v.poiminnat} poimintaa tuli litteraateista.</p>`}
<div class="kaksi">
<a href="/pistokoe"><em>PISTOKOE</em><span>${v.koe ? `${v.koe.oikein}/${v.koe.n}` : "–"}</span><em>${v.koe ? (v.koe.oikein === v.koe.n ? "kaikki muistissa" : "oikein") : "ei tehty"}</em></a>
<a href="/"><em>ENSI VIIKOLLE</em><span>${v.perehdyJono}</span><em>perehdy-jonossa</em></a>
</div>
</section>`;
}

export function viikkoPage(v: Viikko, edellinen: string, seuraava: string | null): string {
	return `<!doctype html><html lang="fi"><head><meta charset="utf-8">${ICON_LINKS}<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="theme-color" content="#13201a"><title>Viikko mediassa · Lukupino</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}html,body{margin:0;background:#0c1511;color:#fbfaf7;font-family:'DM Sans',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.nav{display:flex;justify-content:space-between;align-items:center;max-width:1260px;margin:0 auto;padding:10px 16px;font-size:14px}
.nav a{color:#c9d4cc;text-decoration:none;min-height:44px;display:inline-flex;align-items:center;padding:0 6px}.nav a:hover{color:#fbfaf7}.nav .x{opacity:.35;pointer-events:none}
.rata{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;gap:0}.rata::-webkit-scrollbar{display:none}
.r{flex:0 0 100%;scroll-snap-align:center;min-height:calc(100svh - 64px);padding:18px 24px 30px;display:flex;flex-direction:column;position:relative;overflow:hidden}
.r1{background:#13201a}.r2{background:#1d3a2f}.r3{background:#f3eee2;color:#13201a}
.pb{display:flex;gap:5px}.pb i{flex:1;height:3px;border-radius:2px;background:currentColor;opacity:.28}.pb i.on{opacity:1}
.yl{margin-top:22px;display:flex;justify-content:space-between;font-size:13px}.yl b{letter-spacing:.14em}.yl span{color:#b9c6bd}
h1,h2,.iso,.kolme span,.pisin .min span,.loppu,.aihe span,blockquote,.kaksi span{font-family:'DM Serif Display',Georgia,serif;font-weight:400}
h1{margin:12vh 0 0;font-size:34px;line-height:1.1}
.iso{margin-top:20px;font-size:min(210px,48vw);line-height:.85;color:#e3b341;letter-spacing:-.02em}
.ala{margin:12px 0 0;font-size:18px;font-weight:500}
.kolme{margin-top:auto;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.kolme div{background:rgba(251,250,247,.08);border-radius:16px;padding:14px 12px;display:flex;flex-direction:column;gap:4px}
.kolme span{font-size:28px;line-height:1}.kolme em,.pisin em,.kaksi em{font-style:normal;font-size:12.5px;color:#c9d4cc}
h2{margin:36px 0 0;font-size:32px;line-height:1.12}
.jana{margin-top:22px;display:flex;height:18px;border-radius:9px;overflow:hidden;gap:2px}.jana i{display:block}
.sel{margin-top:14px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 18px}
.sel span{display:flex;align-items:center;gap:8px;font-size:15px}.sel i{width:10px;height:10px;border-radius:5px;flex:0 0 auto}.sel b{margin-left:auto}
.pisin{margin-top:28px;background:rgba(251,250,247,.08);border-radius:18px;padding:16px;display:flex;gap:14px;align-items:center}
.pisin .min{width:64px;height:64px;border-radius:12px;background:#e3b341;color:#13201a;display:flex;flex-direction:column;align-items:center;justify-content:center;flex:0 0 auto}
.pisin .min span{font-size:26px;line-height:1}.pisin .min em{color:#13201a;font-weight:700;font-size:11px}
.pisin div:last-child{display:flex;flex-direction:column;gap:3px;min-width:0}.pisin b{font-size:16px;line-height:1.25}.pisin div:last-child span{font-size:13.5px;color:#c9d4cc}
.lbl{margin-top:30px;font-size:12px;font-weight:700;letter-spacing:.12em;opacity:.75}
.tunnit{margin-top:10px;height:114px;display:flex;align-items:flex-end;gap:4px}.tunnit i{flex:1;border-radius:4px 4px 2px 2px;background:rgba(251,250,247,.35)}.tunnit i.ilta{background:#e3b341}
.akseli{margin-top:6px;display:flex;justify-content:space-between;font-size:11.5px;color:#c9d4cc}
.loppu{margin:auto 0 0;padding-top:24px;font-size:26px;line-height:1.15}.loppu span{color:#e3b341}
.aihe{margin-top:8px;display:flex;align-items:baseline;gap:12px}.aihe span{font-size:72px;line-height:.9}.aihe b{font-size:17px;font-weight:500;line-height:1.25;display:flex;flex-direction:column}.aihe em{font-style:normal;color:#5b6b61}
.chip{margin-top:14px;display:flex;flex-wrap:wrap;gap:8px}.chip span{border:1.5px solid #13201a;border-radius:999px;padding:5px 12px;font-size:13.5px;font-weight:500}
blockquote{margin:12px 0 0;font-size:28px;line-height:1.18}
.kuka{margin:12px 0 0;font-size:14px;color:#5b6b61}
.kaksi{margin-top:auto;padding-top:24px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.kaksi a{background:#13201a;color:#fbfaf7;border-radius:18px;padding:16px;display:flex;flex-direction:column;gap:4px;text-decoration:none}
.kaksi span{font-size:40px;line-height:1;color:#e3b341}
@media(max-height:900px) and (max-width:999px){h2{margin-top:22px;font-size:28px}.pisin{margin-top:18px}.lbl{margin-top:20px}.tunnit{height:72px}.sel{gap:8px 18px}.jana{margin-top:16px}.loppu{font-size:23px;padding-top:16px}h1{margin-top:7vh}blockquote{font-size:25px}}
@media(min-width:1000px){.rata{max-width:1260px;margin:0 auto;padding:8px 16px 40px;gap:24px;overflow:visible}.r{flex:1 1 0;min-height:820px;border-radius:28px}}
</style></head><body>
<div class="nav"><a href="/viikko/${edellinen}">‹ ${pv(edellinen)}</a><a href="/">Lukupino</a>${seuraava ? `<a href="/viikko/${seuraava}">${pv(seuraava)} ›</a>` : `<a class="x" href="/viikko">${pv(lisaa(v.alku, 7))} ›</a>`}</div>
<main class="rata" id="rata">${kansi(v)}${kulutus(v)}${ajatus(v)}</main>
<script>
// Napautus oikeaan reunaan seuraavaan ruutuun, vasempaan edelliseen (vain puhelimessa).
const rata=document.getElementById('rata');
rata.addEventListener('click',function(e){if(innerWidth>=1000||e.target.closest('a'))return;
 const w=rata.clientWidth;rata.scrollBy({left:e.clientX>w*0.35?w:-w,behavior:'smooth'})});
</script>
</body></html>`;
}
