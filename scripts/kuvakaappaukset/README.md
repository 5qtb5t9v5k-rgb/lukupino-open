# Kuvakaappaukset dokumentaatioon

Tällä kansiolla tehdään `docs/kuvat/`-kansion kuvat uudelleen, kun UI muuttuu.
Kaikki ajetaan paikallisesti: skriptit kieltäytyvät muusta osoitteesta kuin
`localhost`, eivätkä ne koske tuotantoon (`*.workers.dev`).

| Tiedosto | Mitä tekee |
|---|---|
| `demo.json` | Kuvitteellinen demoaineisto: 21 tallennusta, kolme litteraattia, poiminnat ja pistokoe |
| `tutkimus-ebbinghaus.md` | Demon valmis tutkimus kuvineen (SVG `--k-*`-väreillä) |
| `seed.mjs` | Tyhjentää paikallisen kannan ja kylvää demoaineiston |
| `kaappaa.mjs` | Ottaa kuvat Playwrightilla ja tallentaa ne `docs/kuvat/` |
| `yhteinen.mjs` | Yhteiset apurit: `.dev.vars`, istuntoeväste, ajat Helsingin aikaa |

## Ajo puhtaasta checkoutista

```bash
npm ci --legacy-peer-deps                  # jos node_modules puuttuu
cp .dev.vars.example .dev.vars              # ja täytä dummy-arvot, ks. alla
npx wrangler d1 migrations apply lukupino --local
npx wrangler dev --local --port 8788        # omaan päätteeseen tai taustalle

node scripts/kuvakaappaukset/seed.mjs --tyhjenna
node scripts/kuvakaappaukset/kaappaa.mjs              # kaikki kuvat
node scripts/kuvakaappaukset/kaappaa.mjs kirja lue    # vain nämä
```

`.dev.vars` tarvitsee vain keksityt arvot. Esimerkiksi:

```
CAPTURE_TOKEN=dev-capture-token
MCP_TOKEN=dev-mcp-token
GITHUB_CLIENT_ID=dev
GITHUB_CLIENT_SECRET=dev
COOKIE_ENCRYPTION_KEY=mika-tahansa-paikallinen-avain
ALLOWED_GITHUB_LOGIN=demo-lukija
```

GitHub-kirjautumista ei tarvita: `kaappaa.mjs` tekee selaimelle saman
`lp_session`-evästeen kuin `src/session.ts` (HMAC-SHA256 avaimella
`COOKIE_ENCRYPTION_KEY`, login = `ALLOWED_GITHUB_LOGIN`, jossa ei saa olla
pistettä). Eväste asetetaan ilman Secure-lippua, koska osoite on `http://localhost`.

Playwright ja Chromium oletetaan asennetuiksi (`require('playwright')`).
Google Fonts haetaan verkosta; jos `HTTPS_PROXY` on asetettu, selain käyttää
sitä. Ilman verkkoa sivut piirtyvät varafonteilla.

## Mitä seed tekee

1. Tyhjentää paikallisen D1:n taulut (`wrangler d1 execute --local`). Lippu
   `--tyhjenna` vaaditaan, jos kannassa on jo tallennuksia.
2. Luo listat ja tallennukset `POST /api/import`illa, joka säilyttää annetun
   tallennusajan. `/api/add` jätetään pois, koska se hakee metatiedot verkosta.
3. `POST /api/update`: mediatyyppi, lukutila, kansikuva, Omin sanoin
   (myös Kirjamuistio) ja litteraattien kortti (AIHEET + POIMINNAT, joista
   Worker tekee poiminnat).
4. `POST /api/transcript`, `POST /api/research` (yksi valmis, yksi jonossa),
   omat poiminnat `POST /api/quotes`, korostukset ja tähdet `/ui/quotes`-reiteillä
   evästeellä, pistokoe `POST /api/quiz` ja neljä vastausta `/ui/quiz/:id/answer`.
5. Siirtää poimintojen, tutkimuksen ja pistokokeen luontiajat kohdeviikolle
   SQL:llä (`--local`). Rajapinta merkitsee ne aina luoduksi nyt, mutta
   Viikko mediassa laskee ne viikon ajalta.

Ajat ovat suhteessa ajohetkeen: `"viikko": 0` on viimeisin päättynyt viikko
(ma–su, Helsingin aikaa), `-1` sitä edellinen ja `1` kuluva. Kuvat näyttävät
siis aina tuoreilta, ja `viikko.png` on aina demon kohdeviikko.

## Kuvat

| Kuva | Näkymä |
|---|---|
| `etusivu.png` | Etusivun hyllyt Perehdy-riviin asti |
| `kortti.png` | Kortti alapaneelissa (arvio, tila, toiminnot, Tutkimus-linkki) |
| `litteraatti.png` | `/litteraatti/<id>` ensimmäiseen korostukseen asti |
| `lue.png` | `/lue/<id>` korostuksineen |
| `tutkimus.png` | `/tutkimus/<id>` kuvaan asti |
| `pistokoe.png` | `/pistokoe/<id>`, viides väite vastattuna |
| `viikko.png` | `/viikko/<ma>` kolme ruutua vierekkäin |
| `poiminnat.png` | `/poiminnat` |
| `kirja.png` | `/kirja/<id>` Kirjamuistio |
| `lisaa.png` | Lisää-paneeli auki |
| `tyopoyta.png` | Etusivu 1280 × 800 -ikkunassa, hyllyt ja ensimmäinen korttirivi |
| `etusivu-tumma.png` | Etusivu tummana |

Puhelinkuvat ovat 390 × 844, `deviceScaleFactor` 2. Pitkissä kuvissa ikkunaa
venytetään sisällön mittaiseksi; `fullPage` pudottaisi mobiiliemuloinnin.

Huomioita:

- **Pistokoe muuttaa kantaa.** Kuva vastaa viidenteen väitteeseen selaimessa,
  joten aja `seed.mjs` uudelleen ennen seuraavaa täyttä kaappausta.
- **Viikko-banneri** näkyy etusivulla vain maanantaista keskiviikkoon ja
  sunnuntai-iltana (selaimen kello), joten etusivun kuva riippuu ajopäivästä.
- **Kansikuvat** ovat pieniä abstrakteja SVG-kuvia data-osoitteina
  (`seed.mjs`, `MUODOT`). Ne latautuvat ilman verkkoa eikä niissä ole lisenssiehtoja.
- **Demoaineisto on keksittyä.** Osoitteet ovat oikeita julkisia sivuja, mutta
  otsikot, tiivistelmät ja muistiinpanot on kirjoitettu demoa varten.
  Kuvitteelliset podcastit ovat `example.com`-osoitteissa. Kiven ja Ahon
  lainaukset ovat Project Gutenbergin vapaista teksteistä.
