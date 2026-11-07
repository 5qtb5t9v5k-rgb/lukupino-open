# Turvallisuus

## Haavoittuvuudesta ilmoittaminen

**Älä avaa julkista issueta.** Käytä GitHubin yksityistä ilmoitusta: repon
*Security*-välilehti → *Report a vulnerability*. Kerro mitä, miten toistaa ja
mitä sillä voi tehdä. Kaikki, millä pääsee lukemaan tai kirjoittamaan
lukupinoa ilman omistajan tunnuksia, käsitellään kriittisenä.

## Uhkamalli

Jokainen asennus on yhden ihmisen oma, hänen omalla Cloudflare-tilillään.
Suojattavaa on kaksi asiaa: **lukupinon sisältö** (mitä luet, poiminnat,
muistiinpanot) ja **tokenit**, joilla siihen pääsee.

| Uhka | Suoja | Missä |
|---|---|---|
| Joku internetissä yrittää lukea tai kirjoittaa | Kaikki datareitit vaativat istunnon (GitHub-kirjautuminen, vain `ALLOWED_GITHUB_LOGIN`) tai bearer-tokenin; vertailut vakioaikaisia | `src/ui.ts`, `src/api.ts`, `src/index.ts`, `src/session.ts` |
| Väärennetty istuntoeväste | HMAC-SHA256 avaimella `COOKIE_ENCRYPTION_KEY`; ilman avainta mikään eväste ei kelpaa | `src/session.ts` |
| CSRF OAuth-kulussa | State sidottu sekä KV:hen että selaimen evästeeseen | `src/workers-oauth-utils.ts`, `src/github-handler.ts` |
| Tallennettu HTML/SVG yrittää ajaa skriptiä istunnossasi | `Content-Security-Policy: sandbox` ilman `allow-same-origin`ia; katselusivun iframe `sandbox`; tutkimusten SVG siivotaan, markdown escapetaan | `src/files.ts`, `src/research.ts` |
| Tallennetun sivun teksti yrittää ohjata Claudea (prompt injection) | Rutiinien ja skillien ohjeet: sisältö on dataa, ei ohjeita; automaatio ei koskaan kirjoita arviota, lukutilaa eikä omin sanoin -kenttää; rutiinit eivät commitoi | `routines/`, `skills/`, `AGENTS.md` |
| Token vuotaa (esim. jaettu pikakomento) | Tokenit ovat 64 heksamerkin satunnaisarvoja; `/asennus` varoittaa lyhyistä; kierrätys alla | `src/asennus.ts` |
| Asennuksen tiedot vuotavat julkiseen repoon | Ei salaisuuksia koodissa; `export/` gitignoressa; julkaisun vartija hylkää tunnisteet ja osoitteet | `.gitignore`, ylläpitäjän julkaisuskripti |
| `/asennus` paljastaa liikaa | Kirjautumatta vain pakollisten asetusten olemassaolo (kyllä/ei) ja callback-osoitteet. Arvot vain kirjautuneelle, sumennettuina | `src/asennus.ts` |

<p align="center"><img src="docs/kuvat/asennus-ulos.png" width="260" alt="Kirjautumaton /asennus: vain asetusten olemassaolo ja callback-osoitteet"><br><sub>Tämän kuka tahansa näkee osoitteesta <code>/asennus</code>: ei arvoja, ei dataa.</sub></p>

## Tokenien oikeudet

| Token | Antaa | Missä se on |
|---|---|---|
| `CAPTURE_TOKEN` | **Kaiken `/api/*`:n:** tallennus, päivitys, koko kannan vienti | iPhonen pikakomento, rutiinien ympäristö (`LUKUPINO_CAPTURE_TOKEN`) |
| `MCP_TOKEN` | Kaikki MCP-työkalut: haku, luku, lisäys, muokkaus, poisto | Claude Coden ympäristö (`LUKUPINO_MCP_TOKEN`) |
| claude.ai-liittimen OAuth-token | Samat MCP-työkalut | Anthropicin palvelussa, sinun tililläsi |
| `COOKIE_ENCRYPTION_KEY` | Istuntojen väärentäminen, jos vuotaa | Vain Cloudflaressa |

**Kierrätys** (jos token on voinut vuotaa):

```bash
openssl rand -hex 32 | npx wrangler secret put CAPTURE_TOKEN
```

Päivitä sen jälkeen uusi arvo (kopioi `/asennus`-sivulta) pikakomentoon ja
rutiinien ympäristöön. `MCP_TOKEN` samoin, ja `COOKIE_ENCRYPTION_KEY`:n vaihto
kirjaa kaikki selaimet ulos.

## Asentajan muistilista

- Älä koskaan jaa omaa pikakomentoasi: siinä on tokenisi.
- GitHub OAuth Appissa vain kaksi tarkkaa callback-osoitetta, ei jokerimerkkejä.
- Pidä forkki yksityisenä, jos käytät viikoittaista vientiä (skillin vaihe 4): vienti sisältää koko pinosi.
- Lue rutiinien vastaukset silloin tällöin. **HUOMIO OMISTAJALLE** tarkoittaa, että jokin ei täsmää.

## Auditointi

Ylläpitäjä ajaa ennen jokaista julkaisua Cloudflaren
[security-audit-skillin](https://github.com/cloudflare/security-audit-skill)
(MIT). Se tarkastaa lähdekoodin: useampi agentti metsästää haavoittuvuuksia
koodin luottamusrajoilta, ja jokaisen löydöksen tarkistaa eri agentti kuin sen
löytänyt. Tulos jaetaan vahvistettuihin, tarkistusta odottaviin ja hylättyihin.
Skilli ei koske tuotantoon eikä ulkoisiin palveluihin.

Asentajien ei tarvitse ajaa sitä: jokainen asennus ajaa samaa koodia, joten
yksi tarkastus versiota kohden kattaa kaikki. Oman kopion voi toki tarkastaa.

**Näin ajetaan** (agentti, jossa rinnakkaiset aliagentit, esim. Claude Code):

```bash
npx skills add https://github.com/cloudflare/security-audit-skill --skill security-audit
```

Kehote repon juuressa: *"security audit this codebase, output to
~/security-audit-skill/lukupino"*. Profiilit: `quick` (nopea ensikatsaus),
`standard` (oletus), `deep` (ennen isoa julkaisua). Ajot ovat kumulatiivisia:
toinen ajo jatkaa ensimmäisen kattavuudesta. Raportti kirjoitetaan repon
ulkopuolelle.

**Löydösten käsittely:**

1. Vahvistetut korjataan ennen julkaisua; korjaus kirjataan CHANGELOGiin (ilman hyökkäysohjetta).
2. Tarkistusta odottavat kirjataan yksityisesti ja ratkaistaan seuraavassa ajossa.
3. Raakaraporttia ei julkaista ennen kuin vahvistetut on korjattu. Yhteenveto lisätään alla olevaan taulukkoon.

| Päivä | Commit | Profiili | Vahvistettuja | Korjattu | Huomio |
|---|---|---|---|---|---|
| — | — | — | — | — | Ei vielä ajettu (7.11.2026) |
