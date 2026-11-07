// Kirjamuistio: /kirja/:id (17.10.2026).
//
// Omistaja halusi kirjoille laajemman täytön kuin kortin Omin sanoin -kenttä,
// koska kirja vaatii enemmän työtä ja siitä saa enemmän irti. Runko on Ali
// Abdaalin kirjamuistiinpanoista, ja siihen on lisätty "Mitä teen toisin" sekä
// luku luvulta -muistiinpanot. Lainaukset ovat oikeita poimintoja
// sivunumeroineen (quotes-taulu, `at` = "s. 42").
//
// Tallennus: kaikki osiot ovat yhtenä tekstinä kirjanmerkin `recall`-kentässä
// otsikoittain (KIRJA_OSIOT, db.ts). Näin MCP ja muu sovellus näkevät ne
// tavallisena tekstinä, eikä tietokantaan tarvita uutta rakennetta. Sivu jäsentää
// tekstin osioiksi ja kirjoittaa sen takaisin. Tuntemattomat otsikot ja niiden
// teksti päätyvät vapaisiin muistiinpanoihin, joten mitään ei häviä.
//
// Huom: asiakaskoodi on template literalissa, joten siinä ei saa olla
// kenoviivoja eikä dollari-aaltosulkeita. Rivinvaihto on NL-vakio.

import { ICON_LINKS } from "./icon";
import { KIRJA_OSIOT, MAX_RECALL } from "./db";

export function bookPage(css: string): string {
	return `<!doctype html><html lang="fi"><head><meta charset="utf-8">${ICON_LINKS}<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="color-scheme" content="light dark"><title>Kirjamuistio · Lukupino</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap" rel="stylesheet">
<style>${css}
body{font-family:'DM Sans',-apple-system,system-ui,sans-serif}
.km{max-width:680px;margin:0 auto;padding:0 16px 120px}
.hero{display:flex;gap:16px;align-items:flex-start;margin:18px 0 6px}
.spine{flex:0 0 auto;width:78px;height:114px;border-radius:4px 9px 9px 4px;padding:10px 8px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between;box-shadow:inset 5px 0 0 rgba(0,0,0,.22),0 2px 6px rgba(0,0,0,.12);color:#fbfaf7}
.spine b{font-family:'DM Serif Display',Georgia,serif;font-weight:400;font-size:12.5px;line-height:1.1;overflow:hidden;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical}
.hero h1{font-family:'DM Serif Display',Georgia,serif;font-weight:400;font-size:26px;line-height:1.15;margin:0 0 6px;text-wrap:pretty}
.hero .by{font-size:14px;color:var(--mut)}
.prog{margin:8px 0 0;font-size:12.5px;color:var(--mut)}
.bar2{height:5px;border-radius:3px;background:var(--soft);margin-top:5px;overflow:hidden}.bar2 i{display:block;height:100%;background:var(--star);border-radius:3px;transition:width .3s}
.ctrl{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:14px 0 4px}
.ctrl button{min-height:36px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--mut);font:600 13px 'DM Sans',sans-serif;padding:0 12px}
.ctrl .st button{font-size:16px;padding:0 9px}
.ctrl button.on{border-color:var(--star);color:var(--star)}
.ctrl .pgb button.on{background:var(--star);color:#1a1a1a}
.ctrl .lb{font-size:12px;color:var(--mut)}
.ctrl label{font-size:13px;color:var(--mut);display:inline-flex;gap:6px;align-items:center}
.ctrl input[type=date]{font:inherit;font-size:14px;color:var(--fg);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:4px 8px;min-height:36px}
.sec{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 14px 12px;margin:12px 0}
.sec h2{font-size:15px;margin:0;font-weight:700;display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.sec h2 .ok{font-size:12px;color:var(--ok);font-weight:600}
.sec .hint{font-size:13px;color:var(--mut);margin:3px 0 8px;line-height:1.4}
.sec textarea,.sec input[type=text]{width:100%;box-sizing:border-box;font:15px/1.5 'DM Sans',sans-serif;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:9px 11px;resize:none;overflow:hidden}
.sec textarea:focus,.sec input[type=text]:focus{outline:none;border-color:var(--acc)}
.sec .n3{display:flex;gap:8px;align-items:flex-start;margin-bottom:6px}.sec .n3 span{flex:0 0 18px;padding-top:9px;color:var(--mut);font-weight:700;font-size:14px}
.ch{border-top:1px dashed var(--line);padding-top:10px;margin-top:10px}.ch:first-of-type{border-top:0;margin-top:0;padding-top:0}
.ch input[type=text]{font-weight:700;margin-bottom:6px}
.lisaa{min-height:40px;border-radius:10px;border:1px dashed var(--line);background:none;color:var(--acc);font:600 14px 'DM Sans',sans-serif;width:100%;margin-top:8px}
.lain{font-family:Georgia,serif;font-size:16px;line-height:1.45;margin:0 0 10px;padding-left:10px;border-left:3px solid var(--star)}
.lain em{display:block;font-family:'DM Sans',sans-serif;font-style:normal;font-size:12px;color:var(--mut);margin-top:2px}
.qf{display:flex;gap:6px;margin-top:6px}.qf input[type=text]{flex:0 0 76px}
.qf button{flex:0 0 auto;min-height:40px;border:0;border-radius:10px;background:var(--star);color:#1a1a1a;font:700 14px 'DM Sans',sans-serif;padding:0 14px}
.tila{position:fixed;left:50%;bottom:calc(14px + env(safe-area-inset-bottom));transform:translateX(-50%);background:var(--fg);color:var(--bg);font-size:13px;padding:7px 14px;border-radius:999px;opacity:0;transition:opacity .2s;pointer-events:none;z-index:6}
.tila.show{opacity:1}.tila.err{background:var(--danger);color:#fff}
.empty{color:var(--mut);padding:40px 0;text-align:center}
.src{font-size:13px;margin:22px 0 0;color:var(--mut)}.src a{color:var(--acc)}
</style></head>
<body>
<header><div class="bar">
 <a class="brand" href="/" style="color:var(--fg)">← Lukupino</a><span style="flex:1"></span>
 <a class="ico" href="/poiminnat" title="Poiminnat" aria-label="Poiminnat"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9.5 6C6.5 6.6 4.5 9 4.5 12.3V18h5.5v-5.5H7.3c.1-2.2 1.2-3.6 3-4.2L9.5 6zm9 0c-3 .6-5 3-5 6.3V18H19v-5.5h-2.7c.1-2.2 1.2-3.6 3-4.2L18.5 6z"></path></svg></a>
</div></header>
<main class="km" id="km"><div class="empty">Ladataan…</div></main>
<div class="tila" id="tila"></div>
<script>
const NL=String.fromCharCode(10);
const id=decodeURIComponent(location.pathname.split('/').pop());
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const H=${JSON.stringify(KIRJA_OSIOT)};
const MAX=${MAX_RECALL};
const SPINE=['#1d2b24','#c9542e','#2f4b7c','#6b3f5c','#3d5a4c'];
const OSIOT=[
 ['lauseet','Kirja kolmessa lauseessa','Ydin niin tiiviisti kuin pystyt. Kirjoita ensin katsomatta kirjaa — se näyttää, mitä oikeasti jäi.'],
 ['vaikutelmat','Vaikutelmat','Millainen kirja oli lukea? Mikä toimi, mikä ei, mikä yllätti?'],
 ['loysin','Miten löysin kirjan','Kuka suositteli tai missä kuulit siitä? Miksi tartuit siihen juuri silloin?'],
 ['kenelle','Kenelle suosittelen','Kuka tuttusi hyötyisi tästä ja miksi?'],
 ['muutti','Miten kirja muutti minua','Miten ajattelusi tai tekemisesi muuttui? Tämä on tärkein kohta.'],
 ['toisin','Mitä teen toisin','Konkreettiset teot, yksi riville. Mikä näistä alkaa tällä viikolla?'],
 ['luvut','Luku luvulta','Pääajatus ja omat huomiot luvuittain. Riittää, että kirjaat luvut, joista jäi jotain.'],
 ['lainaukset','Parhaat lainaukset','Tallentuvat Poimintoihin sivunumeron kanssa.'],
 ['muistiinpanot','Vapaat muistiinpanot','Kaikki muu: kysymykset, yhteydet muihin kirjoihin, mitä haluat tarkistaa.']];
let B=null,Q=[],D={lauseet:['','',''],vaikutelmat:'',loysin:'',kenelle:'',muutti:'',toisin:'',luvut:[],muistiinpanot:''},saveT=null,last='';
function hue(t){let h=0;for(const c of String(t))h=(h*31+c.charCodeAt(0))%100003;return h}
// Teksti → osiot. Tuntematon teksti menee vapaisiin muistiinpanoihin.
function parse(t){const d={lauseet:['','',''],vaikutelmat:'',loysin:'',kenelle:'',muutti:'',toisin:'',luvut:[],muistiinpanot:''};
 const keyOf={};Object.keys(H).forEach(k=>{keyOf[H[k]]=k});let cur='muistiinpanot',ch=null;
 for(const raw of String(t||'').split(NL)){const l=raw.replace(/ +$/,'');const up=l.trim();
  if(keyOf[up]){cur=keyOf[up];ch=null;continue}
  // Ensimmäisen kirjapohjan lainausotsikko: teksti säilyy vapaissa muistiinpanoissa.
  if(up==='KOLME PARASTA LAINAUSTA'){cur='muistiinpanot';ch=null;d.muistiinpanot+=(d.muistiinpanot?NL:'')+'Lainaukset:';continue}
  if(cur==='lauseet'){const m=/^([1-3])[.)] ?(.*)$/.exec(up);if(m){d.lauseet[Number(m[1])-1]=m[2];continue}if(up)d.lauseet[2]=(d.lauseet[2]?d.lauseet[2]+' ':'')+up;continue}
  if(cur==='luvut'){if(up.indexOf('## ')===0){ch={t:up.slice(3),x:''};d.luvut.push(ch);continue}if(!ch){if(!up)continue;ch={t:'',x:''};d.luvut.push(ch)}ch.x+=(ch.x?NL:'')+l;continue}
  d[cur]+=(d[cur]?NL:'')+l}
 for(const k of ['vaikutelmat','loysin','kenelle','muutti','toisin','muistiinpanot'])d[k]=d[k].trim();
 d.luvut.forEach(c=>{c.x=c.x.trim()});return d}
// Osiot → teksti. Tyhjät osiot jätetään pois.
function ser(){const o=[];const put=(k,body)=>{if(body&&body.trim())o.push(H[k]+NL+body.trim())};
 const ls=D.lauseet.map((s,i)=>s.trim()?(i+1)+'. '+s.trim():'').filter(Boolean).join(NL);put('lauseet',ls);
 ['vaikutelmat','loysin','kenelle','muutti','toisin'].forEach(k=>put(k,D[k]));
 put('luvut',D.luvut.filter(c=>c.t.trim()||c.x.trim()).map(c=>'## '+(c.t.trim()||'Luku')+(c.x.trim()?NL+c.x.trim():'')).join(NL+NL));
 put('muistiinpanot',D.muistiinpanot);return o.join(NL+NL)}
function filled(k){if(k==='lauseet')return D.lauseet.some(s=>s.trim());if(k==='luvut')return D.luvut.some(c=>c.x.trim()||c.t.trim());if(k==='lainaukset')return Q.length>0;return !!String(D[k]).trim()}
function paintProg(){const n=OSIOT.filter(o=>filled(o[0])).length;$('#prog').textContent=n+' / '+OSIOT.length+' osiota täytetty';$('#pbar').style.width=Math.round(n/OSIOT.length*100)+'%';
 OSIOT.forEach(o=>{const e=document.getElementById('ok-'+o[0]);if(e)e.textContent=filled(o[0])?'✓':''})}
function grow(el){el.style.height='auto';el.style.height=(el.scrollHeight+2)+'px'}
function ta(path,val,rows,ph){return '<textarea rows="'+(rows||3)+'" data-p="'+path+'" placeholder="'+esc(ph||'')+'">'+esc(val)+'</textarea>'}
function chHtml(c,i){return '<div class="ch"><input type="text" data-p="luvut.'+i+'.t" value="'+esc(c.t)+'" placeholder="Luku '+(i+1)+': otsikko"><textarea rows="3" data-p="luvut.'+i+'.x" placeholder="Pääajatus ja omat huomiot">'+esc(c.x)+'</textarea></div>'}
function secBody(k){if(k==='lauseet')return [0,1,2].map(i=>'<div class="n3"><span>'+(i+1)+'</span>'+ta('lauseet.'+i,D.lauseet[i],1)+'</div>').join('');
 if(k==='luvut')return '<div id="chs">'+D.luvut.map(chHtml).join('')+'</div><button type="button" class="lisaa" id="addch">+ Lisää luku</button>';
 if(k==='lainaukset')return '<div id="qs">'+qHtml()+'</div><textarea rows="2" id="qtx" placeholder="Lainaus kirjasta"></textarea><div class="qf"><input type="text" id="qat" placeholder="sivu" inputmode="numeric"><span style="flex:1"></span><button type="button" id="qsave">Tallenna lainaus</button></div>';
 if(k==='toisin')return ta(k,D[k],4,'Yksi teko riville');
 return ta(k,D[k],k==='muistiinpanot'?5:3)}
function qHtml(){return Q.map(q=>'<p class="lain">“'+esc(q.text)+'”'+(q.at?'<em>'+esc(q.at)+'</em>':'')+'</p>').join('')}
const LBL=['perehdy','kelpaa','hyvä','helmi'];
function ctrl(){const r=B.rating,p=B.progress||'';
 return '<span>'+'<button type="button" data-r="0" class="'+(r===0?'on':'')+'">Perehdy</button></span><span class="st">'+[1,2,3].map(n=>'<button type="button" data-r="'+n+'" class="'+(r!=null&&r>=n?'on':'')+'" aria-label="'+n+' / 3">★</button>').join('')+'</span><span class="lb">'+(r==null?'arvioi':LBL[r])+'</span>'
  +'<span class="pgb">'+[['lukematta','Lukematta'],['kesken','Kesken'],['luettu','Luettu']].map(x=>'<button type="button" data-g="'+x[0]+'" class="'+(p===x[0]?'on':'')+'">'+x[1]+'</button>').join('')+'</span>'
  +'<label>'+(p==='luettu'?'Luettu':'Tallennettu')+' <input type="date" id="pv" value="'+ymd(B.saved_at)+'" max="'+ymd(new Date().toISOString())+'"></label>'}
function ymd(iso){const d=new Date(iso);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function render(){const osat=String(B.title||'').split(' — ');const c=SPINE[hue(B.title||B.id)%SPINE.length];
 $('#km').innerHTML='<div class="hero"><div class="spine" style="background:'+c+'"><b>'+esc(osat[0])+'</b></div><div style="flex:1;min-width:0"><h1>'+esc(osat[0]||B.url)+'</h1>'+(osat[1]?'<div class="by">'+esc(osat[1])+'</div>':'')
  +'<div class="prog" id="prog"></div><div class="bar2"><i id="pbar"></i></div></div></div>'
  +'<div class="ctrl" id="ctrl">'+ctrl()+'</div>'
  +OSIOT.map(o=>'<section class="sec" id="s-'+o[0]+'"><h2>'+o[1]+'<span class="ok" id="ok-'+o[0]+'"></span></h2><div class="hint">'+o[2]+'</div>'+secBody(o[0])+'</section>').join('')
  +'<div class="src"><a href="'+esc(B.url)+'" target="_blank" rel="noopener">Kirjan tiedot</a> · Muistio tallentuu Omin sanoin -kenttään. Kone ei kirjoita sitä.</div>';
 document.querySelectorAll('#km textarea').forEach(grow);paintProg()}
function tila(t,err){const e=$('#tila');e.textContent=t;e.classList.toggle('err',!!err);e.classList.add('show');clearTimeout(tila.t);tila.t=setTimeout(()=>e.classList.remove('show'),err?4000:1400)}
async function save(){clearTimeout(saveT);saveT=null;const t=ser();if(t===last)return;
 if(t.length>MAX){tila('Muistio on liian pitkä ('+t.length+' / '+MAX+' merkkiä)',true);return}
 const r=await fetch('/ui/bookmark/'+encodeURIComponent(id)+'/recall',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({recall:t||null})});
 if(!r.ok){tila('Ei tallentunut — yritä uudelleen',true);return}last=t;tila('Tallennettu')}
function setPath(p,v){const a=p.split('.');if(a.length===1)D[a[0]]=v;else if(a[0]==='lauseet')D.lauseet[Number(a[1])]=v;else D.luvut[Number(a[1])][a[2]]=v}
$('#km').addEventListener('input',e=>{const el=e.target;const p=el.dataset&&el.dataset.p;if(!p)return;setPath(p,el.value);if(el.tagName==='TEXTAREA')grow(el);paintProg();clearTimeout(saveT);saveT=setTimeout(save,1500)});
$('#km').addEventListener('focusout',e=>{if(e.target.dataset&&e.target.dataset.p&&saveT)save()});
addEventListener('pagehide',()=>{if(saveT){const t=ser();if(t!==last&&t.length<=MAX)fetch('/ui/bookmark/'+encodeURIComponent(id)+'/recall',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({recall:t||null})})}});
$('#km').addEventListener('click',async e=>{const t=e.target;
 if(t.id==='addch'){D.luvut.push({t:'',x:''});const i=D.luvut.length-1;$('#chs').insertAdjacentHTML('beforeend',chHtml(D.luvut[i],i));grow($('#chs').lastElementChild.querySelector('textarea'));$('#chs').lastElementChild.querySelector('input').focus();return}
 if(t.id==='qsave'){const text=$('#qtx').value.trim();if(!text)return;let at=$('#qat').value.trim();if(at&&/^[0-9]+$/.test(at))at='s. '+at;
  const r=await fetch('/ui/quotes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,bookmarkId:id,at:at||null,kind:'korostus'})});
  if(!r.ok){tila('Lainaus ei tallentunut',true);return}Q.push({text,at});$('#qs').innerHTML=qHtml();$('#qtx').value='';$('#qat').value='';paintProg();tila('Lainaus tallennettu Poimintoihin');return}
 const rb=t.closest&&t.closest('#ctrl [data-r]');if(rb){const n=Number(rb.dataset.r),old=B.rating;B.rating=old===n?null:n;$('#ctrl').innerHTML=ctrl();
  const r=await fetch('/ui/bookmark/'+encodeURIComponent(id)+'/rating',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({rating:B.rating})});
  if(!r.ok){B.rating=old;$('#ctrl').innerHTML=ctrl();tila('Arvio ei tallentunut',true)}return}
 const gb=t.closest&&t.closest('#ctrl [data-g]');if(gb){const v=gb.dataset.g,old=B.progress;B.progress=old===v?null:v;$('#ctrl').innerHTML=ctrl();
  const r=await fetch('/ui/bookmark/'+encodeURIComponent(id)+'/progress',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({progress:B.progress})});
  if(!r.ok){B.progress=old;$('#ctrl').innerHTML=ctrl();tila('Lukutila ei tallentunut',true)}}});
$('#km').addEventListener('change',async e=>{if(e.target.id!=='pv'||!e.target.value)return;
 const r=await fetch('/ui/bookmark/'+encodeURIComponent(id)+'/date',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:e.target.value})});
 if(!r.ok){tila('Päivä ei tallentunut',true);return}B.saved_at=(await r.json()).saved_at;tila('Päivä tallennettu')});
async function load(){const r=await fetch('/ui/book/'+encodeURIComponent(id));
 if(r.status===401){location.href='/login';return}
 if(!r.ok){$('#km').innerHTML='<div class="empty">Kirjaa ei löytynyt.</div>';return}
 const d=await r.json();B=d.bookmark;Q=d.quotes;D=parse(d.recall);last=d.recall||'';document.title=(B.title||'Kirja')+' · Kirjamuistio';render()}
load();
</script></body></html>`;
}
