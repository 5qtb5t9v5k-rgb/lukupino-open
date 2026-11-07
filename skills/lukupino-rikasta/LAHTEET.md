# Lähteiden säännöt

Rikastus (`SKILL.md`), litterointi (`../litteroi/SKILL.md`) ja tutkimus
(`../lukupino-tutki/SKILL.md`) lukevat tämän ennen kuin noutavat mitään.
Tässä on se, mitä lähteistä on opittu: mistä sisältöä ei saa, mistä sen saa
kiertotietä ja mitä ei tehdä koskaan.

**Kantava sääntö:** jos sisältöä ei saatu, sitä ei keksitä. Tallennus on
`ei-noudettavissa`, `fetchNote` kertoo syyn, ja tiivistelmä jää tyhjäksi.

## Ei noudeta

Worker merkitsee nämä `ei-noudettavissa`-tilaan jo tallennushetkellä
(`NO_FETCH_DOMAINS`, `src/fetchmeta.ts`). Lista on koodissa; tämä taulukko
kertoo miksi. Jos lisäät domainin, lisää se molempiin.

| Domain | Miksi | Mitattu |
|---|---|---|
| `x.com`, `twitter.com` | Vaatii kirjautumisen ja selainrenderöinnin; `og:description` on tyhjä | 27.8.2026 |
| `reddit.com` | Estää konesalien IP-osoitteet (403) | 27.8.2026 |
| `instagram.com`, `facebook.com`, `linkedin.com` | Vaativat kirjautumisen | 27.8.2026 |

**YouTube ja Spotify** eivät ole listalla, mutta niiden sivuilta ei saa
sisältöä konesalista: YouTube vastaa evästekyselyllä (myös WebFetchille) ja
Spotifyn oma kuvaus on pelkkä "Podcast · Episode". Avaimeton oEmbed antaa
otsikon ja kansikuvan, ja tila jää silti `ei-noudettavissa`, koska tila kertoo
**sisällöstä**. Sisältö tulee litteraattireitiltä (ks. *Podcastit*).

**Pysyvästi saavuttamattomat** (todettu 26.9.2026): Instagram, Figma, Notion
(kirjautuminen), maksumuurin takaiset jutut kokonaisina, sivut jotka estävät
konesalit, ja ohjelmat ilman julkista syötettä. Näille ei etsitä kiertoteitä.

Worker seuraa `<meta http-equiv=refresh>`-ohjauksen (enintään 2 hyppyä), jota
esim. `open.substack.com` käyttää. Jos otsikko on pelkkä osoite, ohjaus jäi
seuraamatta.

## Osittain noudettavat

| Lähde | Mitä saa | Miten merkitään |
|---|---|---|
| HS, Talouselämä, Kauppalehti (maksumuuri) | Ingressi, noin 700–800 merkkiä | `status: noudettu`, `fetchNote: "vain ingressi"` — ingressi **on** noudettu sisältö |
| Muu maksumuuri tai kirjautuminen | Alle 200 merkkiä | `status: ei-noudettavissa`, `fetchNote: "maksumuuri"` |
| Estosivu, ihmistarkistus, evästekysely, tyhjä sivu | Ei mitään | `ei-noudettavissa`. Tiivistelmä estosivusta on keksitty tiivistelmä |

## Pelastusreitit (X, Reddit, Substack)

`ei-noudettavissa` ei aina tarkoita saavuttamatonta. Näille on julkisia
reittejä ilman kirjautumista. **Sallittu:** julkiset, kirjautumattomat
rajapinnat. **Kielletty aina:** proxyt, evästeet, kirjautuminen,
selainautomaatio ja kenen tahansa tunnukset.

Reitit on testattu koko jonolla 26.9.2026 [mitattu 26.9.2026]:

| Lähde | Reitti | Tulos ja ansat |
|---|---|---|
| X / Twitter | `https://cdn.syndication.twimg.com/tweet-result?id=<id>&token=a` (`<id>` = numero osoitteen `/status/`-osan jälkeen) | Julkaisun teksti, pitkä teksti (`note_tweet`) sekä kuvien ja videoiden osoitteet; 17/20 saatiin. **Tyhjä vastaus = poistettu tai suojattu.** X-artikkelista tulee vain otsikko ja esikatselu. Pitkän julkaisun koko teksti ei aina tule (20.10.2026: vain 276 merkkiä ja `note_tweet`istä pelkkä id): **katso liitekuva**, sisältö on X:ssä usein vain kuvassa tai videossa, ja se luetaan Geminillä |
| Reddit | Julkaisun osoite + `/.rss` | Teksti ja kommentit; 6/6 saatiin. JSON (myös `old.reddit`) on 403 konesalista. Jako-osoite `/s/<koodi>` seurataan ensin oikeaan osoitteeseen. 429 herkästi: **20 sekunnin väli** riittää |
| Substack-muistiinpano | `https://substack.com/api/v1/reader/comment/<id>` (`<id>` = c-alkuinen numero osoitteesta) | 5/5 saatiin |

**Poistettu julkaisu:** jos julkinen reitti palauttaa tyhjän tai Reddit-linkki
ohjaa aliredditin etusivulle, julkaisu on poistettu. Lisää tallennus listalle
*Sisältö puuttuu* ja kirjoita syy `fetchNote`en. Sen jälkeen sitä ei yritetä
enää (jono C ohittaa listan *Sisältö puuttuu*).

Kun testaat reitin uudelleen ja tulos muuttuu, päivitä tähän päivä ja luvut.

## Podcastit

- **Sisältö tulee ohjelman RSS-syötteestä.** Spotify on vain jakelukanava;
  jakso itse on julkinen MP3 syötteessä. Syöte löytyy ilmaisella haulla
  `https://itunes.apple.com/search?term=<ohjelma>&entity=podcast` (6/6
  ohjelmaa löytyi testissä 16.8.2026, myös suomalaiset). Worker käyttää
  lisäksi gpodder.netiä ja poimii jakson kuvauksen ja keston; MP3:sta se
  kirjoittaa vain "mp3 saatavilla" `fetchNote`en. MP3-osoitteen kirjoittaa
  rutiini `mediaUrl`-kenttään (`SKILL.md` vaihe 2d).
- **Kolme mitattua ansaa Spotify-jakson kuvauksessa** (13.9.2026):
  1. Spotify antaa og-tagit vain botilta näyttävälle user-agentille;
     Safarin tunnisteelle tulee tyhjä JS-sivu. Ohjelman nimi on
     og:descriptionissa muodossa `<Ohjelma> · Episode`.
  2. iTunes vastaa Cloudflaren osoitteista 429:llä jo yksittäiseen
     pyyntöön. Siksi syöte välimuistitetaan KV:hen (`podfeed:<nimi>`,
     30 pv), ja rutiini esitäyttää sen omasta osoitteestaan
     (`POST /api/enrich`, kenttä `feeds`; `SKILL.md` vaihe 2b).
  3. og:description antaa joskus tekijän nimen ohjelman sijaan. Nimi on
     vain hakuavain; varsinainen osumasuoja on jakson **tarkka otsikko**.
- **Vartija: älä koskaan litteroi väärää lähdettä.** YouTube-vastineen
  etsiminen podcast-jaksolle on kielletty. Vaara ei ole "ei osumaa" vaan
  **väärä osuma**: testissä löytyi eri jakso samalla vieraalla, ja otsikkoon
  nojaava sovitin olisi poiminut sen varmana. Väärä litteraatti on huonompi
  kuin ei litteraattia. Käytä aina jakson omaa MP3:a. Jos syöte ei anna
  jaksoa, jätä tallennus rauhaan.
- **Valmis litteraatti syötteessä:** Podcasting 2.0:n `<podcast:transcript>`
  on tarkin ja halvin lähde, mutta harvinainen (1/8 ohjelmasta testissä).
  Skriptit eivät vielä käytä sitä [mitattu 7.11.2026, `skills/litteroi`].
- **Äänikirjat ja ohjelmat ilman julkista syötettä:** ääntä ei ole. Kirjoita
  `note`-kenttään merkintä (alla) ja syy.
- **Koneellinen litteraatti sotkee erisnimet** (esim. "Buridan" → "Burden").
  Argumentit ovat luotettavia, nimet eivät: älä lainaa nimeä tarkistamatta.

## Litteraatin merkinnät

| Merkintä `note`-kentässä | Tarkoittaa | Seuraus |
|---|---|---|
| `# Litteraatti (Gemini, ääni/video)` | Tiivistelmä, aiheet ja poiminnat on tehty | Jono B ohittaa |
| `# Litteraatti — ei saatavilla` + syy | Ääntä tai videota ei saa | Jono B ohittaa pysyvästi |
| `transcript_words: 0` | Gemini kieltäytyi sanatarkasta tekstistä (RECITATION) | Jono D ohittaa. **Suodatinta ei kierretä** |
| `transcript_words: null` ja `# Litteraatti (` | Vain tiivistelmä, koko litteraatti puuttuu | Jono D ottaa |
