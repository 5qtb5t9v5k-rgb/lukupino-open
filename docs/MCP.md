# MCP: Claude (ja muut tekoälyt) lukupinoosi

MCP (*Model Context Protocol*) on tapa, jolla tekoälyavustaja pääsee käsiksi
toiseen palveluun. Kun Lukupino on kytketty, voit kysyä Claudelta esimerkiksi:

- *"Mitä tallensin tekoälystä tällä viikolla?"*
- *"Etsi lukupinosta se podcast, jossa puhuttiin päätöksenteosta, ja kerro mitä siinä sanottiin 40 minuutin kohdalla."*
- *"Tee tästä keskustelusta yhteenveto ja liitä se lukupinoon."*
- *"Tee minulle pistokoe Claude Codesta."*

## Mitä se vaatii

**Ei mitään uutta Cloudflareen.** MCP on sama Worker samassa osoitteessa
(`https://<osoitteesi>/mcp`), ja kirjautuminen käyttää samaa GitHub OAuth
Appia kuin selainkin. Jos pystyt kirjautumaan Lukupinoon selaimella, MCP:n
palvelinpuoli on jo valmis.

| Tarvitset | Miksi | Missä se tehdään |
|---|---|---|
| Asennettu Lukupino (taso 1) | Palvelin | [INSTALL.md](../INSTALL.md) |
| GitHub OAuth Appissa callback `https://<osoitteesi>/callback` | claude.ai:n kirjautuminen | Tehty asennuksessa (S7). Sivu `/asennus` näyttää osoitteen |
| `ALLOWED_GITHUB_LOGIN` = oma GitHub-tunnuksesi | Vain sinä saat työkalut | Tehty asennuksessa (S6) |
| Claude-tili | Asiakas | claude.ai. Ilmaisella tilillä voi olla **yksi** mukautettu liitin |
| *(vain Claude Code)* `MCP_TOKEN` tai OAuth | Komentorivi | Alla |

## claude.ai, Claude-sovellus (iPhone, Android) ja Claude Desktop

Liitin lisätään kerran claude.ai:ssa, ja se näkyy kaikissa Claude-sovelluksissa
samalla tilillä.

1. Avaa [claude.ai](https://claude.ai) → **Asetukset** (tai *Customize*) →
   **Liittimet** *(Connectors)* → **Lisää mukautettu liitin** *(Add custom connector)*.
2. Nimi: `Lukupino`. URL: `https://<osoitteesi>/mcp` (kopioi sivulta `/asennus`).
3. **Yhdistä** → GitHub kysyy lupaa → hyväksy **samalla GitHub-tunnuksella**,
   joka on `ALLOWED_GITHUB_LOGIN`.
4. Keskustelussa: liittimet-valikosta (➕ tai 🔧) varmista, että Lukupino on päällä.

**Tarkista:** kysy *"Hae lukupinosta uusimmat tallennukset."* Clauden pitää
käyttää työkalua `search-bookmarks` ja luetella tallennuksiasi.

Team- ja Enterprise-tileillä organisaation ylläpitäjän pitää sallia
mukautetut liittimet. Liitin vaatii, että Lukupino on julkisessa
internetissä (Anthropicin palvelimet ottavat siihen yhteyden), mikä
`workers.dev`-osoitteella toteutuu.

## Claude Code (komentorivi)

Kaksi tapaa. **Token** on yksinkertaisin; **OAuth** ei vaadi tokenia
koneelle.

### Token

1. Kopioi `LUKUPINO_MCP_TOKEN` sivulta `/asennus` (kirjautuneena, *Näytä* → *Kopioi*).
2. Aseta se ympäristömuuttujaksi koneelle, jolla Claude Code ajaa (esim.
   `~/.zshrc`: `export LUKUPINO_MCP_TOKEN=…`). Pilvisessiossa
   (claude.ai/code) ympäristön muuttujiin.
3. Lisää palvelin:

   ```bash
   claude mcp add --transport http lukupino https://<osoitteesi>/mcp \
     --header "Authorization: Bearer $LUKUPINO_MCP_TOKEN"
   ```

   Komentotulkki sijoittaa tokenin komentoon, ja se tallentuu koneesi Claude
   Code -asetuksiin (oletuslaajuus *local*), ei repoon. Älä käytä tässä
   `--scope project`ia: se kirjoittaisi tokenin `.mcp.json`:iin.

   tai projektin `.mcp.json` (valmis rivi sivulla `/asennus`):

   ```json
   { "mcpServers": { "lukupino": { "type": "http", "url": "https://<osoitteesi>/mcp",
     "headers": { "Authorization": "Bearer ${LUKUPINO_MCP_TOKEN}" } } } }
   ```

### OAuth

```bash
claude mcp add --transport http lukupino https://<osoitteesi>/mcp
```

Aja sitten Claude Codessa `/mcp` → *lukupino* → *Authenticate*. Selain avaa
GitHub-kirjautumisen kuten claude.ai:ssa.

**Tarkista:** `claude mcp list` näyttää `lukupino` ✓, ja kysymys *"montako
tallennusta lukupinossa on?"* käyttää työkalua `get-stats`.

## Muut MCP-asiakkaat

Lukupino on tavallinen etä-MCP-palvelin (*streamable HTTP*), jossa on OAuth 2.1
(dynaaminen asiakasrekisteröinti ja PKCE) ja vaihtoehtoisesti bearer-token.
Asiakkaat, jotka tukevat jompaakumpaa, toimivat periaatteessa samoilla
tiedoilla: URL `https://<osoitteesi>/mcp`, ja joko OAuth (GitHub-kirjautuminen)
tai otsake `Authorization: Bearer <MCP_TOKEN>`. Näitä ei ole testattu muilla
kuin Claudella [oletus].

## Ajastetut rutiinit eivät käytä MCP:tä

Claude Coden ajastettu istunto ei saa MCP-yhteyksiä (todettu 16.9.2026), joten
rutiinit käyttävät REST-rajapintaa (`LUKUPINO_URL` + `LUKUPINO_CAPTURE_TOKEN`).
Tämä ei vaadi sinulta mitään: [routines/README.md](../routines/README.md).

## Työkalut

24 työkalua. Täysi kuvaus: [KAYTTO.md](KAYTTO.md#mcp-työkalut).

| Ryhmä | Työkalut |
|---|---|
| Haku ja luku | `search-bookmarks`, `get-bookmark`, `get-bookmark-content`, `get-transcript`, `search-quotes`, `get-research`, `get-stats` |
| Lisäys | `create-bookmark`, `add-book`, `add-note`, `add-quote`, `attach-file` |
| Muokkaus | `update-bookmark`, `delete-bookmark` |
| Listat | `get-lists`, `get-list-bookmarks`, `add-bookmark-to-list`, `remove-bookmark-from-list` |
| Tutkimus | `request-research`, `save-research` |
| Pistokoe | `list-quizzes`, `get-quiz`, `create-quiz`, `save-quiz-feedback` |

`search-bookmarks` ymmärtää rajaukset `after: before: list: status: rating:
media: progress: has:note has:transcript research:` (esim. `rating:3
media:podcast after:2026-10-01`).

## Vianetsintä

| Oire | Syy | Korjaus |
|---|---|---|
| GitHub: *The redirect_uri is not associated with this application* | OAuth Appista puuttuu `…/callback` | Lisää se täsmälleen (`/asennus` näyttää) |
| `Ei pääsyä: <tunnus>` kirjautuessa | Kirjauduit eri GitHub-tunnuksella kuin `ALLOWED_GITHUB_LOGIN` | Kirjaudu GitHubista ulos ja oikealla tunnuksella sisään, tai korjaa salaisuus |
| Liitin yhdistyy, mutta työkaluja ei ole | Sama: väärä tunnus. Palvelin antaa tyhjän työkalulistan kaikille muille | Poista liitin ja lisää uudelleen oikealla tunnuksella |
| Claude Code: 401 | `LUKUPINO_MCP_TOKEN` puuttuu tai on väärä | `echo ${#LUKUPINO_MCP_TOKEN}` → 64; kopioi uudelleen `/asennus`-sivulta |
| Ilmaistili ei salli toista liitintä | Free-tasolla yksi mukautettu liitin | Poista toinen tai siirry maksulliseen |
| Paikallisesti (`wrangler dev`) työkaluja ei näy | Tunnettu rajoitus: Durable Object ei saa propseja paikallisesti | Testaa julkaistua asennusta |

## Oikeuksien peruminen

- **claude.ai:** poista liitin asetuksista. Liittimen token antaa samat
  oikeudet kuin `MCP_TOKEN`: kaiken lukemisen ja muokkaamisen.
- **Claude Code (token):** kierrätä `MCP_TOKEN` ([SECURITY.md](../SECURITY.md#tokenien-oikeudet)).
- **Kaikki OAuth-yhteydet kerralla:** OAuth-tila on KV:ssä `OAUTH_KV`. Sen
  tyhjentäminen katkaisee jokaisen liittimen; ne yhdistetään uudelleen
  kirjautumalla [oletus, `@cloudflare/workers-oauth-provider`].
