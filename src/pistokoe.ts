// Pistokoe: /pistokoe ja /pistokoe/:id (20.10.2026).
//
// Rutiini (skills/lukupino-pistokoe) koostaa sunnuntaisin 12 väitettä viikon
// tallennuksista ja tallentaa ne POST /api/quiz. Omistaja vastaa puhelimella:
// tosi, epätosi tai en muista, ja tosi/epätosi-vastaukseen lisäksi varmuus.
// Oikea vastaus, perustelu ja lähde näytetään heti vastauksen jälkeen.
// Seuraava aamurutiini lukee vastaukset ja kirjoittaa palautteen
// (POST /api/quiz/:id/feedback). Väärin, en muista ja arvaukset kysytään
// uudelleen (GET /api/quiz/kertaus → repeat_of).
//
// Worker ei kutsu kielimallia: väitteet ja palaute tekee rutiini.
//
// Huom: asiakaskoodi on template literalissa, joten siinä ei saa olla
// kenoviivoja eikä dollari-aaltosulkeita.

import { ICON_LINKS } from "./icon";
import { newId, nowIso } from "./db";
import { renderMarkdown } from "./research";

export const QUIZ_KINDS = ["väite", "vääristelty", "yhteys", "poiminta", "kertaus"] as const;
export const QUIZ_VIEWS = ["litteraatti", "lue", "kirja", "tutkimus", "poiminnat", "lähde"] as const;
export const MAX_ITEMS = 20;
export const MAX_FEEDBACK = 20_000;

export interface QuizItemInput {
	statement: string;
	correct: boolean | number;
	explanation: string;
	bookmark_id?: string | null;
	anchor?: string | null;
	kind?: string | null;
	view?: string | null;
	repeat_of?: string | null;
	area?: string | null;
	level?: string | null;
	src_url?: string | null;
	src_title?: string | null;
}

interface ItemRow {
	quiz_id: string;
	pos: number;
	statement: string;
	correct: number;
	explanation: string;
	bookmark_id: string | null;
	anchor: string | null;
	kind: string | null;
	view: string | null;
	repeat_of: string | null;
	area: string | null;
	level: string | null;
	src_url: string | null;
	src_title: string | null;
	answer: number | null;
	confident: number | null;
	answered_at: string | null;
	b_title?: string | null;
	b_url?: string | null;
	b_media?: string | null;
	b_excerpt_len?: number | null;
	b_words?: number | null;
	b_research?: string | null;
}

const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Luo koe. Palauttaa id:n tai virheviestin. */
export async function createQuiz(d1: D1Database, input: { title?: string; scope?: string; items?: QuizItemInput[] }): Promise<{ id: string; n: number } | { error: string }> {
	const title = txt(input.title, 200);
	if (!title) return { error: "Anna title" };
	const items = Array.isArray(input.items) ? input.items : [];
	if (items.length < 3 || items.length > MAX_ITEMS) return { error: `Väitteitä pitää olla 3–${MAX_ITEMS}` };
	const rows: ItemRow[] = [];
	for (const [i, it] of items.entries()) {
		const statement = txt(it.statement, 500);
		const explanation = txt(it.explanation, 1000);
		const correct = it.correct === true || it.correct === 1 ? 1 : it.correct === false || it.correct === 0 ? 0 : null;
		if (statement.length < 10 || !explanation || correct === null) return { error: `Väite ${i + 1}: statement, explanation ja correct (true/false) tarvitaan` };
		const kind = it.kind && (QUIZ_KINDS as readonly string[]).includes(it.kind) ? it.kind : null;
		const view = it.view && (QUIZ_VIEWS as readonly string[]).includes(it.view) ? it.view : null;
		const repeat = it.repeat_of && /^[a-z0-9]{1,40}:\d{1,3}$/.test(it.repeat_of) ? it.repeat_of : null;
		rows.push({
			quiz_id: "",
			pos: i + 1,
			statement,
			correct,
			explanation,
			bookmark_id: txt(it.bookmark_id, 40) || null,
			anchor: txt(it.anchor, 1000) || null,
			kind,
			view,
			repeat_of: repeat,
			area: txt(it.area, 60) || null,
			level: it.level === "perus" || it.level === "edistynyt" ? it.level : null,
			src_url: typeof it.src_url === "string" && /^https?:\/\/\S+$/.test(it.src_url.trim()) ? it.src_url.trim().slice(0, 500) : null,
			src_title: txt(it.src_title, 120) || null,
			answer: null,
			confident: null,
			answered_at: null,
		});
	}
	const id = newId();
	await d1.batch([
		d1.prepare("INSERT INTO quizzes (id, title, scope, created_at) VALUES (?, ?, ?, ?)").bind(id, title, txt(input.scope, 200) || null, nowIso()),
		...rows.map((r) =>
			d1
				.prepare("INSERT INTO quiz_items (quiz_id, pos, statement, correct, explanation, bookmark_id, anchor, kind, view, repeat_of, area, level, src_url, src_title) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
				.bind(id, r.pos, r.statement, r.correct, r.explanation, r.bookmark_id, r.anchor, r.kind, r.view, r.repeat_of, r.area, r.level, r.src_url, r.src_title),
		),
	]);
	return { id, n: rows.length };
}

const ITEM_SELECT = `SELECT i.*, b.title AS b_title, b.url AS b_url, b.media AS b_media, length(b.excerpt) AS b_excerpt_len,
	b.transcript_words AS b_words, b.research_status AS b_research
	FROM quiz_items i LEFT JOIN bookmarks b ON b.id = i.bookmark_id`;

/** Mihin lähdelinkki vie: väitteen oma näkymä, muuten paras saatavilla oleva. */
function source(r: ItemRow): { title: string; href: string; ext: boolean } | null {
	// Lähtötasotestin väite tulee dokumentaatiosta, ei tallennuksesta.
	if ((!r.bookmark_id || !r.b_url) && r.src_url) return { title: r.src_title || new URL(r.src_url).hostname, href: r.src_url, ext: true };
	if (!r.bookmark_id || !r.b_url) return null;
	const id = encodeURIComponent(r.bookmark_id);
	const title = r.b_title || r.b_url;
	const v =
		r.view ??
		(r.b_words ? "litteraatti" : r.b_media === "kirja" ? "kirja" : (r.b_excerpt_len ?? 0) >= 200 ? "lue" : r.b_research === "valmis" ? "tutkimus" : "lähde");
	if (v === "poiminnat") return { title, href: "/poiminnat", ext: false };
	if (v === "lähde") return { title, href: r.b_url, ext: true };
	return { title, href: `/${v}/${id}`, ext: false };
}

export async function getQuiz(d1: D1Database, id: string) {
	const q = (await d1.prepare("SELECT * FROM quizzes WHERE id = ?").bind(id).first()) as Record<string, string | null> | null;
	if (!q) return null;
	const items = ((await d1.prepare(`${ITEM_SELECT} WHERE i.quiz_id = ? ORDER BY i.pos`).bind(id).all()).results ?? []) as unknown as ItemRow[];
	return { quiz: q, items };
}

/** Selaimelle: vastaamattomista vain väite, ettei oikea vastaus näy etukäteen. */
export function publicItem(r: ItemRow) {
	const base = { pos: r.pos, statement: r.statement, area: r.area, answer: r.answer, confident: r.confident };
	if (r.answer === null) return base;
	return { ...base, correct: r.correct, explanation: r.explanation, anchor: r.anchor, kind: r.kind, level: r.level, src: source(r) };
}

export async function quizForUi(d1: D1Database, id: string) {
	const g = await getQuiz(d1, id);
	if (!g) return null;
	const { quiz: q, items } = g;
	return {
		quiz: { id: q.id, title: q.title, scope: q.scope, created_at: q.created_at, answered_at: q.answered_at, feedback_html: q.feedback ? renderMarkdown(q.feedback) : null },
		items: items.map(publicItem),
	};
}

export async function listQuizzes(d1: D1Database, limit = 20) {
	const r = await d1
		.prepare(
			`SELECT q.id, q.title, q.scope, q.created_at, q.answered_at, q.feedback_at,
			  COUNT(i.pos) AS n, COUNT(i.answer) AS answered, SUM(CASE WHEN i.answer = i.correct THEN 1 ELSE 0 END) AS "right"
			 FROM quizzes q LEFT JOIN quiz_items i ON i.quiz_id = q.id
			 GROUP BY q.id ORDER BY q.created_at DESC LIMIT ?`,
		)
		.bind(Math.min(Math.max(limit, 1), 100))
		.all();
	type Rivi = { id: string; title: string; scope: string | null; created_at: string; answered_at: string | null; feedback_at: string | null; n: number; answered: number; right: number | null };
	return ((r.results ?? []) as unknown as Rivi[]).map((x) => ({ ...x, right: Number(x.right ?? 0) }));
}

/**
 * Vastaus yhteen väitteeseen: 1 tosi, 0 epätosi, -1 en muista. Ensimmäinen
 * vastaus jää voimaan, jotta tulos kertoo mitä oikeasti muisti.
 */
export async function answerItem(d1: D1Database, id: string, pos: number, answer: number, confident: number | null) {
	if (![1, 0, -1].includes(answer)) return { error: "answer: 1, 0 tai -1" };
	const conf = answer === -1 ? null : confident === 1 ? 1 : 0;
	const now = nowIso();
	await d1.prepare("UPDATE quiz_items SET answer = ?, confident = ?, answered_at = ? WHERE quiz_id = ? AND pos = ? AND answer IS NULL").bind(answer, conf, now, id, pos).run();
	const r = (await d1.prepare(`${ITEM_SELECT} WHERE i.quiz_id = ? AND i.pos = ?`).bind(id, pos).first()) as unknown as ItemRow | null;
	if (!r) return { error: "not found" };
	const left = (await d1.prepare("SELECT COUNT(*) AS n FROM quiz_items WHERE quiz_id = ? AND answer IS NULL").bind(id).first()) as { n: number } | null;
	if (left && left.n === 0) await d1.prepare("UPDATE quizzes SET answered_at = COALESCE(answered_at, ?) WHERE id = ?").bind(now, id).run();
	return { item: publicItem(r), done: !!left && left.n === 0 };
}

export async function putFeedback(d1: D1Database, id: string, text: string): Promise<boolean> {
	const r = await d1.prepare("UPDATE quizzes SET feedback = ?, feedback_at = ? WHERE id = ?").bind(text, nowIso(), id).run();
	return (r.meta?.changes ?? 0) > 0;
}

/**
 * Kerrattavat: väärin, en muista tai arvaus kokeista, joihin vastattiin
 * vähintään `days` päivää sitten, eikä niitä ole vielä kysytty uudelleen.
 */
export async function dueRepeats(d1: D1Database, days = 10, limit = 6) {
	const before = new Date(Date.now() - days * 86_400_000).toISOString();
	const r = await d1
		.prepare(
			`${ITEM_SELECT} JOIN quizzes q ON q.id = i.quiz_id
			 WHERE q.answered_at IS NOT NULL AND q.answered_at <= ? AND i.answer IS NOT NULL
			   AND (i.answer = -1 OR i.answer <> i.correct OR i.confident = 0)
			   AND NOT EXISTS (SELECT 1 FROM quiz_items j WHERE j.repeat_of = i.quiz_id || ':' || i.pos)
			 ORDER BY q.answered_at LIMIT ?`,
		)
		.bind(before, Math.min(Math.max(limit, 1), 20))
		.all();
	return ((r.results ?? []) as unknown as ItemRow[]).map((x) => ({
		ref: `${x.quiz_id}:${x.pos}`,
		statement: x.statement,
		correct: x.correct,
		explanation: x.explanation,
		anchor: x.anchor,
		bookmark_id: x.bookmark_id,
		title: x.b_title,
		area: x.area,
		src_url: x.src_url,
		src_title: x.src_title,
		answer: x.answer,
		confident: x.confident,
	}));
}

// --- Sivu ---

export function quizPage(css: string): string {
	return `<!doctype html><html lang="fi"><head><meta charset="utf-8">${ICON_LINKS}<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="color-scheme" content="light dark"><title>Pistokoe · Lukupino</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400;7..72,600&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap" rel="stylesheet">
<style>${css}
:root{--okb:color-mix(in srgb,var(--ok) 12%,transparent);--nob:color-mix(in srgb,var(--danger) 10%,transparent)}
body{font-family:'DM Sans',-apple-system,system-ui,sans-serif}
.pk{max-width:640px;margin:0 auto;padding:0 18px 120px}
.pk .ey{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);margin:22px 0 4px}
.pk h1{font-family:Literata,Georgia,serif;font-size:26px;line-height:1.22;margin:0 0 8px;font-weight:600;text-wrap:balance}
.lead{color:var(--mut);font-size:15px;line-height:1.5;margin:0 0 18px}
.qrow{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:13px 0;border-bottom:1px solid var(--line);text-decoration:none;color:var(--fg)}
.qrow b{display:block;font-weight:600;font-size:15.5px}
.qrow small{color:var(--mut);font-size:12.5px}
.qrow em{font-style:normal;font-size:13px;color:var(--mut);white-space:nowrap}
.qrow.open em{color:var(--star);font-weight:700}
.dots{display:flex;gap:4px;margin:10px 0 18px}
.dots i{flex:1;height:5px;border-radius:3px;background:var(--line)}
.dots i.ok{background:var(--ok)}.dots i.no{background:var(--danger)}.dots i.mu{background:var(--mut)}.dots i.cur{background:var(--star)}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px}
.vn{font-size:12px;color:var(--mut);letter-spacing:.06em;text-transform:uppercase}
.stm{font-family:Literata,Georgia,serif;font-size:20px;line-height:1.45;margin:10px 0 18px;text-wrap:pretty}
.btns{display:flex;gap:8px;flex-wrap:wrap}
.btns button{flex:1 1 0;min-width:90px;min-height:52px;border-radius:12px;border:1px solid var(--line);background:var(--soft);font:700 16px 'DM Sans',sans-serif}
.btns button.mu{flex-basis:100%;min-height:44px;font-weight:500;font-size:14.5px;color:var(--mut);background:transparent}
.q2{font-size:14px;color:var(--mut);margin:0 0 8px}
.pickd{font-size:14px;margin:0 0 10px}
.back{margin-top:10px;border:0;background:none;color:var(--mut);font-size:13.5px;padding:6px 0}
.rv{border-radius:10px;padding:9px 12px;font-size:14.5px;margin:0 0 10px}
.rv.ok{background:var(--okb);color:var(--ok)}.rv.no{background:var(--nob);color:var(--danger)}.rv.mu{background:var(--soft);color:var(--mut)}
.ex{font-size:15.5px;line-height:1.55;margin:0 0 10px}
.card blockquote,.it blockquote{margin:0 0 10px;padding:4px 0 4px 12px;border-left:3px solid var(--line);color:var(--mut);font-family:Literata,Georgia,serif;font-style:italic;font-size:15px;line-height:1.5}
.src{display:inline-block;font-size:14px;margin:2px 0 4px;text-underline-offset:2px}
.nx{display:block;width:100%;margin-top:14px;min-height:50px;border:0;border-radius:12px;background:var(--star);color:#1a1a1a;font:700 16px 'DM Sans',sans-serif}
.score{display:flex;align-items:baseline;gap:6px;margin:6px 0 4px;font-family:Literata,Georgia,serif}
.score b{font-size:54px;line-height:1;font-weight:600}.score span{font-size:22px;color:var(--mut)}
.cal{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 0}
.cal div{background:var(--soft);border-radius:12px;padding:10px 12px;font-size:13px;color:var(--mut)}
.cal b{display:block;font-size:20px;color:var(--fg)}
.cal .warn b{color:var(--danger)}
h2.sec{font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);margin:26px 0 8px}
.srow{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--line);font-size:14.5px}
.srow a{color:var(--fg);text-decoration:none;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.srow em{font-style:normal;white-space:nowrap;color:var(--mut)}
.srow .vv{color:var(--danger);font-size:12.5px}
.it{border-bottom:1px solid var(--line);padding:2px 0}
.it summary{list-style:none;display:flex;gap:10px;padding:10px 0;cursor:pointer;font-size:15px;line-height:1.4}
.it summary::-webkit-details-marker{display:none}
.mk{flex:0 0 22px;height:22px;border-radius:50%;display:inline-grid;place-items:center;font-size:12px;font-weight:700;color:#fff;background:var(--mut)}
.it.ok .mk{background:var(--ok)}.it.no .mk{background:var(--danger)}
.it .body{padding:0 0 12px 32px}
.fb{margin:18px 0;padding:16px;border-radius:14px;background:var(--soft);font-size:15px;line-height:1.55}
.fb h2,.fb h3{font-size:15px;margin:14px 0 6px}.fb h2:first-child,.fb h3:first-child{margin-top:0}
.fb ul{padding-left:20px;margin:0 0 10px}.fb p{margin:0 0 10px}
.fb .k{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);margin-bottom:6px}
.muted{color:var(--mut);font-size:14px}
.toast{position:fixed;left:50%;top:70px;transform:translateX(-50%);background:var(--fg);color:var(--bg);font-size:13.5px;padding:8px 14px;border-radius:999px;opacity:0;transition:opacity .2s;z-index:6;pointer-events:none}
.toast.show{opacity:1}
.empty{color:var(--mut);padding:40px 0;text-align:center}
</style></head>
<body>
<header><div class="bar">
 <a class="brand" href="/" style="color:var(--fg)">← Lukupino</a><span style="flex:1"></span>
 <a class="ico" href="/pistokoe" title="Kaikki pistokokeet" aria-label="Kaikki pistokokeet" style="font-size:14px;text-decoration:none;white-space:nowrap">Kaikki kokeet</a>
</div></header>
<main class="pk" id="app"><div class="empty">Ladataan…</div></main>
<div class="toast" id="toast"></div>
<script>
const parts=location.pathname.split('/').filter(Boolean);const qid=parts[1]?decodeURIComponent(parts[1]):null;
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pv=s=>s?new Date(s).toLocaleDateString('fi-FI',{weekday:'short',day:'numeric',month:'numeric'}):'';
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),1800)}
let Q=null,I=[],cur=null,step='ask',pick=null;
async function get(u){const r=await fetch(u);if(r.status===401){location.href='/login';return null}return r.ok?r.json():null}

// --- Lista ---
function row(q){const done=q.n>0&&q.answered===q.n;const st=done?q.right+'/'+q.n+' oikein':q.answered?q.answered+'/'+q.n+' vastattu':'odottaa';
 return '<a class="qrow'+(done?'':' open')+'" href="/pistokoe/'+encodeURIComponent(q.id)+'"><span><b>'+esc(q.title)+'</b><small>'+pv(q.created_at)+(q.feedback_at?' · palaute valmis':done?' · palaute tulossa':'')+'</small></span><em>'+st+'</em></a>'}
async function lista(){const d=await get('/ui/quiz');if(!d)return;
 $('#app').innerHTML='<div class="ey">Pistokoe</div><h1>Mitä jäi mieleen?</h1><p class="lead">Joka sunnuntai iltaisin tulee 12 väitettä viikon aikana tallennetuista. Vastaa tosi, epätosi tai en muista. Väärin menneet ja arvaukset kysytään uudelleen parin viikon päästä.</p>'
  +(d.quizzes.length?d.quizzes.map(row).join(''):'<div class="empty">Ensimmäinen koe tulee sunnuntaina.</div>')}

// --- Koe ---
const tulos=it=>it.answer==null?'':it.answer===-1?'mu':it.answer===it.correct?'ok':'no';
function src(it){return it.src?'<a class="src" href="'+esc(it.src.href)+'"'+(it.src.ext?' target="_blank" rel="noopener"':'')+'>'+esc(it.src.title)+' →</a>':''}
function reveal(it){const t=tulos(it);
 const lb=t==='mu'?'Ei muistissa':t==='ok'?'Oikein':'Väärin';
 return '<div class="rv '+t+'"><b>'+lb+'</b> · väite on '+(it.correct?'tosi':'epätosi')+(t==='no'&&it.confident===1?' · olit varma':t!=='mu'&&it.confident===0?' · arvasit':'')+'</div>'
  +'<p class="ex">'+esc(it.explanation)+'</p>'+(it.anchor?'<blockquote>'+esc(it.anchor)+'</blockquote>':'')+src(it)}
function dots(){return '<div class="dots">'+I.map(it=>'<i class="'+(it===cur&&it.answer==null?'cur':tulos(it))+'"></i>').join('')+'</div>'}
const lahto=()=>String(Q.scope||'').startsWith('lähtötaso');
function head(){return '<div class="ey">'+(lahto()?'Lähtötaso':'Pistokoe')+' · '+pv(Q.created_at)+'</div><h1>'+esc(Q.title)+'</h1>'}
function draw(){const nxt=I.find(x=>x.answer==null);if(!cur)cur=nxt;if(!cur){yhteenveto();return}
 const it=cur,n=I.length;let h='<div class="card"><div class="vn">Väite '+it.pos+' / '+n+(it.area?' · '+esc(it.area):'')+'</div><p class="stm">'+esc(it.statement)+'</p>';
 if(it.answer!=null)h+=reveal(it)+'<button type="button" class="nx" data-nx="1">'+(I.some(x=>x.answer==null)?'Seuraava →':'Katso tulos')+'</button>';
 else if(step==='conf')h+='<p class="pickd">Vastasit: <b>'+(pick===1?'tosi':'epätosi')+'</b></p><p class="q2">Kuinka varma olet?</p><div class="btns"><button type="button" data-c="1">Varma</button><button type="button" data-c="0">Arvaan</button></div><button type="button" class="back" data-back="1">← Vaihda vastausta</button>';
 else h+='<div class="btns"><button type="button" data-a="1">Tosi</button><button type="button" data-a="0">Epätosi</button><button type="button" class="mu" data-a="-1">En muista</button></div>';
 $('#app').innerHTML=head()+dots()+h+'</div>'}
async function send(a,c){const it=cur;step='wait';
 const r=await fetch('/ui/quiz/'+encodeURIComponent(qid)+'/answer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pos:it.pos,answer:a,confident:c})});
 if(!r.ok){toast('Vastaus ei tallentunut');step='ask';draw();return}
 const d=await r.json();Object.assign(it,d.item);if(d.done)Q.answered_at=Q.answered_at||new Date().toISOString();step='ask';draw()}
function pct(a,b){return b?Math.round(100*a/b)+' %':'–'}
function yhteenveto(){const n=I.length,ok=I.filter(x=>tulos(x)==='ok').length,mu=I.filter(x=>tulos(x)==='mu').length;
 const varmat=I.filter(x=>x.answer!==-1&&x.confident===1),arv=I.filter(x=>x.answer!==-1&&x.confident===0);
 const vOk=varmat.filter(x=>tulos(x)==='ok').length,vNo=varmat.length-vOk,aOk=arv.filter(x=>tulos(x)==='ok').length;
 // Lähteittäin, heikoin ensin.
 const by={};for(const it of I){if(!it.src)continue;const k=it.src.title;(by[k]=by[k]||{src:it.src,n:0,ok:0}).n++;if(tulos(it)==='ok')by[k].ok++}
 // Lähtötasotestissä osa-alueittain: mitä kannattaa opiskella.
 const ar={};for(const it of I){if(!it.area)continue;const a=(ar[it.area]=ar[it.area]||{n:0,ok:0,vv:0});a.n++;if(tulos(it)==='ok')a.ok++;else if(it.confident===1)a.vv++}
 const arows=Object.entries(ar).sort((a,b)=>a[1].ok/a[1].n-b[1].ok/b[1].n).map(([k,a])=>'<div class="srow"><span>'+esc(k)+(a.vv?' <small class="vv">· varma mutta väärin '+a.vv+'</small>':'')+'</span><em>'+a.ok+'/'+a.n+'</em></div>').join('');
 const srows=arows?'':Object.values(by).sort((a,b)=>a.ok/a.n-b.ok/b.n).map(s=>'<div class="srow"><a href="'+esc(s.src.href)+'"'+(s.src.ext?' target="_blank" rel="noopener"':'')+'>'+esc(s.src.title)+'</a><em>'+s.ok+'/'+s.n+'</em></div>').join('');
 const fb=Q.feedback_html?'<div class="fb"><div class="k">Palaute</div>'+Q.feedback_html+'</div>':'<div class="fb muted">'+(lahto()?'Oppimispolku tehdään tämän tuloksen perusteella: heikoimmat osa-alueet ensin, hallitut ohitetaan.':'Palaute tulee seuraavan aamun rutiinissa: mikä jäi mieleen, mikä ei ja mihin kannattaa syventyä.')+'</div>';
 const items=I.map(it=>{const t=tulos(it);return '<details class="it '+t+'"><summary><span class="mk">'+(t==='ok'?'✓':t==='no'?'✗':'–')+'</span><span>'+esc(it.statement)+'</span></summary><div class="body">'+reveal(it)+'</div></details>'}).join('');
 $('#app').innerHTML=head()+dots()+'<div class="score"><b>'+ok+'</b><span>/ '+n+' oikein</span></div>'
  +'<div class="cal"><div><b>'+pct(vOk,varmat.length)+'</b>varmoista oikein ('+vOk+'/'+varmat.length+')</div><div'+(vNo?' class="warn"':'')+'><b>'+vNo+'</b>varma mutta väärin</div><div><b>'+pct(aOk,arv.length)+'</b>arvauksista oikein ('+aOk+'/'+arv.length+')</div><div><b>'+mu+'</b>ei muistissa</div></div>'
  +fb+(arows?'<h2 class="sec">Osa-alueittain</h2>'+arows:'')+(srows?'<h2 class="sec">Lähteittäin</h2>'+srows:'')+'<h2 class="sec">Kaikki väitteet</h2>'+items}
async function koe(){const d=await get('/ui/quiz/'+encodeURIComponent(qid));if(!d){$('#app').innerHTML='<div class="empty">Koetta ei löytynyt.</div>';return}
 Q=d.quiz;I=d.items;document.title=Q.title+' · Pistokoe';draw()}
$('#app').addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('button');if(!b||step==='wait')return;
 if(b.dataset.a!=null){const a=Number(b.dataset.a);if(a===-1)send(-1,null);else{pick=a;step='conf';draw()}}
 else if(b.dataset.c!=null)send(pick,Number(b.dataset.c));
 else if(b.dataset.back){step='ask';pick=null;draw()}
 else if(b.dataset.nx){cur=null;step='ask';draw();scrollTo(0,0)}});
if(qid)koe();else lista();
</script></body></html>`;
}
