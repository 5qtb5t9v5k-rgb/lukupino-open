---
name: lukupino-rikasta
description: "Lukupinon päivittäinen rikastus: noutaa inbox-tilaisten kirjanmerkkien sisällön (WebFetch) niiltä domaineilta joilta se on noudettavissa, merkitsee loput rehellisesti ei-noudettaviksi eikä keksi mitään. Viikoittain vie koko kannan repoon varmuuskopioksi. Käytä kun kutsutaan /lukupino-rikasta tai ajastettu rutiini käynnistää sen."
---

# Lukupinon rikastus

Worker hakee tallennushetkellä vain otsikon ja meta-kuvauksen, koska
ilmaistason CPU-raja on 10 ms. Tämä skilli tekee loput: hakee sisällön,
kirjoittaa otteen ja pitää statuksen totuudenmukaisena.

**Kantava sääntö:** jos sisältöä ei saatu, kirjanmerkki on
`ei-noudettavissa` ja `fetchNote` kertoo miksi. Otsikosta ei kirjoiteta
otetta. Keksitty ote on huonompi kuin tyhjä, koska tiivistelmä, haku ja
pistokoe luottavat siihen.

## Lue ensin

[`LAHTEET.md`](LAHTEET.md) tässä kansiossa: lähteet joita ei noudeta,
pelastusreitit kirjautumismuurin takaa ja podcastien säännöt (Spotify-linkit
menevät litteraattireitille, eivät tähän).

## Työkalut: MCP tai REST

Jos `mcp__lukupino__*`-työkalut ovat käytettävissä, käytä niitä. **Ajastettu
rutiini ei saa niitä** — Routine ei tallenna MCP-yhteyksiä, mikä todettiin
16.9.2026 kun kolme ajoa oli "onnistunut" tyhjentämättä jonoa. Silloin sama
työ tehdään REST-rajapinnalla, joka osaa kaiken tarvittavan:

```bash
B="${LUKUPINO_URL:?aseta LUKUPINO_URL, esim. https://lukupino.<tili>.workers.dev}"
H="Authorization: Bearer $LUKUPINO_CAPTURE_TOKEN"
A="User-Agent: lukupino-agent/1.0"   # ilman tätä Cloudflare vastaa 1010

curl -sS -H "$H" -H "$A" "$B/api/export" -o /tmp/lukupino.json   # koko kanta
curl -sS -X POST -H "$H" -H "$A" -H "Content-Type: application/json" \
  --data-binary @/tmp/paivitys.json "$B/api/update"              # enintään 100
```

`/api/update` ottaa `{"updates":[{"id","summary","excerpt","description",
"title","note","recall","imageUrl","mediaUrl","status","fetchNote","rating",
"lists"}]}`. Jono suodatetaan viennistä paikallisesti: mukaan ne joilla
`summary` on tyhjä ja `status` ei ole `ei-noudettavissa`.

**`updated: 4` ei tarkoita että kaikki kentät menivät perille.** Pääte
ohittaa tuntemattomat kentät hiljaa ja laskee rivin silti päivitetyksi.
20.9.2026 neljä litteraattia kirjoitettiin `note`-kenttään jota pääte ei
silloin tuntenut: vastaus oli `{"updated":4,"missing":[]}` ja muistiinpanot
katosivat. Tarkista kirjoituksen jälkeen `/api/export`:sta että kenttä
todella on kannassa.

## Vaihe 1 — Jono

`search-bookmarks` kyselyllä **`-has:summary -status:ei-noudettavissa`**,
`limit: 50`, `sortOrder: asc` (vanhimmat ensin). Seuraa `nextCursor` loppuun.
Kirjaa jonon koko.

**Jono ei ole `status:inbox`.** Se oli tämän skillin alkuperäinen kysely ja
se oli väärä: Worker merkitsee kirjanmerkin `noudettu`-tilaan heti kun
otsikko ja meta-kuvaus saadaan, vaikka otetta ei olisi lainkaan. Mitattu
13.9.2026: 208 kirjanmerkistä vain 13 oli `inbox`-tilassa, eli kysely olisi
ohittanut lähes kaiken juuri tallennetun. Tekemätön työ tunnistetaan siitä
että **tiivistelmä puuttuu**, ei statuksesta.

**Kirja pelkällä nimellä ei kuulu jonoon.** Omistaja voi lisätä kirjan
nimellä (17.10.2026): `media: kirja`, ei `file_key`ä, osoitteena
Google-kirjahaku ja `fetchNote: "kirja — ei verkkosisältöä"`. Sitä ei
noudeta eikä siitä kirjoiteta tiivistelmää otsikon perusteella — kirja on
sisältö, jota verkossa ei ole. Ohita se.

**Mediatyyppi ja lukutila.** Jokaisella tallennuksella on `media`
(artikkeli, video, podcast, kirja, some, dokumentti, kuva), joka päätellään
osoitteesta. Jos se on selvästi väärin (esim. kirjapalvelun sivu
artikkelina), korjaa se `/api/update`-kentällä `media`. **Lukutilaa
(`progress`: lukematta, kesken, luettu) ei kosketa koskaan** — sen merkitsee
vain omistaja.

Jos jono on yli 100, käsittele 50 ja sano vastauksessa paljonko jäi —
älä yritä tyhjentää kaikkea yhdellä ajolla.

**Toinen jono: litteroimattomat äänet ja videot.** Ehto on: osoite on
`youtube.com`, `youtu.be` tai `open.spotify.com` eikä `note` sisällä riviä
`# Litteraatti`. **Ei muuta ehtoa** — ei statusta, ei arviota, ei
puuttuvaa tiivistelmää.

Jokainen muu ehto on kokeiltu ja jokainen vuoti. Puuttuva tiivistelmä ei
löydä niitä, koska otsikko tulee heti ja siitä kirjoitettu tiivistelmä
sulkee ne jonosta lopullisesti (18/43 oli tällaisia 20.9.2026).
`status: inbox` ei löydä niitä samasta syystä. Ja **`ei-noudettavissa` on
niistä valtaosa**: Worker saa oEmbedistä otsikon muttei kuvausta, joten se
merkitsee sisällön puuttuvaksi — ja jono A jättää `ei-noudettavissa`:n
ulkopuolelle määritelmän mukaan. Mitattu 22.9.2026: 40:stä litteroimatta
olevasta 35 oli `ei-noudettavissa`, eli ne olivat pysyvästi näkymättömiä
kummallekin jonolle. Omistajan päivän aikana tallentamat linkit päätyivät
suoraan tähän umpikujaan.

**Arvio ei ole portti vaan järjestys.** Nolla tarkoittaa *perehdy*:
omistaja ei ole lukenut, mutta aikoo — litteraatti auttaa juuri siinä,
joten nolla menee heti kolmosten jälkeen. Aiempi sääntö "vain arvio 2–3" oli
väärä: valtaosaa ei ehditä arvioida ennen kuin ne on kuunneltu, eli portti
sulki juuri ne joita varten litterointi on olemassa. Järjestys on nyt:
arvio 3, arvio 0 (perehdy), arvio 2, sitten uusimmat. Kiintiö hoidetaan erän koolla eikä
portilla — **enintään 3 per ajo, ja niistä enintään 1 Spotify-jakso**,
koska podcast on tunteja ja YouTube-video minuutteja.

## Vaihe 2 — Reititä

| Tilanne | Tee |
|---|---|
| `excerpt` on jo (Safarista jaettu) | `update-bookmark status: noudettu` — älä nouda uudelleen |
| Domain on [`LAHTEET.md`](LAHTEET.md):n kohdassa *Ei noudeta* | `update-bookmark status: ei-noudettavissa, fetchNote: <syy listasta>` |
| Spotify-jakso, `fetchNote` sisältää `rss:` | Worker ei saanut syötettä (iTunes 429 Cloudflaresta). **Hae syöte itse** — vaihe 2b |
| Spotify-jakso, ote on jo | Worker sai kuvauksen RSS:stä — tiivistä normaalisti |
| **Tiedosto** (`file_key` on olemassa — tallennettu tai linkistä noudettu) | vaihe 2c |
| **YouTube tai Spotify, ei litteraattia** (myös `ei-noudettavissa`) | vaihe 2d — litterointi Geminillä |
| Muu | **WebFetch** → vaihe 3 |

## Vaihe 2b — Spotify-jakson syöte, kun Worker ei sitä saanut

Worker hakee jakson kuvauksen ohjelman RSS-syötteestä (ks.
[`LAHTEET.md`](LAHTEET.md)), mutta iTunes vastaa Cloudflaren osoitteista
usein 429. Sinun osoitteestasi se toimii. Kun `fetchNote` alkaa `oEmbed:`
ja sisältää `rss: itunes`:

1. Ohjelman nimi on `fetchNote`ssa tai `description`-kentässä muodossa
   `<Ohjelma> · Episode`.
2. `WebFetch` → `https://itunes.apple.com/search?term=<ohjelma>&entity=podcast&limit=5`,
   poimi `feedUrl` tulokselta jonka `collectionName` täsmää.
3. `POST /api/enrich` rungolla `{"ids":["<id>"],"feeds":{"<ohjelma>":"<feedUrl>"}}`
   (bearer `$LUKUPINO_CAPTURE_TOKEN`, `User-Agent` mukaan). Worker tallentaa
   syötteen välimuistiin 30 päiväksi ja noutaa kuvauksen taustalla.
4. Odota ~20 s ja lue kirjanmerkki uudelleen. Jos `fetchNote` sanoo yhä
   `rss: syötteestä ei löytynyt jaksoa`, otsikko ei täsmää syötteeseen —
   jätä `ei-noudettavissa`, älä arvaa.

## Vaihe 2c — Tallennettu tiedosto

Omistaja voi tallentaa kuvia, PDF:iä ja dokumentteja suoraan selaimesta.
Lisäksi **Worker noutaa linkitetyn dokumentin itse**: jos tallennettu osoite
osoittautuu PDF:ksi tai muuksi dokumentiksi, tavut haetaan R2:een ja otsikoksi
tulee tiedostonimi. Molemmissa tapauksissa kirjanmerkillä on `file_key`, ja
tiedoston saa osoitteesta
`$B/file/<file_key>` (huomaa: `url`-kenttä
on alkuperäinen lähde, kun dokumentti tuli linkistä).

| Tyyppi | Tee |
|---|---|
| Kuva (`image/*`) | Kuva on jo kansikuvana ja status `noudettu`, ja tiivistelmä puuttuu, joten se on jonossa A. **Lataa ja katso** — ks. *Kuva* alla. Älä kuvaile kuvaa näkemättä sitä |
| PDF, teksti, Office-dokumentti (`status: inbox`) | Lataa ja lue, ks. alla |
| Muu (`ei-noudettavissa`) | Jätä sellaisekseen |

Lataus: `curl -sS -H "Authorization: Bearer $LUKUPINO_CAPTURE_TOKEN" -o <tiedosto> <host>/file/<file_key>`.

PDF:n tekstin saa `Read`-työkalulla, mutta **se vaatii `poppler-utils`in joka
ei ole aina asennettuna**. Varmempi reitti on `pypdf`:

```python
import pypdf
t = "\n".join((p.extract_text() or "") for p in pypdf.PdfReader(polku).pages)
```

Jos `pypdf` kaatuu `ModuleNotFoundError: _cffi_backend`, korjaus on
`pip install --upgrade cffi` (todettu 20.9.2026). Kirjoita `excerpt` (enintään
3 000 merkkiä), `summary` ja lista kuten muillekin, ja aseta
`status: noudettu`.

**Älä kirjoita tiivistelmää tiedostonimestä.** Se on sama sääntö kuin
otsikosta kirjoittamisessa: nimi ei ole sisältö.

### Kuva — kirjan sivu, muistiinpano, kuvakaappaus

Omistaja kuvaa kirjan sivuja korostuksineen ja tallentaa ne suoraan
puhelimesta. Tiedostonimi (`IMG_7252.jpeg`) ei kerro mitään, joten
**kaikki tieto tulee kuvasta**. Lataa kuva ja katso se `Read`-työkalulla.
Puhelinkuvat ovat 3–5 Mt: jos `Read` ei ota kuvaa, pienennä se Pillowilla
(`pip install pillow`, pitkä sivu 1500 px) ja lue uudelleen. Jos teksti ei
silti erotu, lue kuva Geminillä (`inline_data`, sama avain kuin
litteroinnissa).

Tunnista ensin, mitä kuvassa on: kirjan nimi (usein sivun ylätunnisteessa),
luku, sivunumero ja korostetut kohdat. Kirjoita sitten yhdellä
`/api/update`-kutsulla:

| Kenttä | Sisältö |
|---|---|
| `title` | `Kirja — Kirjoittaja, s. N: aihe`, esim. *Measure What Matters — John Doerr, s. 176: CFR ja jatkuva suorituksen johtaminen* |
| `excerpt` | Sivun teksti sanatarkasti, sivunumerot hakasulkeissa. Osittain kuvan ulkopuolelle jäävät rivit merkitään `…`:llä — älä täydennä |
| `summary` | Keskeiset nostot kuten muillekin (vaihe 3b): mitä sivu väittää, käsitteet nimettyinä ja tausta |
| `note` | `# Kuva — keskeiset nostot` ja sen alle **Konseptit** (jokainen käsite selitettynä: mitä se tarkoittaa ja miten se toimii), **Konteksti** (kirja ja kirjoittaja, mihin sivu kirjassa liittyy, miksi tällä on väliä omistajan alueille, tunnettu kritiikki) ja **Poiminnat** |
| `status`, `lists` | `kortitettu` ja yksi lista vaiheen 3b mukaan |

**Poiminnat ovat omistajan korostukset, sanatarkasti** muodossa
`s. 176 – "lainaus"` tai `s. 176 – Puhuja: "lainaus"`. Worker vie ne
poimintakokoelmaan. Älä lisää korostamattomia kohtia äläkä korostuksia,
jotka jäävät osittain kuvan ulkopuolelle; mainitse ne Konteksti-osiossa
sisältönä. Jos korostuksia ei ole, Poiminnat-osio jätetään pois.

Tarkista lopuksi viennistä (`/api/export`), että `note` tallentui ja
poiminnat näkyvät `quotes`-taulukossa. `{"updated":1}` ei todista sitä.

## Vaihe 2d — Video ja podcast

YouTube- ja Spotify-tallennuksesta Worker saa vain otsikon ja kansikuvan.
Siitä kirjoitettu tiivistelmä on tiivistelmä otsikosta, ei sisällöstä.
Oikea sisältö saadaan Geminiltä. **Järjestys 21.10.2026 alkaen: ensin koko
litteraatti, sitten tiivistelmä litteraatista**, jotta video luetaan vain
kerran:

```bash
python3 skills/litteroi/koko.py youtube "<watch-url>" --tallenna <id>
python3 skills/litteroi/koko.py audio   "<media_url>" --tallenna <id>
bash skills/litteroi/litteroi.sh teksti <id> skills/litteroi/ohje.txt
```

Jos `koko.py` palauttaa koodin 3 (RECITATION) tai 2, tee tiivistelmä
suoraan lähteestä: `litteroi.sh youtube "<watch-url>"` tai
`litteroi.sh audio "<media_url>"` samalla ohjeella.

YouTubella riittää osoite — videota ei ladata. Podcastilla tarvitaan
`media_url` (jakson MP3 RSS-syötteestä); jos se puuttuu, tee vaihe 2b ensin
ja jätä tallennus rauhaan jos syöte ei anna jaksoa.

**Erän koko on kiintiön suoja: enintään 3 per ajo, niistä enintään 1
Spotify-jakso.** Kahden tunnin podcast on noin 200 000 syötetokenia ja
ilmaiskiintiö 8 h ääntä vuorokaudessa; YouTube-video on murto-osa siitä.
Järjestys on arvio 3, arvio 0 (perehdy), arvio 2, sitten uusimmat.

Tulos kirjoitetaan kuten `skills/litteroi/SKILL.md` sanoo: TIIVISTELMÄ
`summary`-kenttään, AIHEET ja POIMINNAT `note`-kenttään otsikon
`# Litteraatti (Gemini, ääni/video)` alle, `status: kortitettu`,
`fetchNote: "tiivistelmä ja aiheet Geminiltä lähteen äänestä"`.

Koko litteraatti (ks. `skills/litteroi/SKILL.md`, kohta *Koko litteraatti*)
näkyy kortilla linkkinä *Koko litteraatti* ja avautuu lukunäkymään, josta
omistaja korostaa poimintoja.

**Jono D — koko litteraatti puuttuu.** Litteroiduilla ennen 5.10.2026 on
vain tiivistelmä: `note` sisältää rivin `# Litteraatti (` mutta
`transcript_words` on `null`. **Nolla ei ole tyhjä** — se tarkoittaa, että
Gemini kieltäytyi (RECITATION, ks. alla) eikä yritystä toisteta. Ota **enintään 3 per ajo, niistä enintään 1
Spotify-jakso**, järjestyksessä arvio 3, arvio 0, arvio 2, sitten
uusimmat. Spotify-jaksolta puuttuu usein `media_url` — hae se vaiheen 2b
tapaan, ja jos syöte ei anna jaksoa, ohita se.

`koko.py` palauttaa koodin 3, kun Geminin tekijänoikeussuodatin
(RECITATION) kieltäytyy sanatarkasta tekstistä — 5.10.2026 kolmella
16:sta YouTube-videosta, joka palalla ja joka uusinnalla. `--tallenna`
merkitsee sen silloin itse (`transcript_words: 0`). **Älä kierrä
suodatinta** pyytämällä "lähes sanatarkkaa" tekstiä; tiivistelmä, aiheet ja
poiminnat jäävät, ja se riittää.

Jos `LUKUPINO_GEMINI_KEY` puuttuu ympäristöstä, **sano se vastauksessa** äläkä
kirjoita otsikosta tiivistelmää tilalle. Tyhjä on parempi kuin keksitty.

Kun ääntä ei saa lainkaan (äänikirja, ohjelma ilman julkista syötettä),
kirjoita `note`-kenttään otsikko `# Litteraatti — ei saatavilla` ja syy.
Silloin jono B ei ota samaa tallennusta uudelleen joka yö. Merkintä on
sovittu [`LAHTEET.md`](LAHTEET.md):ssä.

## Vaihe 2e — Kirjautumismuurin takana olevat (X, Reddit, Substack)

`ei-noudettavissa` ei aina tarkoita saavuttamatonta. X:lle, Redditille ja
Substack-muistiinpanoille on reitit ilman kirjautumista — ne ovat
[`LAHTEET.md`](LAHTEET.md):n kohdassa *Pelastusreitit*. Kun sisältö on vain
kuvassa tai videossa (X:ssä tavallista), lue se Geminillä äläkä kirjoita
tiivistelmää pelkästä saatetekstistä.

## Vaihe 3 — Nouda ja kirjoita

`WebFetch` osoitteeseen, prompt: *"Palauta sivun pääsisältö tekstinä
sellaisenaan, ilman navigaatiota, mainoksia ja kommentteja. Älä tiivistä.
Jos sivu on maksumuurin takana tai vaatii kirjautumisen, sano se ensimmäisellä
rivillä."*

- Sisältöä ≥ 200 merkkiä → `update-bookmark excerpt: <teksti, enintään 3000
  merkkiä>, status: noudettu`. Jos otsikko puuttui, anna myös `title`.
- Maksumuuri / kirjautuminen / alle 200 merkkiä → `status: ei-noudettavissa,
  fetchNote: "maksumuuri"` tai vastaava. HS, Talouselämä ja Kauppalehti
  antavat ingressin (700–800 merkkiä): se **on** noudettu sisältö, merkitse
  `noudettu` ja jätä `fetchNote: "vain ingressi"`.
- WebFetch epäonnistuu → `fetchNote: <virhe lyhyesti>`, status
  `ei-noudettavissa`. Älä yritä kolmea kertaa.

## Vaihe 3b — Tiivistelmä ja luokka jokaiselle noudetulle

Ote on raakaa tekstiä eikä kerro selaillessa mistä on kyse. Siksi samassa
`update-bookmark`-kutsussa kirjoitetaan aina myös **`summary`** ja
sijoitetaan kirjanmerkki **yhteen listaan**.

**`summary`: 2–3 lausetta.** Ensimmäinen lause kertoo mistä on kyse,
toinen miksi se voisi kiinnostaa omistajaa (päättele omistajan listojen
aiheista ja siitä, mitä hän on arvioinut korkealle).
Kirjoita toimituksellisella äänellä, älä toista otsikkoa. Tiivistelmä menee
täystekstihakuun, joten käytä niitä sanoja joilla tätä myöhemmin etsii.

**Tiivistelmä kirjoitetaan vain noudetusta sisällöstä.** Jos status on
`ei-noudettavissa`, `summary` jätetään tyhjäksi. Otsikosta kirjoitettu
tiivistelmä on keksitty tiivistelmä.

**Luokka: tasan yksi lista** `get-lists`-työkalun (tai `GET /api/lists`)
palauttamista. Kahdella listalla on sovittu merkitys, ja ne luodaan
asennuksessa (`INSTALL.md`): 📚 **Luettavaa** ja ⚠️ **Sisältö puuttuu**.
Muut ovat omistajan aihelistoja; älä oleta niiden nimiä, vaan lue ne joka
ajolla. Listan nimi kirjoitetaan **ilman emojia** — emoji on erillinen kenttä,
ja nimi emojin kanssa luo kaksoiskappaleen.

| Tilanne | Lista |
|---|---|
| Aihe osuu selvästi yhteen aihelistoista | se |
| Luettavaa, mutta aihe ei osu mihinkään | 📚 Luettavaa |
| `ei-noudettavissa` | ⚠️ Sisältö puuttuu |
| **Ei ole luettavaa lainkaan** (verkkokauppa, tuotesivu, hakutulos) | **ei listaa** — jätä ilman |

Viimeinen rivi on tarkoituksellinen. Kaikki tallennettu ei ole luettavaa, ja
väkisin luokiteltu ostoslinkki pilaa sekä listan että viikkokoosteen luvut.
Sano vastauksessa erikseen montako jäi ilman listaa ja miksi.

**Älä luo uusia listoja äläkä lisää tageja.** Karakeepissa tageja oli 300,
joista 241 esiintyi vain kerran — se on mitattu eikä mielipide. Jos huomaat
että jokin aihe toistuu eikä mikään lista sovi, **kerro se vastauksessa**
äläkä luo listaa itse. Aluekartan muutos on omistajan päätös.

## Vaihe 3c — Kokoelmat: selitä jokainen kohta

Kun lähde on kokoelma — *"21 kirjaa"*, *"7 mallia"*, *"10 periaatetta"*,
lista työkaluista tai sijoituksista — pelkkä nimilista on omistajalle
hyödytön. Hän pyysi 5.10.2026, että **jokaisen kohdan keskeinen konsepti
selitetään ja sille annetaan konteksti**. Kirjoita `note`-kenttään oma osio
(esim. `## 21 kirjaa`) ja jokaisesta kohdasta:

- **Ydinajatus** — yksi lause.
- **Konsepti** — keskeinen käsite tai malli nimettynä ja selitettynä 2–3
  lauseella: mitä se tarkoittaa ja miten se toimii, mallin osat
  lueteltuina. Ei iskulausetta.
- **Lähde nostaa** — mitä videossa tai tekstissä kohdasta oikeasti
  sanotaan: esimerkki, tutkimus, tarina. Vain mitä lähteessä on.
- **Konteksti** — kirjoittajan tausta, tutkimuspohja, tunnettu kritiikki
  (esim. toistettavuus) tai kytkös listan muihin kohtiin. Älä keksi
  faktoja; jos et ole varma, jätä pois.

Videon kohdista saa ajan ja sisällön Geminillä samalla tavalla kuin
litteroinnissa: anna osoite ja pyydä JSON-taulukko näillä kentillä. Käytä
kohtien otsikoissa `###`-tasoa, jotta POIMINNAT-osio päättyy ennen niitä.
Esimerkki: video *21 kirjaa, jotka muuttivat elämäni*.

## Vaihe 2f — Jono E: tutkimukset

Omistaja pyytää tutkimuksen jakamalla linkin numerolla 4 tai painamalla
kortin Tutki-nappia (20.10.2026). Jono: viennistä `research_status ==
"pyydetty"`, vanhin ensin. Ota **enintään 2 per ajo** ja tee ne skillin
`skills/lukupino-tutki/SKILL.md` mukaan — sapluuna on omistajan hyväksymä,
älä muuta sitä. Tallenna `POST /api/research` (`{id, text}` tai
`{id, failed}`). Sisällön puuttuessa merkitse `failed`, älä kirjoita
otsikosta.

## Vaihe 2g — Jono F: pistokokeen palaute

Sunnuntain pistokokeeseen (`skills/lukupino-pistokoe`, 20.10.2026)
omistaja vastaa puhelimella. Jono: `GET /api/quiz?limit=5` → kokeet, joissa
`answered == n` ja `feedback_at` on tyhjä. Kirjoita palaute skillin kohdan
*Palaute* mukaan ja tallenna `POST /api/quiz/<id>/feedback`. Tavallisesti
jonossa on nolla tai yksi koe; se ei vie aikaa muilta jonoilta.

## Vaihe 4 — Viikoittainen vienti (vain sunnuntaisin tai pyydettäessä)

**Vain yksityiseen repoon.** Vienti sisältää jokaisen tallennuksesi,
tiivistelmän ja poiminnan. Jos repo (tai sen forkki) on julkinen, älä tee
tätä vaihetta lainkaan: sano vastauksessa, että vienti ohitettiin, koska
repo on julkinen. `export/` on `.gitignore`ssa, joten tiedosto lisätään
`git add -f`:llä tarkoituksella eikä vahingossa.

Hae `GET $B/api/export`
(`Authorization: Bearer $LUKUPINO_CAPTURE_TOKEN`, ympäristömuuttuja; aseta myös
`User-Agent`, muuten Cloudflare vastaa 1010) ja kirjoita tulos tiedostoon
`export/YYYY-Www.json` (tässä repossa, `git add -f`). Commitoi viestillä
`lukupino: vienti viikko Www, n kirjanmerkkiä`. Tämä on repon oma
varmuuskopio — git on muisti.

Älä commitoi vientiä useammin kuin kerran viikossa: 7 tallennusta päivässä
tekisi päivittäisestä viennistä kohinaa ilman lisäarvoa.

## Vastaus

Yksi rivi per käsitelty kirjanmerkki:
`✓ <otsikko> → noudettu (n merkkiä) · <lista>` tai
`– <url> → ei-noudettavissa: <syy>`.

Lopuksi: `Jono ennen n → jälkeen m · noudettu a · ei-noudettavissa b ·
ilman listaa c · tutkimuksia valmiina d, jonossa e · pistokokeen palautteita f`.

Jos jono ei pienene kolmena päivänä peräkkäin, se on vika eikä trendi —
sano se vastauksessa erikseen, jotta `/viikko` näkee sen.

## Ajastus

Tarkoitettu ajettavaksi kerran päivässä Claude Coden ajastetulla
tehtävällä (routine). Kehote, jonka rutiiniin liität, on
[`routines/aamu.md`](../../routines/aamu.md).
