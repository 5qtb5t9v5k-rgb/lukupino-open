# Lukupino — tila

**Päivitetty 7.11.2026.** Lukupino toimii ylläpitäjän tuotantoasennuksessa, ja jaettava versio on julkaistu julkisena repona (`lukupino-open`). Ensimmäinen turvallisuusauditointi on ajettu ja sen löydökset korjattu; kuivaharjoitus uudella tilillä puuttuu vielä.

Merkinnät: **[mitattu pvm]** = tarkistettu itse tuona päivänä (komento, kysely tai koodi). **[oletus]** = päätelty dokumentista tai commit-viestistä, ei tarkistettu.

## Alueittain

| Alue | Tila | Huomio |
|---|---|---|
| Ominaisuudet (tallennus, Hylly, litteraatit, poiminnat, tutkimus, pistokoe, viikko, MCP) | ✅ | Käytössä ylläpitäjän asennuksessa syyskuusta 2026 [oletus, CHANGELOG]. 24 MCP-työkalua [mitattu 7.11.2026, `server.tool`-kutsut `src/mcp.ts`:ssä; aiempi luku 25 oli väärin] |
| Tyyppitarkistus | ✅ | `npm ci --legacy-peer-deps` ja `npx tsc --noEmit` ilman virheitä [mitattu 7.11.2026] |
| Yleistys jaettavaksi | ✅ | Koodissa ei kovakoodattua asennusosoitetta: MCP:n linkit tulevat pyynnöstä, skillit ja skriptit lukevat `LUKUPINO_URL`in [mitattu 7.11.2026, git grep] |
| `/asennus` ja `/asennus.json` | 🟡 | Toimii paikallisesti: kirjautumatta suppea, tokenilla tai istunnolla laaja, varoittaa lyhyistä tokeneista [mitattu 7.11.2026, wrangler dev]. Tuotannossa ei vielä julkaistu [oletus] |
| Asennus agentilla (`INSTALL.md`) | 🟡 | Kirjoitettu 16 vaiheeseen; ei vielä ajettu läpi uudella Cloudflare- ja GitHub-tilillä [mitattu 7.11.2026] |
| Resurssien automaattinen luonti | 🟡 | Julkisessa `wrangler.jsonc`:ssä ei tunnisteita; `wrangler deploy` (≥ 4.45) luo D1:n ja KV:n Cloudflaren ohjeen mukaan [oletus, ei testattu] |
| iPhone-pikakomento iCloud-linkkinä | ❌ | Rakennusohje on (`docs/IPHONE.md`), jaettavaa linkkiä tuontikysymyksillä ei vielä ole |
| Rutiinit | ✅ | Logiikka repossa (`routines/aamu.md`, `routines/pistokoe.md`), kehotteet ohuita käynnistimiä [mitattu 7.11.2026] |
| Kuvakaappaukset | ✅ | 14 kuvaa `docs/kuvat/`-kansiossa kuvitteellisella demodatalla; toistettavissa `scripts/kuvakaappaukset/` [mitattu 7.11.2026] |
| Käyttöliittymän pikkuviat | 🟡 | Kuvatessa löytyi 8, joista kortin tähtien tyyli korjattu. Jäljellä [mitattu 7.11.2026]: hyllyrivi napsahtaa reunaan (`scroll-padding` puuttuu); pistokoebannerilla ei sivumarginaalia alle 1000 px; pitkä kirjan nimi katkeaa selässä ilman tavutusta; `/lue` näyttää lähdetekstin yhtenä kappaleena (`Db.clip()` litistää rivinvaihdot); `/pistokoe`n *Kaikki kokeet* -linkki leikkautuu 390 px:n puhelimessa; "1 poimintaa"; `/viikko` näyttää osittain vastatun kokeen "ei tehty" |
| CI | 🟡 | GitHub Actions ajaa `tsc`:n ja julkaisun tunnistevartijan jokaisessa PR:ssä; ensimmäistä ajoa ei vielä nähty [oletus] |
| Julkinen repo | ✅ | `5qtb5t9v5k-rgb/lukupino-open`, julkinen, ensimmäinen versio pushattu 7.11.2026 yhtenä committina ilman historiaa [mitattu 7.11.2026] |
| Testit | ❌ | Ei yksikkö- eikä integraatiotestejä; MCP testataan vain tuotannossa |
| Turvallisuusauditointi | 🟡 | Ajettu 7.11.2026 (`quick`, vain lähdekoodi): 0 vahvistettua, 6 epäilyä, kaikki korjattu tai lievennetty [mitattu 7.11.2026, `SECURITY.md`]. Korjaukset testattu paikallisesti selaimella ja curlilla [mitattu 7.11.2026] |
| Podcast-merkki (`/api/merkki`) | ❌ | Vain suunnitelma (`docs/KAYTTO.md`, *Suunnitteilla*) |

## Seuraavaksi

1. **Kuivaharjoitus:** asenna uudelle Cloudflare- ja GitHub-tilille pelkän `INSTALL.md`:n varassa (agentti tekee, ihminen seuraa). Kirjaa jokainen kohta, jossa jäätiin jumiin, ja korjaa ohje.
2. **Toinen auditointi** profiililla `standard` ja epäilyjen tarkistus eristetyssä selain- ja ajoympäristössä (`SECURITY.md`).
3. **Jaettava pikakomento** iCloud-linkiksi tuontikysymyksillä; linkki `docs/IPHONE.md`:hen.
4. **Yksityinen haavoittuvuusilmoitus** päälle julkisen repon asetuksista (`SECURITY.md` ohjaa sinne).
5. **Podcast-merkki**, kun joku haluaa sen ja hänellä on Spotify Premium.

## Avoimet päätökset

1. **Deploy to Cloudflare -nappi:** se loisi resurssit ja kysyisi salaisuudet ilman terminaalia, mutta vaatii julkisen repon ja testin. Lisätäänkö?
2. **Testit:** riittääkö `tsc` ja `/asennus.json`, vai tehdäänkö savutesti (esim. `wrangler dev` + curl) CI:hin?
3. **Kieli:** käyttöliittymä on vain suomeksi. Tarvitaanko englanti, jos käyttäjiä tulee muualta?
4. **`migrate-from-karakeep.py`** on juuressa. Siirretäänkö `scripts/`-kansioon?

## Dokumenttikartta

| Dokumentti | Mitä kertoo |
|---|---|
| [README.md](../README.md) | Etusivu: mitä Lukupino tekee, asennuslause agentille, tasot, dokumentaation hakemisto |
| [docs/ALOITA-TASTA.md](ALOITA-TASTA.md) | Nollasta: sanasto, tilit, laitteet, tasot, kustannukset, kuka näkee mitä |
| [INSTALL.md](../INSTALL.md) | Agentin asennus-, päivitys- ja poisto-ohje |
| [docs/IPHONE.md](IPHONE.md) | Pikakomento, kotivalikko, testaus, vianetsintä |
| [docs/MCP.md](MCP.md) | Claude-liitin, Claude Code ja muut MCP-asiakkaat |
| [docs/UKK.md](UKK.md) | Usein kysytyt kysymykset (agentti vastaa näistä, skilli `lukupino-apu`) |
| [docs/KAYTTO.md](KAYTTO.md) | Ominaisuudet käyttöohjeineen ja päätteineen |
| [routines/README.md](../routines/README.md) | Rutiinien luonti, ympäristömuuttujat, Käynnistä nyt |
| [AGENTS.md](../AGENTS.md) | Jatkokehitys agenteille: kartta, invariantit, reseptit, dokumentaatiosäännöt |
| [CLAUDE.md](../CLAUDE.md) | Claude Code -kohtaiset huomiot |
| [docs/ARCHITECTURE.md](ARCHITECTURE.md) | Rakenne, tiedonkulku, oikeudet, tietomalli, ratkaisut |
| [docs/STATUS.md](STATUS.md) | Tämä: tila, seuraavat askeleet, avoimet päätökset |
| [docs/INFRA.md](INFRA.md) | Palvelut, nimet, rajat, kustannukset |
| [docs/CHANGELOG.md](CHANGELOG.md) | Muutokset ja miksi niillä oli väliä |
| [SECURITY.md](../SECURITY.md) | Uhkamalli, tokenit, auditointi, ilmoittaminen |
| [skills/](../skills/) | Clauden skillit; lähteiden säännöt `skills/lukupino-rikasta/LAHTEET.md` |
| [migrations/](../migrations/) | D1-skeeman muutokset 0001–0014 |
| [scripts/kuvakaappaukset/](../scripts/kuvakaappaukset/) | Demodata ja kuvakaappausten toisto |
