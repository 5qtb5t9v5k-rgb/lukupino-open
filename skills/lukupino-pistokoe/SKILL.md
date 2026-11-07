---
name: lukupino-pistokoe
description: "Koostaa lukupinon viikon tallennuksista pistokokeen: 12 oikein/väärin-väitettä, joihin omistaja vastaa puhelimella (tosi, epätosi, en muista + varmuus), ja kirjoittaa vastausten jälkeen palautteen siitä mikä jäi mieleen, mikä ei ja mihin syventyä. Käytä kun ajastettu sunnuntairutiini käynnistää sen, omistaja pyytää pistokoetta (myös aiheesta tai listasta), tai /lukupino-rikasta ajaa jonon F (palaute)."
---

# Lukupinon pistokoe

Omistajan idea 20.10.2026: *"sellainen pistokoe vaikka oikein väärin
väittämillä … antais palautetta mitä on jäänyt mieleen, mitä osa, mitä ei
ja mihin voisi syventyä."* Peruste on muistitutkimuksen vahvin tulos:
muistista palauttaminen (testing effect) kiinnittää luetun paremmin kuin
uudelleenlukeminen. Koe on siis oppimisen väline, ei arvosana.

Oletukset (omistaja hyväksyi 20.10.2026): **sunnuntai-ilta, 12 väitettä.**

Kaksi tilaa:

- **Koe** (oletus): `/lukupino-pistokoe` = viikon tallennukset.
  `/lukupino-pistokoe aihe:<sana>` tai `lista:<nimi>` = valittu aihe koko
  pinosta (esim. `lista:AI & agentit`).
- **Palaute**: `/lukupino-pistokoe palaute`, ja päivittäin osana
  `/lukupino-rikasta`-rutiinia (jono F).

## Työkalut

MCP:ssä (21.10.2026): `list-quizzes`, `get-quiz`, `create-quiz` ja
`save-quiz-feedback` — käytä niitä, kun ne ovat saatavilla (esim.
claude.ai:ssa: "tee pistokoe tämän viikon podcasteista"). Ajastettu rutiini
ei saa MCP:tä, joten se käyttää REST:iä kuten `skills/lukupino-rikasta` (ajastettu istunto ei saa MCP:tä):

```bash
B="${LUKUPINO_URL:?aseta LUKUPINO_URL, esim. https://lukupino.<tili>.workers.dev}"
H="Authorization: Bearer $LUKUPINO_CAPTURE_TOKEN"
A="User-Agent: lukupino-agent/1.0"   # ilman tätä Cloudflare vastaa 1010
curl -sS -H "$H" -H "$A" "$B/api/export" -o /tmp/lukupino.json      # kirjanmerkit + quotes
curl -sS -H "$H" -H "$A" "$B/api/transcript/<id>"                   # litteraatti
curl -sS -H "$H" -H "$A" "$B/api/research/<id>"                     # tutkimus
curl -sS -H "$H" -H "$A" "$B/api/quiz/kertaus"                      # kerrattavat
curl -sS -X POST -H "$H" -H "$A" -H "Content-Type: application/json" \
  --data-binary @/tmp/koe.json "$B/api/quiz"                        # tallenna koe
```

## Koe

> **Ajastettu rutiini** (sunnuntaisin, `routines/pistokoe.md`) lukee tämän
> kohdan repon `main`-haarasta. Jos rutiinisi kehotteessa on tämän kohdan
> kopio (rutiini ilman repoa), päivitä kopio aina, kun muutat tätä kohtaa.

### Vaihe 1 — Aineisto

Viikko = seitsemän edellistä vuorokautta (Europe/Helsinki) ajohetkestä.
Mukaan tallennus, jos **jokin** näistä osui viikolle: `saved_at`, oma
poiminta (`quotes[].created_at`, `kind` `korostus` tai `oma`), tai tutkimus
valmistui (`GET /api/research/<id>` → `created_at`). Aihetilassa aikaraja
ei päde; rajaus tehdään haulla tai `lists`-kentällä.

**Vain kulutettu.** Omistajan pitää olla lukenut, katsonut tai kuunnellut
juttu, muuten koe mittaa arvausta. Mukaan, jos arvio on 1–3, lukutila
`kesken` tai `luettu`, `recall` on täytetty tai jutusta on oma poiminta.
**Arvio 0 (Perehdy) tarkoittaa lukematonta** — pois, ellei siitä ole omaa
poimintaa. Arvioimaton (`null`) ilman muita merkkejä jää myös pois.

**Vain tarkistettava sisältö.** Väite tehdään siitä, mitä lukupino
sisältää: `summary`, `excerpt`, litteraatti, `recall`, poiminnat tai
tutkimus. Ei yleistiedosta aiheesta eikä otsikosta. Jos sisältöä ei ole,
juttu jää pois.

Jos kelvollisia on alle 4, laajenna 14 päivään. Jos silloinkin alle 3,
älä tee koetta: vastaa yhdellä rivillä `– Pistokoe: ei aineistoa (n
kulutettua tallennusta 14 päivässä)`.

### Vaihe 2 — Kertaus

`GET /api/quiz/kertaus` palauttaa aiemmat väitteet, jotka menivät väärin,
joihin vastattiin *en muista* tai jotka arvattiin, vähintään 10 päivää
sitten. Ota enintään **3**. Muotoile väite uudelleen (eri sanat, voi
kääntää toteksi tai epätodeksi), ettei vastausta muista ulkoa. Kenttiin
`kind: "kertaus"` ja `repeat_of: "<ref>"` palautuksen `ref`-kentästä.

### Vaihe 3 — Väitteet

Yhteensä **12** (kertaukset mukaan lukien). Jakauma suuntaa antavasti:

| Laji (`kind`) | Määrä | Mitä |
|---|---|---|
| `väite` | 4 | Jutun keskeinen väite, tosi |
| `vääristelty` | 3–4 | Keskeinen väite hienovaraisesti väärin: luku, suunta, syy–seuraus, kenen väite, yleistys |
| `yhteys` | 1–2 | Kahden viikon jutun suhde ("A ja B ovat samaa mieltä siitä, että…"); tosi tai epätosi |
| `poiminta` | 1–2 | Omistajan oma poiminta: kuka sanoi, missä yhteydessä, mitä se tarkoitti |
| `kertaus` | 0–3 | Vaihe 2 |

Säännöt:

- **Tosia 5–7.** Ei kuviota, josta oikean vastauksen voisi päätellä.
- Yksi väite per lause, enintään ~200 merkkiä, suomeksi.
- **Nimeä lähde väitteessä** ("Shumerin esseen mukaan…", "Mollick
  sanoo…"), jotta on selvää mitä kysytään.
- Epätosi väite on lähteen perusteella **selvästi** väärä, ei tulkinnasta
  riippuva. Ei kompaa yhden sanan varassa, ei "aina" tai "ei koskaan"
  -vihjeitä, ei kaksoiskieltoja.
- Kysy ydinasioita: mitä omistaja hyötyisi muistamaan kuukauden päästä.
  Ei vuosilukuja tai sivunumeroita, ellei luku ole jutun pointti.
- Enintään **3 väitettä per lähde**. ★★★ ja jutut, joista on omia
  poimintoja, ensin.
- Tutkimuksesta (ei jutusta itsestään) enintään 2 väitettä **koko
  kokeessa**. Jos jutun ainoa sisältö on tutkimus, se lasketaan tähän.
- Väitteet eivät saa paljastaa toistensa vastauksia: kaksi `yhteys`-väitettä
  samasta teemasta on liikaa.
- Puhuttele omistajaa sinä-muodossa ("poimimasi katkelma"), ei
  "omistajan".
- Sekoita järjestys: ei kahta saman lähteen väitettä peräkkäin.

Jokaiselle väitteelle:

- `explanation`: 1–2 lausetta siitä, mitä lähde oikeasti sanoo. Näytetään
  heti vastauksen jälkeen, joten sen pitää opettaa, ei vain todeta.
- `anchor`: lyhyt sanatarkka katkelma lähteestä (≤ 300 merkkiä), jos
  sellainen on. Ei keksittyä sitaattia.
- `bookmark_id` ja `view`: mistä väite ja katkelma tulivat (artikkelin `excerpt` on `lue`, ei `tutkimus`) — `litteraatti`, `lue`
  (excerpt), `kirja` (recall), `tutkimus` tai `poiminnat`. Lähdelinkki
  vie sinne.

Otsikko: `Viikko NN · d.–d.M.` (ISO-viikko; aihetilassa `Aihe: <nimi>`),
`scope`: `viikko` tai `aihe:<nimi>`.

### Vaihe 4 — Tallenna

```json
{"title":"Viikko 43 · 13.–19.10.","scope":"viikko","items":[
 {"statement":"…","correct":true,"explanation":"…","bookmark_id":"…","anchor":"…","kind":"väite","view":"litteraatti"},
 {"statement":"…","correct":false,"explanation":"…","bookmark_id":"…","kind":"kertaus","repeat_of":"abc123:4"}]}
```

`POST /api/quiz` → `201 {id, n, url}`. Tarkista että `n` on sama kuin
lähetettyjen väitteiden määrä.

**Vastaus** (lähtee ilmoituksena omistajalle):

```
Viikon pistokoe on valmis: 12 väitettä (2 kertausta) n jutusta.
<url>
```

Ei väitteitä eikä vastauksia ilmoitukseen.

## Lähtötasotesti (aihepolun alku)

Kun omistaja haluaa oppia aiheen kunnolla (ensimmäinen: Claude Code,
21.10.2026), polku alkaa lähtötasotestistä: 16 väitettä, aiheen 8
osa-aluetta × 2 (`level`: `perus` ja `edistynyt`). Erot viikkokokeeseen:

- `scope: "lähtötaso:<aihe>"`, otsikko `Lähtötasotesti: <aihe>`.
- Väitteet tarkistetaan aiheen **ensisijaisesta lähteestä** (virallinen
  dokumentaatio, alkuperäinen tutkimus), ei lukupinosta. Jokaisella
  `area`, `level`, `src_url` (tarkistettu sivu) ja `src_title`; `anchor`
  on sanatarkka lainaus sivulta.
- Sivu näyttää osa-alueen jo kysyttäessä ja tuloksen **osa-alueittain**
  heikoin ensin (myös *varma mutta väärin* -merkintä).
- Palautteen paikalla on **oppimispolku**: tutkimus omalle
  tallennukselleen (`Oppimispolku: <aihe>`, osoitteena aiheen
  dokumentaatio), sapluunan *Oppimispolku*-osio painottaen heikoimpia
  osa-alueita ja ohittaen hallitut. Tutkimussivun *+ pinoon* -napit vievät
  suositukset Perehdy-hyllyyn. Jono F ei kirjoita lähtötasotestille
  tavallista palautetta, vaan lyhyen rivin ja linkin polkuun.
- Väärin menneet palaavat viikkokokeen kertaukseen kuten muutkin.

## Palaute

Jono: `GET /api/quiz?limit=5` → kokeet, joissa `answered == n` ja
`feedback_at` on tyhjä. Hae kukin `GET /api/quiz/<id>` (väitteet,
vastaukset, varmuus). Vastaus `answer`: 1 tosi, 0 epätosi, −1 en muista;
`confident`: 1 varma, 0 arvaus.

Kirjoita markdown, enintään ~250 sanaa, näillä otsikoilla:

```
### Mikä jäi mieleen
### Mikä ei
### Varmuus
### Mihin syventyä
### Kertaukseen
```

- **Mikä jäi mieleen:** oikein menneiden yhteinen teema, ei luetteloa.
- **Mikä ei:** väärin ja en muista lähteittäin; kustakin yhdellä rivillä,
  mikä oli oikea ajatus.
- **Varmuus:** *varma mutta väärin* nimetään väite väitteeltä — se on
  arvokkain löydös, koska siinä tuntuma ja tieto eroavat. Jos arvaukset
  osuivat, sano se: tieto oli olemassa, varmuus puuttui.
- **Mihin syventyä:** 1–3 konkreettista tekoa: avaa juttu kohdasta X
  (lähdelinkki), täytä kirjamuistio, tai jos samasta lähteestä meni
  kaksi tai useampi väärin eikä siitä ole tutkimusta, ehdota Tutki-nappia.
- **Kertaukseen:** montako väitettä palaa noin kahden viikon päästä
  (väärin, en muista ja arvaukset).

Sävy: lyhyt, rehellinen ja kannustava. Ei arvosanoja, ei moralisointia
lukemisen määrästä.

`POST /api/quiz/<id>/feedback` `{"text":"…"}`. Rivi vastaukseen:
`✓ Pistokoe <otsikko>: palaute kirjoitettu (oikein k/n)`.

Lähtötasotestille (`scope` alkaa `lähtötaso:`) palaute on lyhyt:
osa-alueiden taso yhdellä rivillä kukin ja linkki oppimispolkuun, jos se
on jo tehty; muuten rivi *"Oppimispolku tekemättä — pyydä Claudelta."*

Osittain vastattuun kokeeseen ei kirjoiteta palautetta, eikä
vastaamattomista kokeista muistuteta: etusivun banneri riittää.
