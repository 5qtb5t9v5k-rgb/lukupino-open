// Lukunäkymä jutun lähdetekstille: /lue/:id (17.10.2026).
//
// Omistaja halusi korostaa jutuista talteen samoin kuin litteraateista.
// Lähdeteksti on kortin `excerpt` (enintään MAX_EXCERPT merkkiä, ks. db.ts),
// joten pitkästä jutusta näkyy alku — koko juttu on alkuperäisessä.
// Korostus tallentuu tyypillä `korostus` ilman aikaleimaa; Poiminnat-sivu
// linkittää sen takaisin tänne.
//
// Huom: asiakaskoodi on template literalissa, joten siinä ei saa olla
// kenoviivoja eikä dollari-aaltosulkeita. Rivinvaihto on NL-vakio.

import { KYSY_CSS, KYSY_ICON, KYSY_JS } from "./kysy";
import { ICON_LINKS } from "./icon";

export function readerPage(css: string): string {
	return `<!doctype html><html lang="fi"><head><meta charset="utf-8">${ICON_LINKS}<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="color-scheme" content="light dark"><title>Lukupino</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400;7..72,600&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap" rel="stylesheet">
<style>${css}
:root{--hl:rgba(242,201,76,.32);--hll:#d29200}
@media(prefers-color-scheme:dark){:root{--hl:rgba(242,201,76,.2);--hll:#e3b341}}
body{font-family:'DM Sans',-apple-system,system-ui,sans-serif}
.lu{max-width:680px;margin:0 auto;padding:0 18px 160px}
.lu h1{font-family:Literata,Georgia,serif;font-size:25px;line-height:1.25;margin:20px 0 8px;font-weight:600;text-wrap:pretty;overflow-wrap:anywhere}
.lu .meta{font-size:13px;color:var(--mut);display:flex;gap:6px 12px;flex-wrap:wrap;align-items:center}
.lu .meta a{color:var(--acc)}
.rtr{display:flex;align-items:center;gap:6px;margin:12px 0 4px;flex-wrap:wrap}
.rtr button{min-height:36px;border-radius:999px;border:1px solid var(--line);background:var(--soft);color:var(--mut);font:600 13px 'DM Sans',sans-serif;padding:0 12px}
.rtr .st button{font-size:17px;padding:0 9px;line-height:1}
.rtr button.on{border-color:var(--star);color:var(--star)}
.rtr .lb{font-size:12px;color:var(--mut);margin-left:4px}
.sum{margin:16px 0 4px;padding:12px 14px;border-radius:12px;background:var(--soft);font-size:15px;line-height:1.5}
.sum b{display:block;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);margin-bottom:4px}
.vinkki{font-size:13px;color:var(--mut);margin:18px 0 6px}
.p{font-family:Literata,Georgia,serif;font-size:18px;line-height:1.7;margin:0 0 16px;text-wrap:pretty;-webkit-user-select:text;user-select:text}
.hl{background:var(--hl);box-shadow:inset 0 -2px 0 var(--hll);border-radius:2px}
.loppu{margin:26px 0 0;padding-top:14px;border-top:1px solid var(--line);font-size:14px;color:var(--mut)}
.loppu a{color:var(--acc)}
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
<main class="lu"><div id="top"><div class="empty">Ladataan…</div></div><div id="tx"></div><div id="end"></div></main>
<div class="save" id="save"><span class="sx" id="sx"></span><button type="button" id="sbtn">Tallenna poiminnaksi</button></div>
<div class="toast" id="toast"></div>
<script>
var KYSY_LAJI='lukija';${KYSY_JS}
const NL=String.fromCharCode(10);
const id=decodeURIComponent(location.pathname.split('/').pop());
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let B=null,P=[],saved=[],pending=null,max=3000;
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),1800)}
function parse(text){return String(text).split(NL).map(l=>l.trim()).filter(Boolean)}
function rich(t){const L=t.toLowerCase();const f=new Uint8Array(t.length);
 for(const q of saved){const k=String(q).toLowerCase().trim();if(k.length<8)continue;let i=L.indexOf(k);while(i>=0){f.fill(1,i,i+k.length);i=L.indexOf(k,i+k.length)}}
 let h='',s=0;for(let i=1;i<=t.length;i++){if(i===t.length||f[i]!==f[s]){const x=esc(t.slice(s,i));h+=f[s]?'<span class="hl">'+x+'</span>':x;s=i}}return h}
function render(){$('#tx').innerHTML=P.map((t,i)=>'<p class="p" data-i="'+i+'">'+rich(t)+'</p>').join('')}
const LBL=['perehdy','kelpaa','hyvä','helmi'];
function paintRt(){const r=B.rating;$('#rtr').innerHTML='<button type="button" data-r="0" class="'+(r===0?'on':'')+'">Perehdy</button><span class="st">'+[1,2,3].map(n=>'<button type="button" data-r="'+n+'" class="'+(r!=null&&r>=n?'on':'')+'" aria-label="'+n+' / 3">★</button>').join('')+'</span><span class="lb">'+(r==null?'arvioi':LBL[r])+'</span>'+pgNapit()}
// Kesken / valmis (21.10.2026): näkyy Hyllyn Kesken-rivillä.
function pgNapit(){const g=B.progress||'',v=B.media==='video'?'Katsottu':B.media==='podcast'?'Kuunneltu':'Luettu';
 return '<span class="pgb" style="display:inline-flex;gap:6px"><button type="button" data-g="kesken" class="'+(g==='kesken'?'on':'')+'">Kesken</button><button type="button" data-g="luettu" class="'+(g==='luettu'?'on':'')+'">'+v+'</button></span>'}
function head(){let host='';try{host=new URL(B.url).hostname.replace('www.','')}catch(e){}
 const chars=P.join(' ').length;const min=Math.max(1,Math.round(chars/1300));
 $('#top').innerHTML='<h1>'+esc(B.title||B.url)+'</h1><div class="meta"><a href="'+esc(B.url)+'" target="_blank" rel="noopener">'+esc(host||'alkuperäinen')+'</a><button type="button" class="kysy" onclick="kysy(B)" title="Avaa Claude-keskustelu tästä lähteestä">${KYSY_ICON}Kysy Claudelta</button><span>noin '+min+' min</span><span id="np">'+saved.length+' poimintaa</span></div><div class="rtr" id="rtr"></div>'
  +(B.summary?'<div class="sum"><b>Tiivistelmä</b>'+esc(B.summary)+'</div>':'')
  +'<div class="vinkki">Valitse tekstiä, niin alareunaan tulee <i>Tallenna poiminnaksi</i>.</div>';
 paintRt();
 $('#end').innerHTML='<div class="loppu">'+(chars>=max-20?'Lähdeteksti on jutun alku (enintään '+max.toLocaleString('fi-FI')+' merkkiä). ':'')+'<a href="'+esc(B.url)+'" target="_blank" rel="noopener">Avaa alkuperäinen juttu</a></div>'}
async function load(){const r=await fetch('/ui/reader/'+encodeURIComponent(id));
 if(r.status===401){location.href='/login';return}
 if(!r.ok){$('#top').innerHTML='<div class="empty">Tälle tallennukselle ei ole lähdetekstiä.</div>';return}
 const d=await r.json();B=d.bookmark;P=parse(d.text);saved=d.quotes.map(q=>q.text);max=d.max||max;document.title=(B.title||'Juttu')+' · Lukupino';
 head();render()}
$('#top').addEventListener('click',async e=>{const b=e.target.closest&&e.target.closest('#rtr button');if(!b)return;
 if(b.dataset.g){const old=B.progress;B.progress=old===b.dataset.g?null:b.dataset.g;paintRt();
  const r=await fetch('/ui/bookmark/'+encodeURIComponent(id)+'/progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({progress:B.progress})});
  if(!r.ok){B.progress=old;paintRt();toast('Tila ei tallentunut');return}B.progress=(await r.json()).progress;paintRt();return}
 const n=Number(b.dataset.r);const old=B.rating;B.rating=old===n?null:n;paintRt();
 const r=await fetch('/ui/bookmark/'+encodeURIComponent(id)+'/rating',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rating:B.rating})});
 if(!r.ok){B.rating=old;paintRt();toast('Arvio ei tallentunut');return}B.rating=(await r.json()).rating;paintRt()});
// Korostus: valinta → alapalkki → poiminta. Kosketuksella touchstart estää
// valinnan katoamisen ja touchend tallentaa.
let hideT;
document.addEventListener('selectionchange',()=>{const s=getSelection();const t=s&&!s.isCollapsed?s.toString().replace(/ +/g,' ').trim():'';
 const el=s&&s.anchorNode?(s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement):null;const p=el&&el.closest?el.closest('#tx .p'):null;
 if(t.length>=8&&p){clearTimeout(hideT);pending=t.split(NL).join(' ');$('#sx').textContent='“'+pending+'”';$('#save').classList.add('show')}
 else{clearTimeout(hideT);hideT=setTimeout(()=>{pending=null;$('#save').classList.remove('show')},350)}});
async function saveSel(){if(!pending)return;const text=pending.length>2000?pending.slice(0,1997)+'…':pending;pending=null;$('#save').classList.remove('show');
 const r=await fetch('/ui/quotes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,bookmarkId:id,kind:'korostus'})});
 if(!r.ok){toast('Tallennus epäonnistui');return}
 saved.push(text);try{getSelection().removeAllRanges()}catch(e){}const y=scrollY;render();scrollTo(0,y);$('#np').textContent=saved.length+' poimintaa';toast('Tallennettu poimintoihin')}
const sb=$('#sbtn');sb.addEventListener('mousedown',e=>e.preventDefault());sb.addEventListener('touchstart',e=>e.preventDefault(),{passive:false});
sb.addEventListener('touchend',e=>{e.preventDefault();saveSel()},{passive:false});sb.addEventListener('click',saveSel);
load();
</script></body></html>`;
}
