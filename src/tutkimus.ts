// Tutkimuksen lukunäkymä: /tutkimus/:id (20.10.2026).
//
// Omistaja pyytää tutkimuksen jakaessa numerolla 4 tai Tutki-napilla, ja
// rutiini kirjoittaa sen skills/lukupino-tutki-sapluunalla. Palvelin antaa
// valmiin HTML:n (renderMarkdown, research.ts); tämä sivu näyttää sen ja
// toimii kuten jutun lukunäkymä: valinta → Tallenna poiminnaksi.
//
// Huom: asiakaskoodi on template literalissa, joten siinä ei saa olla
// kenoviivoja eikä dollari-aaltosulkeita.

import { KYSY_CSS, KYSY_ICON, KYSY_JS } from "./kysy";
import { ICON_LINKS, ICON_SVG } from "./icon";

/** Mermaid-kaaviot: ladataan vain tarvittaessa, värit luetaan .kuva-elementin
 *  --k-*-muuttujista, jotta kaavio noudattaa sivun paletti- ja tummaa teemaa. */
const KAAVIOT_JS = `function kaaviot(){const el=document.querySelector('.kuva');if(!document.querySelector('pre.mermaid')||!el)return;
const go=()=>{const cs=getComputedStyle(el),v=k=>cs.getPropertyValue('--k-'+k).trim();const fg=v('fg'),mut=v('mut'),line=v('line'),bg=v('bg'),soft=v('soft'),acc=v('acc');
const tv={background:bg,mainBkg:soft,primaryColor:soft,primaryBorderColor:line,primaryTextColor:fg,secondaryColor:bg,secondaryBorderColor:line,secondaryTextColor:fg,tertiaryColor:bg,tertiaryBorderColor:line,tertiaryTextColor:fg,lineColor:mut,textColor:fg,titleColor:fg,nodeBorder:line,clusterBkg:bg,edgeLabelBackground:bg,fontSize:'15px'};
for(let i=0;i<12;i++){tv['cScale'+i]=soft;tv['cScaleLabel'+i]=fg;tv['cScaleInv'+i]=acc;tv['cScalePeer'+i]=line}
window.mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',themeVariables:tv,fontFamily:'DM Sans, sans-serif',flowchart:{curve:'basis',useMaxWidth:true},timeline:{disableMulticolor:true}});window.mermaid.run({querySelector:'pre.mermaid'})};
if(window.mermaid)return go();const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/mermaid@10.9.5/dist/mermaid.min.js';sc.integrity='sha384-enVdc7lTHDGtpROV85t9+VqPC2EyyB0hsRD0MrvQnHUsHmTHIz2D8SPP4EnBkstH';sc.crossOrigin='anonymous';sc.onload=go;document.head.appendChild(sc)}`;

export function researchPage(css: string): string {
	return `<!doctype html><html lang="fi"><head><meta charset="utf-8">${ICON_LINKS}<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="color-scheme" content="light dark"><title>Tutkimus · Lukupino</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400;7..72,600&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap" rel="stylesheet">
<style>${css}
:root{--hl:rgba(242,201,76,.32);--hll:#d29200}
@media(prefers-color-scheme:dark){:root{--hl:rgba(242,201,76,.2);--hll:#e3b341}}
body{font-family:'DM Sans',-apple-system,system-ui,sans-serif}
/* Kuvat (1.11.2026): SVG käyttää --k-*-muuttujia, jotta sama kuva toimii
   lukusivulla, tummassa teemassa ja jaettavassa versiossa. */
.kuva{--k-fg:var(--fg);--k-mut:var(--mut);--k-line:var(--line);--k-bg:var(--card);--k-soft:var(--soft);--k-acc:var(--acc);--k-r:#b8420e;margin:24px 0;padding:14px;border:1px solid var(--k-line);border-radius:12px;background:var(--k-bg);color:var(--k-fg)}
.kuva pre.mermaid{overflow-x:auto}
@media(prefers-color-scheme:dark){.kuva{--k-r:#f08a52}}
.kuva svg,.kuva .sv img{display:block;max-width:100%;height:auto;margin:0 auto}
.kuva .sv{overflow-x:auto}.kuva .leve svg,.kuva .leve img{min-width:620px;max-width:none}
.kuva pre.mermaid{margin:0;background:none;border:0;padding:0;text-align:center;font-family:'DM Sans',sans-serif;white-space:pre}
.kuva figcaption{font-size:13.5px;line-height:1.45;color:var(--k-mut);margin-top:10px}
.tu{max-width:700px;margin:0 auto;padding:0 18px 160px}
.tu .ey{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);margin:22px 0 4px}
.tu h1{font-family:Literata,Georgia,serif;font-size:26px;line-height:1.22;margin:0 0 8px;font-weight:600;text-wrap:balance;overflow-wrap:anywhere}
.tu .meta{font-size:13px;color:var(--mut);display:flex;gap:6px 12px;flex-wrap:wrap;align-items:center}
.tu .meta a{color:var(--acc)}
.rtr{display:flex;align-items:center;gap:6px;margin:12px 0 4px;flex-wrap:wrap}
.rtr button{min-height:36px;border-radius:999px;border:1px solid var(--line);background:var(--soft);color:var(--mut);font:600 13px 'DM Sans',sans-serif;padding:0 12px}
.rtr .st button{font-size:17px;padding:0 9px;line-height:1}
.rtr button.on{border-color:var(--star);color:var(--star)}
.rtr .lb{font-size:12px;color:var(--mut);margin-left:4px}
#tx{overflow-wrap:break-word;margin-top:18px;font-family:Literata,Georgia,serif;font-size:17.5px;line-height:1.68;-webkit-user-select:text;user-select:text}
#tx h2{font-family:'DM Sans',sans-serif;font-size:19px;line-height:1.3;margin:30px 0 8px;padding-top:14px;border-top:1px solid var(--line)}
#tx h2:first-child{border-top:0;padding-top:0;margin-top:8px}
#tx h3{font-family:'DM Sans',sans-serif;font-size:16px;margin:20px 0 6px}
#tx h4{font-family:'DM Sans',sans-serif;font-size:15px;margin:16px 0 4px;color:var(--mut)}
#tx p{margin:0 0 14px;text-wrap:pretty}
#tx ul,#tx ol{margin:0 0 14px;padding-left:22px}
#tx li{margin:0 0 8px}
#tx li ul,#tx li ol{margin:6px 0 0}
#tx blockquote{margin:0 0 14px;padding:4px 0 4px 14px;border-left:3px solid var(--line);color:var(--mut);font-style:italic}
#tx code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.85em;background:var(--soft);padding:1px 5px;border-radius:5px}
#tx a{color:var(--acc);text-underline-offset:2px;overflow-wrap:anywhere}
#tx hr{border:0;border-top:1px solid var(--line);margin:24px 0}
#tx strong{font-weight:600}
.hl{background:var(--hl);box-shadow:inset 0 -2px 0 var(--hll);border-radius:2px}
.pin{margin-left:6px;border:1px solid var(--line);background:var(--soft);color:var(--mut);border-radius:999px;font:600 12px 'DM Sans',sans-serif;padding:3px 9px;vertical-align:2px;white-space:nowrap}
.pin:disabled{color:var(--ok);border-color:transparent}
.box{margin:22px 0;padding:16px;border-radius:14px;background:var(--soft);font-size:15px;line-height:1.5}
.box button{margin-top:10px;min-height:44px;border:0;border-radius:10px;padding:0 16px;font:700 14px 'DM Sans',sans-serif;background:var(--star);color:#1a1a1a}
.save{position:fixed;left:12px;right:12px;max-width:560px;margin:0 auto;bottom:calc(12px + env(safe-area-inset-bottom));z-index:5;display:flex;gap:8px;align-items:center;background:#16181d;color:#f3f3f3;border-radius:14px;padding:8px 8px 8px 14px;box-shadow:0 8px 30px rgba(0,0,0,.35);transform:translateY(calc(100% + 40px + env(safe-area-inset-bottom)));visibility:hidden;transition:transform .18s ease-out,visibility 0s linear .18s}
.save.show{transform:none;visibility:visible;transition:transform .18s ease-out}
.save .sx{flex:1;min-width:0;font-size:13px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.save button{flex:0 0 auto;min-height:44px;border:0;border-radius:10px;padding:0 14px;font-size:14px;font-weight:700;background:#f2c94c;color:#1a1a1a;white-space:nowrap}
.toast{position:fixed;left:50%;top:70px;transform:translateX(-50%);background:var(--fg);color:var(--bg);font-size:13.5px;padding:8px 14px;border-radius:999px;opacity:0;transition:opacity .2s;z-index:6;pointer-events:none}
.toast.show{opacity:1}
.empty{color:var(--mut);padding:40px 0;text-align:center}
${KYSY_CSS}
</style></head>
<body>
<header><div class="bar">
 <a class="brand" href="/" style="color:var(--fg)">← Lukupino</a><span style="flex:1"></span>
 <a class="ico" href="/poiminnat" title="Poiminnat" aria-label="Poiminnat"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.5 6C6.5 6.6 4.5 9 4.5 12.3V18h5.5v-5.5H7.3c.1-2.2 1.2-3.6 3-4.2L9.5 6zm9 0c-3 .6-5 3-5 6.3V18H19v-5.5h-2.7c.1-2.2 1.2-3.6 3-4.2L18.5 6z"></path></svg></a>
</div></header>
<main class="tu"><div id="top"><div class="empty">Ladataan…</div></div><div id="tx"></div></main>
<div class="save" id="save"><span class="sx" id="sx"></span><button type="button" id="sbtn">Tallenna poiminnaksi</button></div>
<div class="toast" id="toast"></div>
<script>
var KYSY_LAJI='tutkimus';${KYSY_JS}
const id=decodeURIComponent(location.pathname.split('/').pop());
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let B=null,saved=[],pending=null;
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),1800)}
const LBL=['perehdy','kelpaa','hyvä','helmi'];
function paintRt(){const r=B.rating;$('#rtr').innerHTML='<button type="button" data-r="0" class="'+(r===0?'on':'')+'">Perehdy</button><span class="st">'+[1,2,3].map(n=>'<button type="button" data-r="'+n+'" class="'+(r!=null&&r>=n?'on':'')+'" aria-label="'+n+' / 3">★</button>').join('')+'</span><span class="lb">'+(r==null?'arvioi':LBL[r])+'</span>'}
// Tallennetut poiminnat korostetaan tekstisolmuista; muotoilun yli menevä lainaus jää korostamatta.
function mark(){const qs=saved.map(q=>String(q).toLowerCase().trim()).filter(q=>q.length>=8);if(!qs.length)return;
 const w=document.createTreeWalker($('#tx'),NodeFilter.SHOW_TEXT);const nodes=[];while(w.nextNode())nodes.push(w.currentNode);
 for(const n of nodes){if(n.parentNode&&n.parentNode.closest&&n.parentNode.closest('figure'))continue;const L=n.nodeValue.toLowerCase();let best=null;for(const q of qs){const i=L.indexOf(q);if(i>=0&&(!best||i<best.i))best={i,len:q.length}}
  if(!best)continue;const mid=n.splitText(best.i);mid.splitText(best.len);const sp=document.createElement('span');sp.className='hl';mid.parentNode.replaceChild(sp,mid);sp.appendChild(mid)}}
function head(d){let host='';try{host=new URL(B.url).hostname.replace('www.','')}catch(e){}
 const pv=d.created_at?new Date(d.created_at).toLocaleDateString('fi-FI'):'';
 $('#top').innerHTML='<div class="ey">Tutkimus</div><h1>'+esc(B.title||B.url)+'</h1><div class="meta"><a href="'+esc(B.url)+'" target="_blank" rel="noopener">'+esc(host||'lähde')+'</a><button type="button" class="kysy" onclick="kysy(B)" title="Avaa Claude-keskustelu tästä lähteestä">${KYSY_ICON}Kysy Claudelta</button>'+(pv?'<span>tutkittu '+pv+'</span>':'')+'<span id="np">'+saved.length+' poimintaa</span>'+(d.html?'<a href="/tutkimus/'+encodeURIComponent(id)+'/jaa">Jaa PDF:nä</a>':'')+'</div><div class="rtr" id="rtr"></div>';
 paintRt()}
async function pyyda(on){const r=await fetch('/ui/bookmark/'+encodeURIComponent(id)+'/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request:on})});
 if(!r.ok){toast('Ei onnistunut');return}B.research_status=(await r.json()).research_status;tila()}
function tila(d){const st=B.research_status;
 if(st==='pyydetty')$('#tx').innerHTML='<div class="box">Tutkimus on jonossa. Aamun rutiini kirjoittaa sen, tai pyydä Claudelta: <i>tee tutkimukset</i>.<br><button type="button" id="peru">Peru pyyntö</button></div>';
 else if(st==='ei-onnistu')$('#tx').innerHTML='<div class="box">Tutkimusta ei saatu tehtyä'+(d&&d.note?': '+esc(d.note):'.')+'<br><button type="button" id="uusi">Yritä uudelleen</button></div>';
 else $('#tx').innerHTML='<div class="box">Tästä ei ole vielä tutkimusta.<br><button type="button" id="uusi">Tutki tämä</button></div>'}
async function load(){const r=await fetch('/ui/research/'+encodeURIComponent(id));
 if(r.status===401){location.href='/login';return}
 if(!r.ok){$('#top').innerHTML='<div class="empty">Tallennusta ei löytynyt.</div>';return}
 const d=await r.json();B=d.bookmark;saved=d.quotes.map(q=>q.text);document.title='Tutkimus: '+(B.title||'')+' · Lukupino';head(d);
 if(d.html){$('#tx').innerHTML=d.html;mark();polku();kaaviot()}else tila(d)}
// Oppimispolun linkit pinoon yhdellä napautuksella (20.10.2026). Arvio
// Perehdy, joten suositus odottaa Perehdy-hyllyssä.
// Mermaid-kaaviot piirretään vasta, kun tutkimuksessa on sellainen.
${KAAVIOT_JS}
function polku(){const h=[...document.querySelectorAll('#tx h2')].find(x=>x.textContent.trim().toLowerCase().startsWith('oppimispolku'));if(!h)return;
 for(let el=h.nextElementSibling;el&&el.tagName!=='H2';el=el.nextElementSibling)el.querySelectorAll('a[href^="http"]').forEach(a=>{const b=document.createElement('button');b.type='button';b.className='pin';b.dataset.u=a.href;b.textContent='+ pinoon';a.after(b)})}
async function pinoon(b){b.disabled=true;const r=await fetch('/ui/add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:b.dataset.u,rating:0})});
 if(!r.ok){b.disabled=false;toast('Lisäys epäonnistui');return}const d=await r.json();b.textContent=d.created?'✓ pinossa':'✓ oli jo pinossa';toast(d.created?'Lisätty Perehdy-hyllyyn':'Oli jo pinossa')}
$('#tx').addEventListener('click',e=>{const t=e.target;if(t.id==='peru')pyyda(false);else if(t.id==='uusi')pyyda(true);else if(t.classList&&t.classList.contains('pin'))pinoon(t)});
$('#top').addEventListener('click',async e=>{const b=e.target.closest&&e.target.closest('#rtr button');if(!b)return;const n=Number(b.dataset.r);const old=B.rating;B.rating=old===n?null:n;paintRt();
 const r=await fetch('/ui/bookmark/'+encodeURIComponent(id)+'/rating',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rating:B.rating})});
 if(!r.ok){B.rating=old;paintRt();toast('Arvio ei tallentunut');return}B.rating=(await r.json()).rating;paintRt()});
let hideT;
document.addEventListener('selectionchange',()=>{const s=getSelection();const t=s&&!s.isCollapsed?s.toString().replace(/ +/g,' ').trim():'';
 const el=s&&s.anchorNode?(s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement):null;const inTx=el&&el.closest?el.closest('#tx'):null;
 if(t.length>=8&&inTx){clearTimeout(hideT);pending=t.split(String.fromCharCode(10)).join(' ');$('#sx').textContent='“'+pending+'”';$('#save').classList.add('show')}
 else{clearTimeout(hideT);hideT=setTimeout(()=>{pending=null;$('#save').classList.remove('show')},350)}});
async function saveSel(){if(!pending)return;const text=pending.length>2000?pending.slice(0,1997)+'…':pending;pending=null;$('#save').classList.remove('show');
 const r=await fetch('/ui/quotes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,bookmarkId:id,kind:'korostus'})});
 if(!r.ok){toast('Tallennus epäonnistui');return}
 saved.push(text);try{getSelection().removeAllRanges()}catch(e){}mark();$('#np').textContent=saved.length+' poimintaa';toast('Tallennettu poimintoihin')}
const sb=$('#sbtn');sb.addEventListener('mousedown',e=>e.preventDefault());sb.addEventListener('touchstart',e=>e.preventDefault(),{passive:false});
sb.addEventListener('touchend',e=>{e.preventDefault();saveSel()},{passive:false});sb.addEventListener('click',saveSel);
load();
</script></body></html>`;
}

// --- Jaettava versio: /tutkimus/:id/jaa ---
// Kansi (logo + "Mikä tämä on"), menetelmä kaaviona ja tutkimus ilman
// omistajan omia yhteyksiä (stripPersonal). Rakennettu tulostettavaksi:
// "Tallenna PDF:ksi" avaa selaimen tulostuksen, josta PDF jaetaan.
// Palvelin renderöi kaiken, joten sivu toimii myös ilman skriptiä.

const escH = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const LOGO_G = ICON_SVG.slice(ICON_SVG.indexOf("<g"), ICON_SVG.indexOf("</svg>"));
const logo = (px: number) => `<svg class="logo" width="${px}" height="${px}" viewBox="0 0 1024 1024" aria-hidden="true"><rect width="1024" height="1024" rx="230" fill="#1a1a1a"/>${LOGO_G}</svg>`;

const VAIHEET: Array<[string, string]> = [
	["Lähde luetaan", "Alkuperäinen kokonaan — myös repo, paperi tai kuva, johon se viittaa."],
	["Tausta haetaan", "Keskeiset käsitteet, alan klassikot, tutkimus ja kilpailevat näkemykset."],
	["Väitteet punnitaan", "Jokainen linkki avataan. Myyjän ja vaikuttajan väitteet erotetaan riippumattomista."],
	["Kirjoitetaan rakenteella", "Sama runko joka kerta, jotta tutkimuksia voi verrata."],
	["Varaus kirjataan", "Mitä ei saatu varmistettua, kerrotaan lopussa."],
];
const RUNKO = ["Mistä on kyse", "Keskeiset käsitteet", "Suhde teoriaan", "Mitä tämä muistuttaa", "Oppimispolku", "Avoimet kysymykset", "Lähteet"];

export function researchSharePage(d: { id: string; title: string; url: string; created_at: string | null; html: string }): string {
	let host = "";
	try {
		host = new URL(d.url).hostname.replace(/^www\./, "");
	} catch {
		/* osoite puuttuu */
	}
	const pv = d.created_at ? new Date(d.created_at).toLocaleDateString("fi-FI", { day: "numeric", month: "numeric", year: "numeric" }) : "";
	return `<!doctype html><html lang="fi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">${ICON_LINKS}
<title>${escH(d.title)} — Lukupino-tutkimus</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap" rel="stylesheet">
<style>
:root{--ink:#1a1a1a;--mut:#5f5a52;--line:#e4dfd5;--paper:#fff;--soft:#f5f2ec;--blue:#0b5fff;--yel:#f2c94c}
.kuva{--k-fg:var(--ink);--k-mut:var(--mut);--k-line:var(--line);--k-bg:var(--paper);--k-soft:var(--soft);--k-acc:var(--blue);--k-r:#b8420e;margin:22px 0;padding:12px;border:1px solid var(--k-line);border-radius:10px;background:var(--k-bg);color:var(--k-fg);break-inside:avoid;page-break-inside:avoid}
.kuva svg,.kuva .sv img{display:block;max-width:100%;height:auto;margin:0 auto}
.kuva pre.mermaid{margin:0;background:none;border:0;padding:0;text-align:center;font-family:'DM Sans',sans-serif;white-space:pre}
.kuva figcaption{font:13px/1.45 'DM Sans',sans-serif;color:var(--k-mut);margin-top:8px}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#ebe7df;color:var(--ink);font:16px/1.6 Literata,Georgia,serif}
.tool{position:sticky;top:0;z-index:2;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:10px max(16px,env(safe-area-inset-left));background:#1a1a1a;color:#faf9f6;font:500 14px 'DM Sans',sans-serif}
.tool a{color:#faf9f6}
.tool button{min-height:40px;border:0;border-radius:10px;padding:0 16px;background:var(--yel);color:#1a1a1a;font:700 14px 'DM Sans',sans-serif;cursor:pointer}
.tool small{opacity:.75;font-size:12.5px;flex-basis:100%}
.sheet{max-width:820px;margin:20px auto 40px;background:var(--paper);padding:56px 64px 48px;box-shadow:0 2px 18px rgba(0,0,0,.08)}
.brand{display:flex;align-items:center;gap:12px;font:700 13px 'DM Sans',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--mut)}
.brand b{color:var(--ink);letter-spacing:.02em;font-size:17px;text-transform:none}
.brand .sep{flex:1;height:1px;background:var(--line)}
h1.t{font:600 34px/1.15 Literata,Georgia,serif;margin:28px 0 10px;letter-spacing:-.01em;text-wrap:balance;overflow-wrap:anywhere}
.src{font:14px/1.5 'DM Sans',sans-serif;color:var(--mut);margin:0 0 26px}
.src a{color:var(--blue)}
.intro{display:grid;grid-template-columns:1fr;gap:20px;padding:22px 24px;border-radius:14px;background:var(--soft);font:14.5px/1.55 'DM Sans',sans-serif;margin-bottom:14px}
.intro h2{font:700 12px 'DM Sans',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);margin:0 0 8px}
.intro p{margin:0 0 8px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chips span{font:600 12px 'DM Sans',sans-serif;padding:4px 9px;border-radius:999px;background:#fff;border:1px solid var(--line)}
.flow{list-style:none;margin:0 0 6px;padding:0;display:grid;grid-template-columns:repeat(5,1fr);gap:8px;counter-reset:v}
.flow li{position:relative;padding:12px 10px 10px;border-radius:12px;border:1px solid var(--line);background:#fff;font:12.5px/1.4 'DM Sans',sans-serif;counter-increment:v}
.flow li::before{content:counter(v);display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:var(--ink);color:#fff;font:700 12px 'DM Sans',sans-serif;margin-bottom:6px}
.flow li:nth-child(3)::before{background:var(--blue)}
.flow li:nth-child(4)::before{background:var(--yel);color:var(--ink)}
.flow li b{display:block;font-size:13px;margin-bottom:2px}
.flow li:not(:last-child)::after{content:"";position:absolute;right:-7px;top:22px;width:6px;height:6px;border-top:2px solid var(--mut);border-right:2px solid var(--mut);transform:rotate(45deg);background:none}
.note{font:12.5px/1.5 'DM Sans',sans-serif;color:var(--mut);margin:10px 0 0;padding-left:10px;border-left:3px solid var(--yel)}
.body{margin-top:34px;font-size:15.5px;line-height:1.65}
.body h2{font:700 20px/1.3 'DM Sans',sans-serif;margin:30px 0 8px;padding-top:16px;border-top:1px solid var(--line);break-after:avoid}
.body h3{font:700 16px 'DM Sans',sans-serif;margin:18px 0 6px;break-after:avoid}
.body h4{font:600 14px 'DM Sans',sans-serif;margin:14px 0 4px;color:var(--mut)}
.body p{margin:0 0 12px}
.body ul,.body ol{margin:0 0 12px;padding-left:22px}
.body li{margin:0 0 7px}
.body a{color:var(--blue);overflow-wrap:anywhere}
.body blockquote{margin:0 0 12px;padding-left:12px;border-left:3px solid var(--line);color:var(--mut);font-style:italic}
.body code{font:.85em ui-monospace,Menlo,monospace;background:var(--soft);padding:1px 5px;border-radius:5px}
.body strong{font-weight:600}
.body li,.body p,.body blockquote{break-inside:avoid}
.foot{margin-top:34px;padding-top:14px;border-top:1px solid var(--line);display:flex;align-items:center;gap:10px;font:12px/1.5 'DM Sans',sans-serif;color:var(--mut)}
@media (max-width:640px){.sheet{margin:0;padding:28px 18px 32px;box-shadow:none}h1.t{font-size:27px}.intro{padding:18px}.flow{grid-template-columns:1fr}.flow li:not(:last-child)::after{display:none}}
@page{size:A4;margin:16mm 15mm 18mm}
@media print{body{background:#fff}.tool{display:none}.sheet{max-width:none;margin:0;padding:0;box-shadow:none}.body{break-before:page;margin-top:0}.body>p:first-child{color:var(--mut)}.body h2:first-of-type{border-top:0;padding-top:0}h1.t{font-size:40px;margin-top:70px}.intro{margin-top:40px}.intro,.flow{break-inside:avoid}.flow{grid-template-columns:repeat(5,1fr)}.flow li:not(:last-child)::after{display:block}}
</style></head><body>
<div class="tool"><a href="/tutkimus/${escH(encodeURIComponent(d.id))}">← Tutkimukseen</a><button type="button" onclick="window.print()">Tallenna PDF:ksi</button><small>Jos tulostus ei aukea: Safarin Jaa → Tulosta → nipistä esikatselu auki → Jaa PDF:nä.</small></div>
<article class="sheet">
<div class="brand">${logo(40)}<b>Lukupino</b><span class="sep"></span><span>Tutkimus${pv ? " · " + escH(pv) : ""}</span></div>
<h1 class="t">${escH(d.title)}</h1>
<p class="src">Lähde: <a href="${escH(d.url)}">${escH(host || d.url)}</a></p>
<section class="intro" aria-label="Mikä tämä on">
 <div><h2>Mikä tämä on?</h2>
  <p>Lukupino on henkilökohtainen lukuvarasto artikkeleille, podcasteille, videoille ja kirjoille. Kun tallennus herättää kysymyksiä, siitä voi pyytää <b>tutkimuksen</b>: selvityksen siitä, mistä aiheessa on kyse, mihin se liittyy ja miten siitä oppii lisää.</p>
  <p>Tutkimuksen kirjoittaa tekoäly (Claude) samalla rakenteella joka kerta:</p>
  <div class="chips">${RUNKO.map((r) => `<span>${r}</span>`).join("")}</div>
 </div>
 <div><h2>Näin se tehdään</h2>
  <ol class="flow">${VAIHEET.map(([o, t]) => `<li><b>${o}</b>${t}</li>`).join("")}</ol>
 </div>
</section>
<p class="note">Tekoälyn kirjoittama ja ihmisen pyytämä. Lähteet on tarkistettu kirjoitushetkellä, mutta olennaiset väitteet kannattaa lukea alkuperäisestä.</p>
<div class="body">${d.html}</div>
<div class="foot">${logo(22)}<span>Lukupino-tutkimus${pv ? " · tehty " + escH(pv) : ""} · ${escH(host)}</span></div>
</article>
<script>${KAAVIOT_JS}kaaviot()</script>
</body></html>`;
}
