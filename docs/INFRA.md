# Lukupino — infra

Mitä palveluita yksi Lukupino-asennus käyttää, millä nimillä, mitä ne maksavat
ja mitä hajoaa, jos jokin katoaa. **Tässä on vain nimiä, ei koskaan arvoja.**
Arvot ovat Cloudflaressa (`npx wrangler secret put <NIMI>` tai hallintapaneeli:
Workers & Pages → `lukupino` → Settings → Variables and Secrets), rutiinien
ympäristössä claude.ai:ssa ja paikallisesti gitignoroidussa `.dev.vars`-tiedostossa.

Koottu koodista 7.11.2026 (`wrangler.jsonc`, `worker-configuration.d.ts`,
`src/`). Merkinnät kuten [STATUS.md](STATUS.md):ssä.

## Palvelut

| Palvelu | Mihin | Tunniste koodissa | Jos katoaa |
|---|---|---|---|
| Cloudflare Workers | Koko sovellus: UI, `/api/*`, `/mcp`, OAuth, `/asennus` | Worker `lukupino` | Kaikki lakkaa toimimasta |
| Cloudflare D1 | Kaikki data: tallennukset, listat, poiminnat, litteraatit, tutkimukset, pistokokeet | binding `DB`, migraatiot `migrations/` | Kaikki data. Varmuuskopio: `GET /api/export` |
| Cloudflare KV | OAuth-tila; välimuistit (Spotify-tunnus, podcast-syötteet 30 pv, *Käynnistä nyt* -tila) | binding `OAUTH_KV` | Kirjautuminen ja claude.ai-liitin; välimuistit rakentuvat uudelleen |
| Cloudflare KV | Tiedostot, kun R2:ta ei ole | binding `FILES` | Tiedostot (jos R2 puuttuu) |
| Cloudflare R2 *(valinnainen)* | Tiedostot (kuvat, PDF:t), 20 Mt/tiedosto | binding `FILES_R2`, ämpäri `lukupino-files` | Tiedostot; uudet menevät KV:hen |
| Cloudflare Durable Objects | MCP-istunnot | binding `MCP_OBJECT`, luokka `LukupinoMCP` | Claude-liitin ja Claude Code |
| GitHub OAuth App | Kirjautuminen UI:hin ja claude.ai-liittimeen | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`; callbackit `/callback`, `/callback/ui` | Kirjautuminen; bearer-polut (`/api/*`, Claude Code) toimivat |
| Anthropic: Claude Code -rutiinit | Rikastus, litteraatit, tutkimukset, pistokokeet | `routines/`, `skills/` | Automaatio; tallennus ja selaus toimivat |
| Anthropic: rutiinin API-laukaisin | *Käynnistä nyt* -nappi | `PURKU_ROUTINE`, `PURKU_TOKEN` | Nappi piiloutuu |
| Google Gemini API | Litterointi (rutiinissa, ei Workerissa) | `LUKUPINO_GEMINI_KEY` | Uudet litteraatit |
| YouTube Data API v3 *(valinnainen)* | Videon kuvaus | `YOUTUBE_API_KEY` | Vain kuvaus; otsikko ja kansikuva tulevat oEmbedistä |
| Spotify Web API *(valinnainen)* | Jakson kuvaus varareittinä | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Lähes ei mitään: ensisijainen reitti on RSS |
| Apple iTunes Search, gpodder.net | Podcastin RSS-syötteen etsintä | ei avainta | Spotify-jaksojen kuvaus, kesto ja MP3 |
| oEmbed, Google Fonts, jsDelivr (Mermaid) | Metatiedot, fontit, tutkimusten kaaviot | ei avainta | Otsikot ja kansikuvat, ulkoasu, Mermaid-kuvat |

## Ajastukset

Workerilla ei ole omia ajastuksia (ei `triggers.crons`, ei `scheduled`-käsittelijää)
[mitattu 7.11.2026]. Ajastetut työt ovat Claude Code -rutiineja
([routines/README.md](../routines/README.md)):

| Rutiini | Ehdotettu ajastus | Ohje |
|---|---|---|
| Aamurutiini | joka päivä klo 6 | `routines/aamu.md` |
| Pistokoe | sunnuntaisin klo 18 | `routines/pistokoe.md` |
| *Käynnistä nyt* | käsin, enintään 30 laukaisua/h/rutiini [oletus] | `PURKU_ROUTINE` |

## Workerin salaisuudet ja muuttujat

Lähde: `worker-configuration.d.ts`, `src/asennus.ts` ja `env.*`-viittaukset `src/`-kansiossa [mitattu 7.11.2026]. Sivu `/asennus` näyttää, mitkä on asetettu.

| Nimi | Pakollinen | Käyttö | Luonti |
|---|---|---|---|
| `CAPTURE_TOKEN` | kyllä | Bearer `/api/*`-reiteille (pikakomento, rutiinit) | `openssl rand -hex 32` |
| `MCP_TOKEN` | kyllä | Claude Coden bearer `/mcp`:hen | `openssl rand -hex 32` |
| `COOKIE_ENCRYPTION_KEY` | kyllä | Istuntoevästeiden allekirjoitus | `openssl rand -hex 32` |
| `ALLOWED_GITHUB_LOGIN` | kyllä | Ainoa sallittu GitHub-tunnus (kirjainkoko ratkaisee) | oma tunnus |
| `GITHUB_CLIENT_ID` | kyllä | GitHub OAuth | OAuth App |
| `GITHUB_CLIENT_SECRET` | kyllä | GitHub OAuth | OAuth App → *Generate a new client secret* |
| `YOUTUBE_API_KEY` | ei | Videokuvaukset | [KAYTTO.md](KAYTTO.md#youtube--ja-spotify-kuvaukset-valinnainen) |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | ei | Spotify-varareitti | sama |
| `PURKU_ROUTINE` | ei | Aamurutiinin `trig_…`-tunnus | [routines/README.md](../routines/README.md) |
| `PURKU_TOKEN` | ei | Rutiinin API-laukaisimen token | sama |

## Rutiinien ympäristömuuttujat (claude.ai)

Asetetaan rutiinin ympäristöön, eivät ole Workerissa. Kaikki alkavat
`LUKUPINO_`, jotta ne eivät törmää muiden projektien muuttujiin samassa
ympäristössä.

| Nimi | Pakollinen | Käyttö |
|---|---|---|
| `LUKUPINO_URL` | kyllä | Asennuksen osoite ilman loppukauttaviivaa |
| `LUKUPINO_CAPTURE_TOKEN` | kyllä | Sama arvo kuin Workerin `CAPTURE_TOKEN` |
| `LUKUPINO_GEMINI_KEY` | litterointiin | Gemini-avain projektista, johon on liitetty laskutus |
| `LUKUPINO_GEMINI_FREE_KEY` | ei | Ilmaistason avain, kokeillaan ensin. **Ei EU:ssa, Sveitsissä eikä Britanniassa** (alla) |

Claude Coden `.mcp.json` käyttää lisäksi muuttujaa `LUKUPINO_MCP_TOKEN` (arvo = `MCP_TOKEN`) ja `migrate-from-karakeep.py` muuttujia `LUKUPINO_CAPTURE_TOKEN`, `KARAKEEP_URL` ja `KARAKEEP_API_KEY`.

### Gemini EU:ssa

Geminin API-ehtojen mukaan Euroopan talousalueella, Sveitsissä ja Britanniassa
oleville käyttäjille tarjottavat sovellukset saavat käyttää vain maksullista
tasoa ([ehdot](https://ai.google.dev/gemini-api/terms)). Ehdoista ei käy selväksi,
koskeeko tämä omaa käyttöä omalla avaimella, joten turvallinen oletus on avain
projektista, johon on liitetty laskutus. Silloin Google ei myöskään käytä
dataa mallien koulutukseen. Ilmaistasolla YouTube-videoita voi käsitellä
enintään 8 tuntia päivässä, ja vain julkisia [oletus, Googlen dokumentaatio].

## Julkaisu ja päivitys

Ei automaattista julkaisua. Repon juuresta:

```bash
npm ci --legacy-peer-deps
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
```

Ensimmäinen `wrangler deploy` luo D1:n ja KV:t ja kirjoittaa niiden tunnisteet
`wrangler.jsonc`:hen (wrangler ≥ 4.45) [oletus, Cloudflaren muutosloki
24.10.2025]. Tunnisteet eivät ole salaisuuksia; ne commitoidaan omaan forkkiin.
`wrangler r2`- ja `kv`-komennot osuvat oletuksena paikalliseen simulaattoriin;
tuotanto vaatii `--remote`.

CI (`.github/workflows/tarkistus.yml`) ajaa `tsc`:n jokaisessa PR:ssä.

## Rajat ja kustannukset

| Palvelu | Ilmaistaso [oletus, palveluntarjoajien hinnastot] | Yhden ihmisen käyttö |
|---|---|---|
| Workers | 100 000 pyyntöä/pv, 10 ms CPU/pyyntö | satoja pyyntöjä päivässä |
| D1 | 5 Gt, 5 M rivilukua/pv | megatavuja |
| KV | 1 Gt, 1 000 kirjoitusta/pv | kymmeniä kirjoituksia |
| R2 | 10 Gt (vaatii maksutavan) | kuvia ja PDF:iä |
| Claude | Rutiinit vaativat Pron tai ylemmän; Pro-tason raja oli julkaisuhetkellä 5 ajoa/pv | 1 ajo/pv + 1/vko |
| Gemini | käytön mukaan | 2 h podcast noin 200 000 syötetokenia; tunti videota (`fps 0.01`) noin 100 000 |

Ilmaistason ylitys kaataa pyynnöt klo 00.00 UTC asti.
