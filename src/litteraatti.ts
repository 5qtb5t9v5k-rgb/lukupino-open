// Lukunäkymä koko litteraatille: /litteraatti/:id — "Soitin" (17.10.2026).
//
// Omistaja halusi selata koko litteraattia kuten youtube-transcript.io:ssa
// (5.10.2026) — aikaleimat, aiheet, haku — ja korostaa siitä lainauksia
// suoraan poimintoihin. 17.10. tuli soitin: YouTube- tai Spotify-soitin on
// upotettu sivun yläosaan, teksti seuraa toistoa ja aikaleima siirtää
// soittimen kohtaan. Korostus tallentuu tyypillä `korostus`, jota noten
// uudelleenkirjoitus ei koske.
//
// Soittimet: YouTube IFrame API (getCurrentTime, seekTo) ja Spotifyn Embed
// iFrame API (playback_update antaa position millisekunteina, seek sekunteina).
// Spotify-jakson aikaleimat tulevat RSS:n MP3:sta; jos Spotify lisää eri
// mainokset, kohta voi heittää muutaman sekunnin.
//
// Huom: asiakaskoodi on template literalissa, joten siinä ei saa olla
// kenoviivoja eikä dollari-aaltosulkeita. Rivinvaihto on NL-vakio.

import { KYSY_CSS, KYSY_ICON, KYSY_JS } from "./kysy";
import { ICON_LINKS } from "./icon";

export function transcriptPage(css: string): string {
	return `<!doctype html><html lang="fi"><head><meta charset="utf-8">${ICON_LINKS}<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="color-scheme" content="dark"><title>Litteraatti · Lukupino</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${css}
:root{--bg:#0f1012;--fg:#ececea;--mut:#9a9ca3;--line:#23252a;--soft:#17181b;--card:#17181b;--acc:#5b8cff;--star:#f2c94c;--ok:#34d399}
body{font-family:Manrope,-apple-system,system-ui,sans-serif;background:var(--bg);color:var(--fg)}
.mono{font-family:'JetBrains Mono',ui-monospace,monospace}
.lt{max-width:760px;margin:0 auto;padding:0 16px 160px}
.lt h1{font-size:20px;line-height:1.3;margin:14px 0 6px;letter-spacing:-.01em;text-wrap:pretty;font-weight:700}
.lt .meta{font-size:13px;color:var(--mut);display:flex;gap:6px 12px;flex-wrap:wrap;align-items:center}
.lt .meta a{color:var(--acc)}
.pl{position:sticky;top:57px;z-index:3;background:var(--bg);padding:10px 0 8px;margin:0 -16px;padding-left:16px;padding-right:16px;border-bottom:1px solid var(--line)}
.pl .scr{position:relative;width:100%;border-radius:14px;overflow:hidden;background:#24262b}
.pl .scr.yt{aspect-ratio:16/9;max-height:34vh}
.pl .scr.yt iframe,.pl .scr.yt>div{position:absolute;inset:0;width:100%;height:100%;border:0}
.pl .scr.sp{height:152px;background:transparent}
.pl .ctl{display:flex;gap:8px;margin-top:8px}
.pl .ctl button{min-height:40px;border-radius:10px;border:1px solid #34363c;background:var(--soft);color:var(--fg);font:600 13px Manrope,sans-serif;padding:0 12px;white-space:nowrap}
.pl .ctl button.on{border-color:var(--acc);color:var(--acc)}
.pl .ctl .poimi{flex:1;background:var(--star);color:#1a1a1a;border:0}
.pl .now{font-size:12px;color:var(--mut);margin-top:6px;display:flex;justify-content:space-between}
.lt details.ch{margin:12px 0 4px;border:1px solid var(--line);border-radius:12px;background:var(--card)}
.lt details.ch summary{padding:10px 14px;font-size:14px;font-weight:600;cursor:pointer;list-style:none}
.lt details.ch summary::-webkit-details-marker{display:none}
.lt .chl{padding:0 6px 8px}
.lt .chl button{display:flex;gap:10px;width:100%;text-align:left;border:0;background:none;padding:7px 8px;border-radius:8px;font-size:14px;line-height:1.35;color:var(--fg)}
.lt .chl button:hover{background:#202227}
.lt .chl .t{color:var(--acc);font-variant-numeric:tabular-nums;flex:0 0 auto;min-width:58px;font-family:'JetBrains Mono',monospace;font-size:12px}
.fbar{padding:10px 0 4px;display:flex;gap:6px;align-items:center}
.fbar .search{flex:1}
.fbar input[type=search]{background:var(--soft);border-color:var(--line);color:var(--fg)}
.fbar .n{font-size:12.5px;color:var(--mut);font-variant-numeric:tabular-nums;min-width:44px;text-align:center}
.fbar .ico{border-color:var(--line);width:36px;height:36px;color:var(--fg)}
.p{margin:0;padding:12px 10px;margin:0 -10px;border-radius:10px;font-size:16.5px;line-height:1.62;color:#b9bbc1;scroll-margin-top:45vh;transition:background .25s,color .25s}
.p .h{display:flex;gap:8px;align-items:baseline;font-size:11.5px;margin-bottom:3px}
.p .ts{color:var(--mut);text-decoration:none;font-variant-numeric:tabular-nums;font-family:'JetBrains Mono',monospace;cursor:pointer;background:none;border:0;padding:0;font-size:11.5px}
.p .ts:hover{color:var(--acc)}
.p .who{font-weight:700;color:var(--mut);letter-spacing:.01em}
.p .tx{text-wrap:pretty;-webkit-user-select:text;user-select:text}
.p.now{background:#1a1c21;color:#fff}
.p.now .ts{color:var(--acc)}
.p.ad{font-size:12px;color:var(--mut);text-align:center;padding:14px 0}
.p.flash{animation:fl 1.6s ease-out}
@keyframes fl{0%{background:rgba(91,140,255,.22)}100%{background:transparent}}
mark{background:rgba(242,201,76,.45);color:inherit;border-radius:3px}
mark.cur{background:var(--star);color:#000}
.hl{background:rgba(242,201,76,.18);box-shadow:inset 0 -2px 0 var(--star);border-radius:2px}
.save{position:fixed;left:12px;right:12px;max-width:560px;margin:0 auto;bottom:calc(12px + env(safe-area-inset-bottom));z-index:5;display:flex;gap:8px;align-items:center;background:#fff;color:#111;border-radius:14px;padding:8px 8px 8px 14px;box-shadow:0 8px 30px rgba(0,0,0,.45);transform:translateY(calc(100% + 40px + env(safe-area-inset-bottom)));visibility:hidden;transition:transform .18s ease-out,visibility 0s linear .18s}
.save.show{transform:none;visibility:visible;transition:transform .18s ease-out}
.save .sx{flex:1;min-width:0;font-size:13px;opacity:.8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.save button{flex:0 0 auto;min-height:44px;border:0;border-radius:10px;padding:0 14px;font-size:14px;font-weight:700;background:var(--star);color:#1a1a1a;white-space:nowrap}
.rtr{display:flex;align-items:center;gap:6px;margin:10px 0 2px;flex-wrap:wrap}
.rtr button{min-height:36px;border-radius:999px;border:1px solid #34363c;background:var(--soft);color:var(--mut);font:600 13px Manrope,sans-serif;padding:0 12px}
.rtr .st button{font-size:17px;padding:0 9px;line-height:1}
.rtr button.on{border-color:var(--star);color:var(--star)}
.rtr .lb{font-size:12px;color:var(--mut);margin-left:4px}
.toast{position:fixed;left:50%;top:70px;transform:translateX(-50%);background:#fff;color:#111;font-size:13.5px;padding:8px 14px;border-radius:999px;opacity:0;transition:opacity .2s;z-index:6;pointer-events:none}
.toast.show{opacity:1}
.empty{color:var(--mut);padding:40px 0;text-align:center}
${KYSY_CSS}
</style></head>
<body>
<header><div class="bar">
 <a class="brand" href="/" style="color:var(--fg)">← Lukupino</a><span style="flex:1"></span>
 <a class="ico" href="/poiminnat" title="Poiminnat" aria-label="Poiminnat"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.5 6C6.5 6.6 4.5 9 4.5 12.3V18h5.5v-5.5H7.3c.1-2.2 1.2-3.6 3-4.2L9.5 6zm9 0c-3 .6-5 3-5 6.3V18H19v-5.5h-2.7c.1-2.2 1.2-3.6 3-4.2L18.5 6z"></path></svg></a>
</div></header>
<div class="lt">
 <div class="pl" id="pl" hidden>
  <div class="scr" id="scr"><div id="player"></div></div>
  <div class="ctl">
   <button type="button" id="back15" aria-label="Taaksepäin 15 sekuntia">−15 s</button>
   <button type="button" id="speed" hidden>1×</button>
   <button type="button" id="follow" class="on" aria-pressed="true">Seuraa</button>
   <button type="button" class="poimi" id="poimi">Poimi kappale</button>
  </div>
 </div>
 <div id="top"><div class="empty">Ladataan…</div></div>
 <div class="fbar" id="fbar" hidden>
  <div class="search"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="M20 20l-4.3-4.3"></path></svg><input id="q" type="search" placeholder="Hae litteraatista" aria-label="Hae litteraatista" autocomplete="off" enterkeyhint="search"></div>
  <span class="n" id="n"></span>
  <button class="ico" id="nx" type="button" title="Seuraava osuma" aria-label="Seuraava osuma"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg></button>
 </div>
 <div id="tx"></div>
</div>
<div class="save" id="save"><span class="sx" id="sx"></span><button type="button" id="sbtn">Tallenna poiminnaksi</button></div>
<div class="toast" id="toast"></div>
<script>
var KYSY_LAJI='litteraatti';${KYSY_JS}
const NL=String.fromCharCode(10);
const id=decodeURIComponent(location.pathname.split('/').pop());
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let B=null,P=[],saved=[],sq='',marks=[],cur=-1,pending=null;
function secs(t){return t.split(':').reduce((a,x)=>a*60+(Number(x)||0),0)}
function parse(text){const out=[];for(const raw of text.split(NL)){const l=raw.trim();if(!l)continue;
 let ts='',rest=l;if(l.charAt(0)==='['){const k=l.indexOf(']');if(k>0&&k<12){ts=l.slice(1,k);rest=l.slice(k+1).trim()}}
 if(rest==='[mainos]'){out.push({ts,s:ts?secs(ts):-1,ad:true});continue}
 let who='',t=rest;const c=rest.indexOf(': ');if(c>0&&c<40&&rest.slice(0,c).split(' ').length<=4){who=rest.slice(0,c);t=rest.slice(c+2)}
 if(!ts&&out.length&&!out[out.length-1].ad){out[out.length-1].t+=' '+t;continue}
 out.push({ts,s:ts?secs(ts):-1,who,t})}return out}
// Lähde: YouTube-videon tunnus tai Spotify-jakson tunnus.
function source(){if(!B)return null;try{const u=new URL(B.url);const h=u.hostname.replace('www.','').replace('m.','');
 let v='';if(h==='youtu.be')v=u.pathname.slice(1);else if(h==='youtube.com'){v=u.pathname.indexOf('/shorts/')===0?u.pathname.split('/')[2]:u.searchParams.get('v')}
 // Tunnus hyväksytään vain tunnetussa muodossa: se päätyy linkkeihin ja upotukseen (auditointi 7.11.2026).
 if(v)return /^[A-Za-z0-9_-]{11}$/.test(v)?{kind:'yt',id:v}:null;
 if(h==='open.spotify.com'&&u.pathname.indexOf('/episode/')===0){const e=u.pathname.split('/')[2];return /^[A-Za-z0-9]{10,40}$/.test(e)?{kind:'sp',id:e}:null}}catch(e){}return null}
function srcLink(sec){const s=source();if(!s||sec<0)return '';
 return s.kind==='yt'?'https://www.youtube.com/watch?v='+s.id+'&t='+sec+'s':'https://open.spotify.com/episode/'+s.id+'?t='+sec}
function chapters(note){const out=[];let on=false;for(const raw of String(note||'').split(NL)){const l=raw.trim();const low=l.toLowerCase();
 if(low.indexOf('aiheet')>=0&&(l.charAt(0)==='#'||l===l.toUpperCase())){on=true;continue}
 if(on&&(l.charAt(0)==='#'||low.indexOf('poiminnat')>=0))break;
 const m=on&&/^([0-9]{1,2}:[0-9]{2}(:[0-9]{2})?) [–—-] (.+)$/.exec(l);if(m)out.push({ts:m[1],s:secs(m[1]),t:m[3]})}return out}
function rich(t){const L=t.toLowerCase();const f=new Uint8Array(t.length);
 for(const q of saved){const k=String(q).toLowerCase().trim();if(k.length<8)continue;let i=L.indexOf(k);while(i>=0){f.fill(1,i,i+k.length);i=L.indexOf(k,i+k.length)}}
 if(sq.length>=2){let i=L.indexOf(sq);while(i>=0){for(let j=i;j<i+sq.length;j++)f[j]|=2;i=L.indexOf(sq,i+sq.length)}}
 let h='',s=0;for(let i=1;i<=t.length;i++){if(i===t.length||f[i]!==f[s]){const x=esc(t.slice(s,i)),v=f[s];
  h+=v===0?x:v===1?'<span class="hl">'+x+'</span>':v===2?'<mark>'+x+'</mark>':'<mark class="hl">'+x+'</mark>';s=i}}return h}
function para(p,i){if(p.ad)return '<p class="p ad">'+(p.ts?esc(p.ts)+' · ':'')+'mainoskatko</p>';
 const href=srcLink(p.s);
 const ts=p.ts?(href?'<a class="ts" href="'+esc(href)+'" data-s="'+p.s+'" target="_blank" rel="noopener">'+esc(p.ts)+'</a>':'<span class="ts">'+esc(p.ts)+'</span>'):'';
 return '<p class="p'+(i===nowI?' now':'')+'" id="p'+i+'" data-i="'+i+'">'+(ts||p.who?'<span class="h">'+ts+(p.who?'<span class="who">'+esc(p.who)+'</span>':'')+'</span>':'')+'<span class="tx">'+rich(p.t)+'</span></p>'}
function render(){$('#tx').innerHTML=P.map(para).join('');marks=[...document.querySelectorAll('#tx mark')];cur=-1;
 $('#n').textContent=sq.length>=2?(marks.length?'0/'+marks.length:'0'):''}
function next(){if(!marks.length)return;if(cur>=0)marks[cur].classList.remove('cur');cur=(cur+1)%marks.length;const m=marks[cur];m.classList.add('cur');
 follow=false;paintFollow();m.scrollIntoView({block:'center',behavior:'smooth'});$('#n').textContent=(cur+1)+'/'+marks.length}
function idxAt(s){let k=-1;P.forEach((p,i)=>{if(p.s>=0&&p.s<=s+1)k=i});return k}
function jump(s){const k=Math.max(0,idxAt(s));const el=document.getElementById('p'+k);if(!el)return;
 el.scrollIntoView({block:'center',behavior:'smooth'});el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash')}
function toast(t){const e=$('#toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),1800)}

// --- Soitin ---
let player=null,kind='',ready=false,playing=false,spPos=0,follow=true,nowI=-1,rate=1;
function now(){if(!ready)return -1;if(kind==='yt'){try{return player.getCurrentTime()}catch(e){return -1}}return spPos}
function seek(s){if(!ready)return false;if(kind==='yt'){player.seekTo(s,true);player.playVideo()}else{player.seek(s);player.resume()}
 follow=true;paintFollow();return true}
function paintFollow(){const b=$('#follow');b.classList.toggle('on',follow);b.setAttribute('aria-pressed',String(follow));b.textContent=follow?'Seuraa':'Seuraa toistoa'}
// Seuranta vierittää myös kappaleen sisällä: pitkä puheenvuoro voi olla
// useita näytöllisiä, joten kohta arvioidaan aikaleimojen välisestä osuudesta.
function track(t){const el=document.getElementById('p'+nowI);if(!el||nowI<0)return;
 let nx=null;for(let j=nowI+1;j<P.length;j++){if(P[j].s>=0){nx=P[j];break}}
 const span=nx?Math.max(1,nx.s-P[nowI].s):60;const f=Math.min(1,Math.max(0,(t-P[nowI].s)/span));
 const plh=$('#pl').hidden?57:$('#pl').getBoundingClientRect().bottom;const view=innerHeight-plh;
 const r=el.getBoundingClientRect();const target=r.top+scrollY+f*r.height-plh-view*0.3;
 if(Math.abs(target-scrollY)>60)scrollTo({top:Math.max(0,target),behavior:'smooth'})}
function tick(){const t=now();if(t<0)return;const k=idxAt(t);
 if(k!==nowI){const old=document.getElementById('p'+nowI);if(old)old.classList.remove('now');nowI=k;
  const el=document.getElementById('p'+k);if(el)el.classList.add('now')}
 if(follow&&playing)track(t)}
function loadScript(src){const s=document.createElement('script');s.src=src;s.async=true;document.head.appendChild(s)}
function setupPlayer(start){const src=source();if(!src)return;kind=src.kind;$('#pl').hidden=false;const scr=$('#scr');
 if(kind==='yt'){scr.classList.add('yt');$('#speed').hidden=false;
  window.onYouTubeIframeAPIReady=()=>{player=new YT.Player('player',{videoId:src.id,playerVars:{playsinline:1,rel:0,modestbranding:1,start:Math.floor(start||0)},
   events:{onReady:()=>{ready=true},onStateChange:e=>{playing=e.data===1}}})};
  loadScript('https://www.youtube.com/iframe_api')}
 else{scr.classList.add('sp');
  window.onSpotifyIframeApiReady=api=>{api.createController($('#player'),{uri:'spotify:episode:'+src.id,width:'100%',height:152},c=>{player=c;ready=true;
   c.addListener('playback_update',e=>{spPos=(e.data.position||0)/1000;playing=!e.data.isPaused});
   if(start)c.addListener('ready',()=>{c.seek(start)})})};
  loadScript('https://open.spotify.com/embed/iframe-api/v1')}
 setInterval(tick,500);
 // Varatie: jos upotus ei lataudu (esto, verkko), soitin piiloon ja aikaleimat avaavat lähteen.
 setTimeout(()=>{if(!ready){$('#pl').hidden=true}},12000)}
$('#back15').onclick=()=>{const t=now();if(t>=0)seek(Math.max(0,t-15))};
$('#speed').onclick=()=>{if(!ready||kind!=='yt')return;rate=rate===1?1.25:rate===1.25?1.5:rate===1.5?2:1;player.setPlaybackRate(rate);$('#speed').textContent=String(rate).replace('.',',')+'×'};
$('#follow').onclick=()=>{follow=!follow;paintFollow();if(follow){const t=now();if(t>=0)track(t)}};
// Käsin vierittäminen keskeyttää seuraamisen, ettei teksti karkaa lukiessa.
['wheel','touchmove'].forEach(ev=>addEventListener(ev,()=>{if(playing&&follow){follow=false;paintFollow()}},{passive:true}));
async function poimi(){if(pending){saveSel();return}const p=P[nowI];if(!p||p.ad){toast('Käynnistä toisto ensin');return}
 const text=p.t.length>2000?p.t.slice(0,1997)+'…':p.t;
 const r=await fetch('/ui/quotes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,bookmarkId:id,who:p.who||null,at:p.ts||null,kind:'korostus'})});
 if(!r.ok){toast('Tallennus epäonnistui');return}saved.push(text);const y=scrollY;render();scrollTo(0,y);toast('Kappale tallennettu poimintoihin')}
// Arvio: Perehdy (0) tai 1–3 tähteä; sama arvo uudelleen poistaa arvion.
const LBL=['perehdy','kelpaa','hyvä','helmi'];
function paintRt(){const r=B.rating;$('#rtr').innerHTML='<button type="button" data-r="0" class="'+(r===0?'on':'')+'">Perehdy</button><span class="st">'+[1,2,3].map(n=>'<button type="button" data-r="'+n+'" class="'+(r!=null&&r>=n?'on':'')+'" aria-label="'+n+' / 3">★</button>').join('')+'</span><span class="lb">'+(r==null?'arvioi':LBL[r])+'</span>'+pgNapit()}
// Kesken / valmis (21.10.2026): näkyy Hyllyn Kesken-rivillä.
function pgNapit(){const g=B.progress||'',v=B.media==='video'?'Katsottu':B.media==='podcast'?'Kuunneltu':'Luettu';
 return '<span class="pgb" style="display:inline-flex;gap:6px"><button type="button" data-g="kesken" class="'+(g==='kesken'?'on':'')+'">Kesken</button><button type="button" data-g="luettu" class="'+(g==='luettu'?'on':'')+'">'+v+'</button></span>'}
$('#top').addEventListener('click',async e=>{const b=e.target.closest&&e.target.closest('#rtr button');if(!b)return;
 if(b.dataset.g){const old=B.progress;B.progress=old===b.dataset.g?null:b.dataset.g;paintRt();
  const r=await fetch('/ui/bookmark/'+encodeURIComponent(id)+'/progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({progress:B.progress})});
  if(!r.ok){B.progress=old;paintRt();toast('Tila ei tallentunut');return}B.progress=(await r.json()).progress;paintRt();return}
 const n=Number(b.dataset.r);const old=B.rating;B.rating=old===n?null:n;paintRt();
 const r=await fetch('/ui/bookmark/'+encodeURIComponent(id)+'/rating',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rating:B.rating})});
 if(!r.ok){B.rating=old;paintRt();toast('Arvio ei tallentunut');return}B.rating=(await r.json()).rating;paintRt()});
// Aikaleima: soitin siirtyy kohtaan, jos se on käytössä; muuten linkki avaa lähteen.
$('#tx').addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('a.ts');if(!a)return;if(seek(Number(a.dataset.s))){e.preventDefault()}});

async function load(){const r=await fetch('/ui/transcript/'+encodeURIComponent(id));
 if(!r.ok){$('#top').innerHTML='<div class="empty">Litteraattia ei löytynyt.</div>';return}
 const d=await r.json();B=d.bookmark;P=parse(d.text);saved=d.quotes.map(q=>q.text);document.title=(B.title||'Litteraatti')+' · Lukupino';
 const ch=chapters(B.note);const min=Math.max(1,Math.round(d.words/230));let host='';try{host=new URL(B.url).hostname.replace('www.','')}catch(e){}
 $('#top').innerHTML='<h1>'+esc(B.title||B.url)+'</h1><div class="meta"><a href="'+esc(B.url)+'" target="_blank" rel="noopener">'+esc(host)+'</a><button type="button" class="kysy" onclick="kysy(B)" title="Avaa Claude-keskustelu tästä lähteestä">${KYSY_ICON}Kysy Claudelta</button><span>'+d.words.toLocaleString('fi-FI')+' sanaa · noin '+min+' min luettavaa</span><span>'+saved.length+' poimintaa</span></div><div class="rtr" id="rtr"></div>'
  +(ch.length?'<details class="ch"><summary>Aiheet ('+ch.length+')</summary><div class="chl">'+ch.map(c=>'<button type="button" data-s="'+c.s+'"><span class="t">'+esc(c.ts)+'</span><span>'+esc(c.t)+'</span></button>').join('')+'</div></details>':'');
 $('#top').querySelectorAll('.chl button').forEach(b=>b.onclick=()=>{const s=Number(b.dataset.s);seek(s);jump(s)});
 paintRt();$('#fbar').hidden=false;render();
 const h=location.hash.slice(1);const start=h.indexOf('t=')===0?Number(h.slice(2)):0;
 setupPlayer(start);hashJump()}
function hashJump(){const h=location.hash.slice(1);if(P.length&&h.indexOf('t=')===0)setTimeout(()=>jump(Number(h.slice(2))),50)}
addEventListener('hashchange',hashJump);
let tq;$('#q').addEventListener('input',e=>{clearTimeout(tq);tq=setTimeout(()=>{sq=e.target.value.trim().toLowerCase();render();if(marks.length)next()},220)});
$('#q').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();next()}});
$('#nx').onclick=next;
// Korostus: valinta litteraatista → alapalkki → poiminta.
let hideT;
function paintPoimi(){$('#poimi').textContent=pending?'Tallenna valinta':'Poimi kappale'}
document.addEventListener('selectionchange',()=>{const s=getSelection();const t=s&&!s.isCollapsed?s.toString().replace(/ +/g,' ').trim():'';
 const el=s&&s.anchorNode?(s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement):null;const p=el&&el.closest?el.closest('#tx .p'):null;
 if(t.length>=8&&p){clearTimeout(hideT);const i=Number(p.dataset.i);pending={text:t.split(NL).join(' '),p:P[i]};$('#sx').textContent='“'+pending.text+'”';$('#save').classList.add('show');paintPoimi()}
 else{clearTimeout(hideT);hideT=setTimeout(()=>{pending=null;$('#save').classList.remove('show');paintPoimi()},350)}});
async function saveSel(){if(!pending)return;const q=pending;pending=null;$('#save').classList.remove('show');paintPoimi();
 const r=await fetch('/ui/quotes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:q.text,bookmarkId:id,who:q.p&&q.p.who||null,at:q.p&&q.p.ts||null,kind:'korostus'})});
 if(!r.ok){toast('Tallennus epäonnistui');return}
 saved.push(q.text);try{getSelection().removeAllRanges()}catch(e){}const y=scrollY;render();scrollTo(0,y);toast('Tallennettu poimintoihin')}
function tap(el,fn){el.addEventListener('mousedown',e=>e.preventDefault());el.addEventListener('touchstart',e=>e.preventDefault(),{passive:false});
 el.addEventListener('touchend',e=>{e.preventDefault();fn()},{passive:false});el.addEventListener('click',fn)}
tap($('#sbtn'),saveSel);tap($('#poimi'),poimi);
load();
</script></body></html>`;
}
