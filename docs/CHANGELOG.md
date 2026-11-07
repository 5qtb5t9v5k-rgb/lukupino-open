# Muutosloki

Uusin ylimpänä. Jokainen rivi: päivä, mitä muuttui ja *miksi sillä oli väliä*.
**Toimenpide:** tarkoittaa käsin tehtävää vaihetta olemassa olevalle
asennukselle (päivitysohje: [INSTALL.md](../INSTALL.md#updating-an-existing-install)).

Koottu git-historiasta 7.11.2026. Lukupino syntyi syyskuussa 2026 korvaamaan
Karakeepin; tämä loki alkaa 20.9.2026, ja pystytys (4.–19.9.) on kirjaamatta.
Päivät ovat commit-päiviä.

## Marraskuu 2026

- **7.11.** **Turvallisuusauditointi ja korjaukset.** Cloudflaren security-audit-skill (`quick`, vain lähdekoodi) löysi kuusi epäilyä; yksikään ei vahvistunut ilman ajoympäristöä, mutta kaikki korjattiin: tutkimusten SVG näytetään kuvana ja tutkimussivuilla on CSP, Mermaid 10.9.5 eheystarkisteella, rutiineille rajattu `ROUTINE_TOKEN`, litterointiskriptit ottavat vain tunnuksen (`GET /api/bookmark/:id`), litteraatin linkki escapetaan, OAuth tarkistaa asiakkaan ennen KV-kirjoitusta, `/asennus` näyttää tokenit vain 15 minuuttia kirjautumisesta, `/file` aina `nosniff` ja osoitteet vain http(s). *Miksi:* repo on julkinen, ja vieraiden sivujen sisältö kulkee mallin kautta kirjautuneeseen sivuun ja tokenia pitävään rutiiniin. Yhteenveto: [SECURITY.md](../SECURITY.md#auditointi).
  - **Toimenpide:** `openssl rand -hex 32 | npx wrangler secret put ROUTINE_TOKEN`, ja rutiinien ympäristön `LUKUPINO_CAPTURE_TOKEN` sen arvoksi (`/asennus` näyttää). Rutiinien kehotteiksi `routines/README.md`:n käynnistimet, jotta litterointi käyttää tunnuksia.
- **7.11.** **Jaettava versio: kuka tahansa voi asentaa oman Lukupinon.** Koodista poistettiin kovakoodattu asennusosoite (MCP:n linkit tulevat pyynnöstä), skillit ja skriptit lukevat osoitteen ja avaimet `LUKUPINO_`-alkuisista ympäristömuuttujista, lähteiden säännöt tuotiin repoon (`skills/lukupino-rikasta/LAHTEET.md`), rutiinien logiikka siirtyi tiedostoihin `routines/aamu.md` ja `routines/pistokoe.md`, ja `wrangler.jsonc` toimii ilman asennuskohtaisia tunnisteita. Lisenssiksi PolyForm Noncommercial 1.0.0. *Miksi:* kaveri halusi oman lukupinon, ja asennuksen pitää onnistua kenelle tahansa agentin avulla ilman, että mikään osoittaa toisen asennukseen.
  - **Toimenpide:** rutiinien ympäristöön `LUKUPINO_URL` (asennuksen osoite) ja `LUKUPINO_GEMINI_KEY` (Gemini-avain; vanhat nimet eivät enää toimi), valinnaisesti `LUKUPINO_GEMINI_FREE_KEY`. Rutiinien kehotteiksi `routines/README.md`:n käynnistimet.
- **7.11.** **`/asennus` ja `/asennus.json`:** asennuksen itsetarkistus. Kirjautumatta se näyttää pakollisten asetusten olemassaolon ja asennuksen omat callback-osoitteet, kirjautuneena myös migraatiot, tiedostovaraston, valinnaiset asetukset ja tokenit kopioitaviksi. *Miksi:* asennusvirheet ovat kirjoitusvirheitä, ja agentti voi nyt tarkistaa asennuksen koneluettavasti.
- **7.11.** Dokumentaatio uusiksi: README etusivuksi, `docs/ALOITA-TASTA.md` nollasta, `INSTALL.md` ja `AGENTS.md` agenteille, `docs/ARCHITECTURE.md`, `docs/KAYTTO.md`, `docs/IPHONE.md`, `SECURITY.md`, kuvakaappaukset demodatalla. *Miksi:* ihminen tarvitsee kuvia ja selkeyttä, agentti tarkistettavia vaiheita.
- **7.11.** `docs/MCP.md` (Claude-liitin, Claude Code tokenilla tai OAuthilla, muut asiakkaat, vianetsintä, oikeuksien peruminen), `docs/UKK.md` ja skilli `lukupino-apu`, jolla agentti vastaa käyttäjän kysymyksiin kesken asennuksen ja kysyy, kun on epävarma. *Miksi:* MCP:n käyttöönotto oli vain yksi rivi, ja käyttäjä kysyy agentilta kaiken; vastausten pitää tulla dokumenteista eikä arvauksista.
- **7.11.** `LAHTEET.md`:hen testatut pelastusreitit (X:n syndication-rajapinta 17/20, Redditin RSS 6/6, Substackin kommenttirajapinta 5/5) ja podcastien kolme mitattua ansaa. *Miksi:* jaetussa versiossa reittien pitää olla repossa, ei ylläpitäjän muissa tiedostoissa.
- **7.11.** Kortin aktiiviset tähdet piirtyivät keltaisina neliöinä, koska arviopaneelin tyyli osui myös korttiin; tyyli rajattiin arviopaneeliin. *Miksi:* löytyi dokumentaation kuvakaappauksista, ja tähdet ovat kortin tärkein kontrolli.
- **7.11.** Istuntoeväste hylätään, jos `COOKIE_ENCRYPTION_KEY` puuttuu; CI tarkistaa tyypit ja kovakoodatut osoitteet. `schema.sql` poistettiin (vanhentunut; skeema syntyy vain migraatioista). *Miksi:* puuttuva asetus ei saa koskaan avata ovea, ja yksi totuus skeemasta riittää.
- **7.11.** Skillit `lukupino-rikasta`, `lukupino-tutki`, `lukupino-pistokoe` ja `litteroi` siirrettiin tähän repoon (`skills/`, sessiossa `.claude/skills`). *Miksi:* ne muuttuvat Workerin rajapinnan mukana, joten muutos on yksi PR kahden sijaan.
- **7.11.** Lukupino siirrettiin omaksi repokseen ylläpitäjän yleisestä reposta. *Miksi:* Lukupinon voi julkaista ja kehittää erikseen.
- **7.11.** README:hen suunnitelma podcast-merkistä: pieni ele kuunnellessa tallentaa Spotifyssa soivan jakson kohdan. *Miksi:* lainauksen voi poimia litteraatista myöhemmin keskeyttämättä kuuntelua. Ei vielä koodia.
- **1.11.** Tutkimuksiin 1–5 kuvaa (SVG ja Mermaid), värit sivun paletista. *Miksi:* rakenteet ja suhteet selittyvät kuvalla paremmin kuin tekstillä, ja kuva toimii myös jaettavassa PDF:ssä.

## Lokakuu 2026

- **27.10.** *Kysy Claudelta* -nappi korttiin ja lukusivuille. *Miksi:* tallennuksesta pääsee keskustelemaan yhdellä napautuksella, ja Claude hakee koko sisällön MCP:llä.
- **22.10.** *Viikko mediassa* (`/viikko`), Wrapped-tyylinen viikkokooste. *Miksi:* viikon kulutus näkyy yhdellä silmäyksellä ilman mallikutsuja.
- **22.10.** *Käynnistä nyt* -nappi tutkimuksille ja leveämpi työpöytänäkymä. *Miksi:* tutkimusta ei tarvitse odottaa aamuun, ja työkoneella näkyy enemmän kerralla.
- **21.10.** Pistokoe MCP:hen (`list-quizzes`, `get-quiz`, `create-quiz`, `save-quiz-feedback`). *Miksi:* kokeen voi tehdä ja lukea suoraan keskustelusta.
- **21.10.** Lähtötasotesti osa-alueittain dokumentaatiolähteillä (migraatio 0014). *Miksi:* fokusoitu oppimispolku (ensimmäisenä Claude Code) alkaa siitä, mitä jo osaa.
- **21.10.** Kesken-tila kaikille medioille; Luettavaa avaa kortin alapaneeliin; Omin sanoin -kenttä pois korteista. *Miksi:* kesken oleva video tai jakso löytyy taas, hyllyltä ei tarvitse rullata listaan, ja omistaja käyttää kentän sijaan poimintoja.
- **20.10.** Viikon pistokoe ja Oppimispolku pinoon (migraatio 0013). *Miksi:* omistaja halusi palautetta siitä, mitä luetusta jäi mieleen; muistista palauttaminen kiinnittää luetun.
- **20.10.** Tutkimus numerolla 4 (migraatio 0012), jaettava PDF ilman omia viittauksia ja Tutkimukset-hylly kolmeen riviin. *Miksi:* tallennuksesta saa syvennyksen pyytämällä, sen voi jakaa muille, eikä hylly vie koko etusivua.
- **20.10.** iOS-pikakomennon ohje yhdeksi: arvionapit sekä kuva- ja PDF-haara. *Miksi:* kaksi erillistä ohjetta johti keskeneräiseen oikopolkuun.
- **17.10.** Hylly etusivuksi, Soitin litteraattiin, mediatyyppi ja lukutila (migraatiot 0010–0011). *Miksi:* etusivu näyttää, mitä on kesken ja mitä kannattaa kuunnella, ja litteraattia voi seurata toiston mukana.
- **17.10.** Lukunäkymä `/lue/<id>` ja Kirjamuistio `/kirja/<id>`; tallennuspäivän korjaus. *Miksi:* jutun tekstiä voi korostaa kuten litteraattia, kirjoille on oma laajempi muistio, ja jälkikäteen lisätyt kirjat saa oikeaan kuukauteen.
- **17.10.** MCP: `get-transcript`, `search-quotes`, `add-note`, `add-quote`, `attach-file` (HTML ja SVG eristettynä). *Miksi:* tavallinen claude.ai pääsee litteraatteihin ja poimintoihin, ja artefaktin voi liittää tallennukseen ilman että sen skripti pääsee istuntoon. Liitin kytkettiin claude.ai:hin samana päivänä.
- **10.10.** Logo "Pino, tumma" kotivalikko- ja välilehtikuvakkeeksi. *Miksi:* Lukupino erottuu puhelimen kotinäytöllä.
- **8.10.** Yksi oikopolku linkeille ja tiedostoille; `/api/add` neuvoo, jos kuva jaetaan linkkioikopolulla. *Miksi:* lokista nähtiin, että kuva lähti linkkioikopolulla tyhjänä.
- **6.10.** Suodatinrivi rivittyy työkoneella. *Miksi:* piilotettu vaakavieritys ei toiminut hiirellä, ja osa listoista jäi näkymättä.
- **5.10.** Koko litteraatti luettavaksi ja korostettavaksi (migraatio 0009); RECITATION pysyväksi tilaksi. *Miksi:* sanatarkka teksti aikaleimoineen on haettavissa ja poimittavissa; Geminin kieltäytymistä ei yritetä turhaan uudelleen.
- **5.10.** Arvio 0 = Perehdy; kirjan sivun kuvasta keskeiset nostot. *Miksi:* "palaa tähän" on päätös eikä laatu, ja tilastot erottavat sen nyt arvioimattomista.
- **4.10.** Poiminnat: lainauskokoelma ja "mitä jäi mieleen" (migraatio 0008), takautuvasti 279 lainausta 66 lähteestä. *Miksi:* litteraattien lainaukset olivat hajallaan korttien sisällä.

## Syyskuu 2026

- **24.9.** Tiedoston katselusivu paluupalkilla, PDF-oikopolku jakovalikosta `/api/upload`:iin ja osoitekentän `type=url`-esto poistettu. *Miksi:* kotivalikkotilassa avattu PDF jäi ruudulle ilman tietä takaisin, Safari jakaa PDF:n tiedostona, ja selaimen oma tarkistus esti lähetyksen hiljaa.
- **22.9.** Toinen oikopolku leikepöydältä. *Miksi:* jakovalikko ei aina tarjoa PDF:ää.
- **20.9.** `/api/update` hyväksyy `note`- ja `mediaUrl`-kentät. *Miksi:* pääte ohitti ne hiljaa ja neljän ensimmäisen litteraatin aiheet ja poiminnat katosivat.
- **20.9.** Litterointi Geminillä ja `media_url` (migraatio 0007). *Miksi:* jakso löytyy sanoilla, jotka siinä sanottiin, ei pelkällä otsikolla.
- **20.9.** R2 käyttöön, monta tiedostoa yhdeksi tallennukseksi (migraatio 0006), linkitetty dokumentti noudetaan talteen. *Miksi:* 10 Gt ilmaiseksi KV:n 1 Gt:n sijaan, kuusi kuvaa on yksi nosto, ja PDF-linkki näytti ennen rikkinäiseltä. Samalla korjattiin MCP:n poisto, joka jätti tavut orvoiksi.
- **20.9.** Oppimiskerros: Omin sanoin (migraatio 0005), kortin vertailu ja konseptikansio. Tämän repon ensimmäinen commit, joka sisältää koko siihenastisen koodipohjan. *Miksi:* muistaminen syntyy siitä, että lukija kirjoittaa itse katsomatta.
