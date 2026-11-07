// Kysy Claudelta (27.10.2026): avaa uuden claude.ai-keskustelun, jossa on
// valmiina lähteen otsikko, osoite, lukupinon id ja tiivistelmä sekä ohje
// hakea koko sisältö lukupinon MCP-työkaluilla (claude.ai:n Lukupino-liitin).
// Kehote kopioidaan myös leikepöydälle, koska claude.ai:n ?q=-parametri ei
// ole virallisesti dokumentoitu: jos esitäyttö ei toimi, kehotteen voi liittää.
// Pituus pidetään alle ~2 000 merkin, ettei osoite katkea.
//
// Huom: tämä on asiakaskoodia template literalissa, joten siinä ei saa olla
// kenoviivoja eikä dollari-aaltosulkeita (rivinvaihto: String.fromCharCode).

export const KYSY_JS = `
function kysy(b,laji){laji=laji||window.KYSY_LAJI;var NL=String.fromCharCode(10);var s=(b.summary||'').trim();if(s.length>500)s=s.slice(0,497)+'…';
 var r=['Haluan keskustella tästä lukupinooni tallentamastani lähteestä.','','Otsikko: '+(b.title||b.url),'Osoite: '+b.url,'Lukupinon id: '+b.id];
 if(s)r.push('Tiivistelmä: '+s);
 var t=['get-bookmark-content'];if(b.transcript_words||laji==='litteraatti')t.push('get-transcript (koko litteraatti)');if(b.research_status==='valmis'||laji==='tutkimus')t.push('get-research (tutkimus)');
 r.push('','Hae sisältö lukupinon työkaluilla: '+t.join(', ')+'.');
 var k={litteraatti:'Kuuntelin tai luin litteraatin.',lukija:'Luin jutun lukupinossa.',tutkimus:'Luin tästä tehdyn tutkimuksen.'}[laji];if(k)r.push(k);
 r.push('Kerro lyhyesti mistä on kyse ja kysy, mihin haluan syventyä.');
 var p=r.join(NL);try{if(navigator.clipboard)navigator.clipboard.writeText(p).catch(function(){})}catch(e){}
 window.open('https://claude.ai/new?q='+encodeURIComponent(p),'_blank','noopener')}
`;

/** Pieni tekstinappi lukusivujen otsikon meta-riville. */
export const KYSY_CSS = `.kysy{border:0;background:none;padding:0;font:inherit;color:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:4px;opacity:.85}.kysy:hover{opacity:1;text-decoration:underline;text-underline-offset:2px}.kysy svg{width:12px;height:12px}`;

export const KYSY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"></path></svg>`;
