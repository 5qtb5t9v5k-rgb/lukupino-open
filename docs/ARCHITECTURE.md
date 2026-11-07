# Arkkitehtuuri

Lukupino on yksi Cloudflare Worker, joka tekee kaiken: tallentaa, näyttää,
kirjautuu ja palvelee Claudea. Raskas työ (tiivistelmät, litteraatit,
tutkimukset, pistokokeet) tehdään Workerin ulkopuolella Claude-rutiineissa,
jotka puhuvat Workerille sen omalla REST-rajapinnalla.

Kaaviot ovat Mermaidia, joten GitHub piirtää ne ja agentti lukee ne tekstinä.

## Kokonaiskuva

```mermaid
flowchart TB
  subgraph Puhelin["📱 iPhone"]
    SH[Pikakomento<br/>jakovalikossa]
    HS[Lukupino<br/>kotivalikossa]
    CA[Claude-sovellus]
  end
  subgraph CF["☁️ Cloudflare (oma tilisi, ilmaistaso)"]
    W[Worker: lukupino<br/>Hono · TypeScript]
    D1[(D1<br/>tallennukset, poiminnat,<br/>litteraatit, tutkimukset,<br/>pistokokeet)]
    KV[(KV<br/>OAuth-tila, välimuistit,<br/>tiedostot ilman R2:ta)]
    R2[(R2 · valinnainen<br/>kuvat, PDF:t)]
    DO[Durable Object<br/>MCP-istunnot]
  end
  subgraph Anth["🤖 Anthropic"]
    CAI[claude.ai-liitin]
    RT[Rutiinit<br/>aamu + sunnuntai]
  end
  GH[GitHub<br/>kirjautuminen]
  GEM[Google Gemini<br/>litterointi]
  WEB[Verkkosivut,<br/>RSS, oEmbed]

  SH -->|/api/add, /api/upload<br/>CAPTURE_TOKEN| W
  HS -->|selain, eväste| W
  CA --> CAI -->|/mcp, OAuth| W
  W --- D1 & KV & R2 & DO
  W -->|OAuth| GH
  W -->|otsikko + kuvaus<br/>tallennettaessa| WEB
  RT -->|/api/*, CAPTURE_TOKEN| W
  RT --> GEM
  RT -->|WebFetch| WEB
```

## Tallennuksen elinkaari

```mermaid
sequenceDiagram
  autonumber
  actor S as Sinä
  participant P as Pikakomento
  participant W as Worker
  participant D as D1
  participant R as Aamurutiini (Claude)
  S->>P: Jaa → valitse arvio
  P->>W: GET /api/add?source=app&rating=3&url=…
  W->>D: luo tallennus (status inbox)
  W-->>P: {"message":"✓ Tallennettu lukupinoon ⭐⭐⭐"}
  Note over W: taustalla, ≤ 10 ms CPU:<br/>otsikko, kuvaus, kansikuva, RSS
  W->>D: status noudettu / ei-noudettavissa
  R->>W: GET /api/export (aamulla)
  R->>R: nouda sisältö, tiivistä,<br/>litteroi (Gemini), tutki
  R->>W: POST /api/update · /api/transcript · /api/research
  W->>D: tiivistelmä, poiminnat, litteraatti
  S->>W: avaa Hyllyn, lukee, korostaa
```

Tila (`status`): `inbox` → `noudettu` tai `ei-noudettavissa` → `kortitettu`
(muistiinpano tai litteraatti valmis). **Tekemätön työ tunnistetaan siitä, että
tiivistelmä puuttuu, ei statuksesta** (ks. `skills/lukupino-rikasta`, vaihe 1).

## Kirjautuminen ja oikeudet

| Kuka | Mihin | Miten |
|---|---|---|
| Sinä selaimessa | `/`, `/ui/*`, `/file/*`, kaikki sivut | GitHub OAuth → HMAC-allekirjoitettu eväste 30 pv (`session.ts`). Vain `ALLOWED_GITHUB_LOGIN` |
| Pikakomento, rutiinit | `/api/*` | `Authorization: Bearer <CAPTURE_TOKEN>` |
| claude.ai ja Claude-sovellus | `/mcp` | OAuth 2.1 (dynaaminen rekisteröinti + PKCE), ylävirtana GitHub, vain sallittu tunnus |
| Claude Code | `/mcp` | `Authorization: Bearer <MCP_TOKEN>` |
| Kuka tahansa | `/healthz`, kuvakkeet, `/asennus` (suppea) | Ei mitään. `/asennus` näyttää kirjautumatta vain pakollisten asetusten olemassaolon ja callback-osoitteet |

```mermaid
flowchart LR
  Q[Pyyntö] --> M{/mcp?}
  M -- Bearer = MCP_TOKEN --> MCP[MCP-työkalut]
  M -- muu --> O[OAuthProvider] -->|token ok, login sallittu| MCP
  Q --> A{/api/*?} -- Bearer = CAPTURE_TOKEN --> API[REST]
  Q --> U{UI-sivu?} -- eväste ok --> UI[Selaus-UI]
  U -- ei evästettä --> L[Kirjautumissivu]
```

**Tokenien voima on sama:** kumpikin bearer-token antaa lukea ja kirjoittaa koko
lukupinoa (myös `/api/export`). Siksi pikakomentoa ei jaeta eteenpäin token
mukana, ja tokenit ovat 64 heksamerkin satunnaisarvoja (`openssl rand -hex 32`).

**Käyttäjien sisältö on epäluotettavaa.** Tallennettu HTML ja SVG tarjoillaan
otsakkeella `Content-Security-Policy: sandbox` ilman `allow-same-origin`ia, ja
katselusivun iframe on `sandbox`-määreellä: skriptit toimivat, mutta eivät pääse
evästeeseen eivätkä `/ui/*`-reitteihin. Tutkimusten SVG siivotaan
(`sanitizeSvg`), markdown escapetaan (`renderMarkdown`).

## Tietomalli

```mermaid
erDiagram
  bookmarks ||--o{ quotes : "poiminnat"
  bookmarks ||--o| transcripts : "litteraatti"
  bookmarks ||--o| research : "tutkimus"
  bookmarks }o--o{ lists : "lists_json"
  quizzes ||--|{ quiz_items : "väitteet"
  quiz_items }o--o| bookmarks : "lähde"
  bookmarks {
    text id PK
    text url
    text title
    text summary "rutiini"
    text excerpt "lähdeteksti ≤ 3000"
    text note "muistiinpano, litteraatin AIHEET + POIMINNAT"
    text status "inbox|noudettu|ei-noudettavissa|kortitettu"
    int rating "0 perehdy, 1–3 tähteä — vain omistaja"
    text media "artikkeli|video|podcast|kirja|some|dokumentti|kuva"
    text progress "lukematta|kesken|luettu — vain omistaja"
    text recall "omin sanoin / kirjamuistio — vain omistaja"
    text files_json "R2/KV-avaimet"
    text research_status "pyydetty|valmis|ei-onnistu"
    int transcript_words "null ei tehty, 0 RECITATION"
  }
  quotes {
    text id PK
    text bookmark_id
    text text
    text kind "lahde|korostus|oma"
    int starred
  }
  transcripts {
    text bookmark_id PK
    text text "[h:mm:ss] Puhuja: teksti"
    int words
  }
  research {
    text bookmark_id PK
    text text "markdown, 1–5 kuvaa"
  }
  quizzes {
    text id PK
    text title
    text feedback "rutiinin palaute"
  }
  quiz_items {
    text quiz_id PK
    int pos PK
    text statement
    int correct
    text explanation
    int answer
    int confident
  }
  lists {
    text name PK
    text icon
  }
```

Täystekstihaku on FTS5-indeksi `bookmarks_fts` (otsikko, kuvaus, ote,
tiivistelmä, muistiinpano). Litteraatti on omassa taulussaan, koska kahden tunnin
jakso on noin 140 000 merkkiä: vienti ja listaus pysyvät kevyinä. Skeema syntyy
vain migraatioista (`migrations/`); odotettu lista on `src/asennus.ts`:ssä.

## Reitit

| Reitti | Mitä | Auth |
|---|---|---|
| `GET /` | Hylly ja kaikki tallennukset | eväste |
| `/lue/<id>` · `/litteraatti/<id>` · `/kirja/<id>` · `/tutkimus/<id>` · `/pistokoe/<id>` · `/poiminnat` · `/viikko` | Lukunäkymä, soitin, kirjamuistio, tutkimus, koe, poiminnat, viikkokooste | eväste |
| `GET/POST /api/add` · `POST /api/upload` | Tallennus pikakomennosta (linkki / tiedostot) | `CAPTURE_TOKEN` |
| `POST /api/update` · `/api/enrich` · `/api/import` · `GET /api/export` · `/api/lists` · `/api/stats` | Rikastus, migraatio, varmuuskopio | `CAPTURE_TOKEN` |
| `/api/transcript` · `/api/research` · `/api/quiz` · `/api/quotes` | Rutiinien kirjoitukset | `CAPTURE_TOKEN` |
| `/mcp` | MCP-työkalut (24) | OAuth tai `MCP_TOKEN` |
| `/authorize` · `/token` · `/register` · `/callback` · `/login` · `/callback/ui` | OAuth | — |
| `/asennus` · `/asennus.json` | Asennuksen itsetarkistus | julkinen suppea / eväste tai `CAPTURE_TOKEN` laaja |
| `/file/<avain>` | Tallennettu tiedosto (HTML ja SVG eristettynä) | eväste tai bearer |
| `/healthz` | `ok` | — |

Täydet päätteet kenttineen: [KAYTTO.md](KAYTTO.md) ja koodi (`src/api.ts`).

## Rajat

Ilmaistaso: 100 000 pyyntöä/pv · **10 ms CPU/pyyntö** · D1 5 Gt ja 5 M rivilukua/pv
· KV 1 000 kirjoitusta/pv ja 1 Gt · R2 10 Gt. Ylitys kaataa pyynnöt klo 00.00 UTC
asti [oletus, Cloudflaren hinnasto]. Yhden ihmisen käyttö (kymmenkunta tallennusta
päivässä) on näistä kaukana.

## Suunnitteluratkaisut ja miksi

| Ratkaisu | Miksi |
|---|---|
| **Yksi käyttäjä per asennus** | Ei käyttäjätauluja eikä tietovuotoja käyttäjien välillä. Jokainen ajaa omaa kopiotaan omalla tilillään, data on hänen. |
| **Worker ei kutsu kielimallia** | 10 ms CPU-raja ja nolla kustannusta. Tekoälytyö tehdään rutiineissa, jotka voi vaihtaa, keskeyttää tai ajaa käsin. |
| **Rutiinit REST:llä, ei MCP:llä** | Ajastettu istunto ei saa MCP-yhteyksiä (todettu 16.9.2026). REST toimii kaikkialla curlilla. |
| **Logiikka repossa, kehote ohut** | `routines/*.md` ja `skills/` ovat versionhallinnassa ja muuttuvat koodin mukana; claude.ai:n kehote on viiden rivin käynnistin. |
| **Ei tageja, vähän listoja** | Edellisessä työkalussa 300 tagia, joista 241 kertakäyttöisiä. Listat ovat aiheita, joita rutiini ei saa lisätä. |
| **`url` viimeisenä parametrina** | Pikakomento liittää osoitteen sellaisenaan; `&`-merkkiset osoitteet eivät katkea eikä koodausta tarvita. |
| **Palvelin kirjoittaa ilmoitustekstin** | iOS Pikakomennot ei tulkitse HTTP-virheitä virheiksi. `message`-kenttä ei voi valehdella onnistumista. |
| **Arvio 0 = Perehdy** | "Palaa tähän" on päätös, ei laatu; se ei saa sekoittua arvioimattomiin. |
| **Litteraatti tehdään kerran** | Ensin koko litteraatti, sitten tiivistelmä tekstistä: video tai ääni luetaan vain kerran, ja hinta putoaa murto-osaan. |
| **Gemini RECITATION ei kierretä** | Tekijänoikeussuodattimen kiertäminen ei kuulu tähän työkaluun. Tiivistelmä ja aiheet riittävät. |
| **`/asennus` ja `/asennus.json`** | Asennuksen virheet ovat kirjoitusvirheitä. Sivu näyttää asennuksen omat tarkat osoitteet ja kertoo agentille koneluettavasti, mikä puuttuu. |
