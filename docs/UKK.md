# Usein kysytyt kysymykset

> **Ihmiselle:** voit kysyä mitä tahansa myös agentilta, joka asentaa
> Lukupinon. Se vastaa näiden ja muiden dokumenttien perusteella omalla
> kielelläsi ja keskeyttää asennuksen siksi aikaa.
>
> **Agentille:** kun käyttäjä kysyy jotain, etsi vastaus ensin täältä, sitten
> linkitetystä dokumentista, sitten koodista. Vastaa lyhyesti ja arkikielellä,
> kerro mistä tieto on, ja palaa sitten siihen vaiheeseen, jossa olitte. Jos
> vastausta ei löydy, sano se äläkä arvaa.

## Yleistä

**Mikä Lukupino on?**
Oma lukupino puhelimeen: tallennat jakovalikosta juttuja, videoita, podcasteja,
kuvia ja PDF:iä, ja Claude tekee niistä yöllä tiivistelmät, litteraatit ja
tutkimukset. → [README](../README.md), [ALOITA-TASTA](ALOITA-TASTA.md)

**Tarvitsenko koodaustaitoja?**
Et. Agentti tekee teknisen osuuden. Sinä luot tilit, täytät yhden
GitHub-lomakkeen agentin antamilla arvoilla ja asennat iPhonen pikakomennon.

**Kauanko asennus kestää?**
Noin tunnin [oletus], josta suurin osa on tilien luomista.

**Toimiiko Androidilla?**
Selain-UI toimii kaikilla laitteilla. Jakovalikon pikakomento on iPhonen
Pikakomennot-sovellukselle; Androidilla vastaava tehdään esim. HTTP Shortcuts
-sovelluksella samoilla päätteillä (`/api/add`, `/api/upload`), mutta sitä ei
ole testattu [oletus]. → [IPHONE.md](IPHONE.md)

**Onko englanninkielistä versiota?**
Ei vielä. Käyttöliittymä on suomeksi. → [STATUS](STATUS.md), avoimet päätökset

## Tilit ja hinnat

**Mitä tilejä tarvitsen?**
GitHub ja Cloudflare (ilmaisia). Clauden liittimeen Claude-tili (ilmainenkin
käy). Automaatioon Claude Pro ja Gemini-avain. → [ALOITA-TASTA](ALOITA-TASTA.md#tilit)

**Paljonko tämä maksaa?**
Tasot 1–2: 0 €. Taso 3: Clauden tilaus ja Gemini käytön mukaan (tunti ääntä
noin 100 000–200 000 syötetokenia). → [INFRA](INFRA.md#rajat-ja-kustannukset)

**Miksi Cloudflare pyytää luottokorttia?**
Vain R2-tallennustila vaatii maksutavan. Lukupino toimii ilman R2:ta:
tiedostot menevät silloin KV:hen (1 Gt). → [INSTALL S3](../INSTALL.md#s3--configure)

**Tarvitsenko Claude Pron?**
Vain automaatioon (aamurutiini, pistokoe) ja asennukseen Claude Codella.
Liitin, jolla Claude lukee pinoasi, toimii ilmaisellakin tilillä.

**Miksi Gemini eikä Claude litteroi?**
Gemini osaa kuunnella ääntä ja katsoa YouTube-videon suoraan osoitteesta.
Worker ei kutsu kumpaakaan; litterointi tehdään rutiinissa.

**Miksi Gemini-avaimen pitää olla maksullinen EU:ssa?**
Geminin ehdot sallivat EU:ssa, Sveitsissä ja Britanniassa vain maksullisen
tason sovelluksille, joita tarjotaan siellä oleville käyttäjille. Ei ole
selvää, koskeeko se omaa käyttöä, joten turvallinen oletus on laskutettu
projekti. → [INFRA](INFRA.md#gemini-eussa)

## Asennus

**Voinko asentaa pelkällä iPhonella?**
Voit: Claude Code toimii selaimessa (claude.ai/code), ja Cloudflare-tunnistus
tehdään API-tokenilla. Tietokoneella on helpompaa. → [INSTALL S2](../INSTALL.md#s2--cloudflare-authentication)

**Mikä on forkki ja miksi tarvitsen sen?**
Oma kopiosi reposta omalla GitHub-tililläsi. Rutiinit lukevat ohjeensa siitä,
ja päivitykset saat painamalla GitHubissa *Sync fork*.

**Pitääkö forkin olla julkinen?**
Ei. Yksityinen on suositeltava, jos käytät viikoittaista vientiä repoon. Koodissa
ei ole salaisuuksia, joten julkinenkin on turvallinen ilman vientiä.

**Mikä on GitHub OAuth App ja miksi se tarvitaan?**
Se antaa Lukupinolle luvan kysyä GitHubilta "kuka tämä on", jotta voit
kirjautua GitHub-tunnuksellasi ilman omaa salasanaa. Siihen tulee kaksi
osoitetta, jotka sivu `/asennus` näyttää. → [INSTALL S7](../INSTALL.md#s7--github-oauth-app-human)

**Mistä näen, onko asennus kunnossa?**
Sivulta `https://<osoitteesi>/asennus`: vihreä on kunnossa, punainen puuttuu,
ja puuttuvan kohdalla on korjauskomento.

**Mistä löydän tokenit myöhemmin?**
Sivulta `/asennus` kirjautuneena (*Näytä* → *Kopioi*). Cloudflaresta niitä ei
voi lukea jälkikäteen.

**Voinko käyttää omaa verkkotunnusta?**
Voit lisätä Workerille oman verkkotunnuksen Cloudflaressa. Lisää silloin uudet
callback-osoitteet GitHub OAuth Appiin ja päivitä pikakomennon ja rutiinien
osoite [oletus, ei testattu].

## iPhone

**Pikakomento sanoo `✗ Tunnistautuminen epäonnistui`.**
Token on väärin. Kopioi `CAPTURE_TOKEN` uudelleen sivulta `/asennus`.
→ [IPHONE vianetsintä](IPHONE.md#vianetsintä)

**Ilmoitus sanoo ✓, mutta mitään ei tallentunut.**
Ilmoituksessa on oma teksti eikä palvelimen `message`-kenttä. → [IPHONE](IPHONE.md#miksi-ilmoitus-luetaan-palvelimelta)

**Kotivalikon Lukupino pyytää kirjautumaan joka kerta.**
Kirjaudu kotivalikosta avatussa Lukupinossa, ei Safarissa: niillä on erilliset
evästeet [oletus]. Kirjautuminen kestää 30 päivää.

**Mitä numerot 0–4 tarkoittavat?**
3 helmi, 2 hyvä, 1 kelpaa, 0 *Perehdy* (lukematta, palaat), 4 *Tutki tämä*
(aamulla tulee tutkimus). → [KAYTTO](KAYTTO.md#tallennus-ja-arviot)

## Claude ja MCP

**Miten saan Clauden lukemaan pinoani?**
Lisää claude.ai:ssa mukautettu liitin osoitteella `https://<osoitteesi>/mcp`.
→ [MCP.md](MCP.md)

**Vaatiiko MCP jotain lisää Cloudflareen?**
Ei. Sama Worker ja sama GitHub OAuth App. Tarvitset vain liittimen ja Claude
Codessa tokenin tai OAuth-kirjautumisen. → [MCP.md](MCP.md#mitä-se-vaatii)

**Liitin yhdistyy, mutta työkaluja ei näy.**
Kirjauduit eri GitHub-tunnuksella kuin `ALLOWED_GITHUB_LOGIN`. → [MCP vianetsintä](MCP.md#vianetsintä)

**Toimiiko ChatGPT:llä tai Cursorilla?**
Lukupino on tavallinen etä-MCP-palvelin (OAuth tai bearer), joten
periaatteessa kyllä, mutta vain Claude on testattu. → [MCP.md](MCP.md#muut-mcp-asiakkaat)

## Rutiinit ja automaatio

**Miksi tiivistelmää ei tullut?**
Tiivistelmät tekee aamurutiini (taso 3). Jos rutiini on asennettu, lue sen
viimeisin vastaus claude.ai/code/routines: **HUOMIO OMISTAJALLE** kertoo syyn.
→ [routines/README.md](../routines/README.md)

**Voinko ajaa rutiinin heti?**
Rutiinin sivulta *Run now*, tai Hyllyn *Käynnistä nyt* -napista, kun se on
kytketty. → [routines/README.md](../routines/README.md#käynnistä-nyt--nappi-valinnainen)

**Miksi joistain videoista ei tule litteraattia?**
Geminin tekijänoikeussuodatin (RECITATION) kieltäytyy osasta. Sitä ei
kierretä; tiivistelmä ja aiheet tulevat silti.

**Miksi X- ja Reddit-linkeistä tulee vain otsikko?**
Ne vaativat kirjautumisen. Rutiini kokeilee julkisia reittejä. → [LAHTEET.md](../skills/lukupino-rikasta/LAHTEET.md)

## Tietoturva ja yksityisyys

**Kuka näkee tallennukseni?**
Vain sinä. Teknisesti Cloudflare (palvelin), Anthropic (kun Claude käsittelee)
ja Google (litteroitava ääni). → [ALOITA-TASTA](ALOITA-TASTA.md#kuka-näkee-mitä)

**Onko turvallista, että koodi on julkinen?**
On: koodissa ei ole salaisuuksia eikä dataa. Ne ovat Cloudflaressa.
→ [SECURITY.md](../SECURITY.md)

**Mitä teen, jos token on vuotanut?**
Kierrätä se ja päivitä pikakomento ja rutiinit. → [SECURITY.md](../SECURITY.md#tokenien-oikeudet)

**Voinko jakaa pikakomentoni kaverille?**
Et omaa: siinä on tokenisi. Kaveri asentaa oman Lukupinon ja tuo pikakomennon
tyhjänä. → [IPHONE](IPHONE.md#nopein-tapa-tuo-valmis-pikakomento)

## Päivitys, varmuuskopio ja poisto

**Miten päivitän?**
GitHubissa *Sync fork* ja agentille: *"Päivitä Lukupino INSTALL.md:n
mukaan."* → [INSTALL](../INSTALL.md#updating-an-existing-install)

**Miten otan varmuuskopion?**
`GET https://<osoitteesi>/api/export` tokenilla antaa kaiken JSONina.

**Miten poistan kaiken?**
→ [INSTALL, Uninstall](../INSTALL.md#uninstall)

## Lisenssi

**Saanko käyttää Lukupinoa työssäni tai myydä sitä?**
Henkilökohtainen käyttö, opiskelu, harrastus ja voittoa tavoittelemattomat ovat
sallittuja. Kaupallinen käyttö vaatii erillisen luvan. → [LICENSE](../LICENSE)
