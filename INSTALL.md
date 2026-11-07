# INSTALL.md — Lukupino install runbook for coding agents

> **Human?** Start with [README.md](README.md) and [docs/ALOITA-TASTA.md](docs/ALOITA-TASTA.md).
> To install, open a coding agent (Claude Code recommended) and say:
> *"Asenna minulle Lukupino tästä reposta: &lt;repo URL&gt;. Noudata INSTALL.md:tä."*
>
> **Agent?** This file is for you. It is written in English for precision and
> token economy; talk to the user in **their** language (default: Finnish, the
> UI language). Follow the steps in order. Every step is idempotent:
> **Check → Do → Verify**. If Check already passes, skip Do.

## Contract

**Done means all of these are true** (the user's tier decides how far you go):

| # | Goal state | Verified by |
|---|---|---|
| G1 | Worker deployed on the user's own Cloudflare account | `curl -s $URL/healthz` → `ok` |
| G2 | All required secrets set | `curl -s $URL/asennus.json` → `"valmisKirjautumiseen": true` |
| G3 | Database migrated | `/asennus.json` with bearer → `kanta.puuttuvatMigraatiot == []` |
| G4 | User can log in from their phone | user confirms `/asennus` shows the green badge while logged in |
| G5 | Saving from iPhone works | three share tests pass (S12) |
| G6 *(tier 2)* | Claude can read the pile | user's Claude answers using the Lukupino connector |
| G7 *(tier 3)* | Morning routine runs | routine run reports queue sizes without **HUOMIO** |

**Rules — MUST**

- Speak the user's language. Explain each human step in one or two plain sentences: what, where to click, what to paste, how they know it worked.
- Ask all interview questions (S0) before doing anything. **When anything is unclear later, ask; never guess the user's accounts, usernames, choices or intent.**
- **The user may ask anything at any time** ("what is a token?", "why do I need GitHub?", "how much does this cost?", "is this safe?") and they will. Pause, answer from [docs/UKK.md](docs/UKK.md) and the docs it links (the skill `skills/lukupino-apu` describes how), say where the answer came from, then tell them which step you resume and continue only when they are ready. A question is never permission to change anything.
- Stop at the first failed Verify. Report symptom, likely cause (see *Troubleshooting*), and the fix. Do not improvise around a failure.
- Prefer showing values on `/asennus` over typing them: the page prints this install's exact URLs.

**Rules — NEVER**

- Never print a secret value into chat, logs, commit messages, files in the repo, or command output. Generate secrets with `openssl rand -hex 32` and pipe them straight into `wrangler secret put`. The only exception is the temp file in S6 (outside the repo, mode 600, deleted in S16).
- Never ask the user to paste a secret into chat. Secrets the user owns (GitHub client secret, Gemini key) go into a dashboard form, not through you.
- Never enable paid features without asking (R2 requires a payment method on the Cloudflare account; a billed Gemini key costs money per use).
- Never commit `.dev.vars`, `export/`, or anything containing a token.
- Never weaken the auth model (single allowed GitHub login, bearer tokens) to make a step pass.

**Human-only steps** (you cannot do these; guide and wait): creating accounts, the GitHub OAuth App, pasting the GitHub client secret, everything on the iPhone, adding the claude.ai connector, creating routines.

## Architecture in 30 seconds

One Cloudflare Worker serves everything: the web UI (`/`), the capture API (`/api/*`, bearer `CAPTURE_TOKEN`), MCP for Claude (`/mcp`, OAuth via GitHub or bearer `MCP_TOKEN`) and a self-check (`/asennus`, `/asennus.json`). Data lives in D1; KV holds OAuth state and (without R2) files. The Worker never calls an LLM: summaries, transcripts, research and quizzes are written by Claude routines through the REST API. Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## S0 — Interview (ask once, all together)

| Key | Ask | Why |
|---|---|---|
| `LANG` | Which language do we use? | All explanations |
| `TIER` | 1 = save & browse (free) · 2 = + Claude can read it (free Claude works, 1 custom connector) · 3 = + daily automation: summaries, transcripts, research, quiz (paid Claude plan, Gemini key) | How far to go |
| `RUNTIME` | Are we on the user's own computer (local Claude Code) or in a cloud session (claude.ai/code, e.g. from iPhone)? | Auth method in S2 |
| `GH_LOGIN` | Your GitHub username (create a free account at github.com if none) | `ALLOWED_GITHUB_LOGIN` |
| `CF` | Do you have a Cloudflare account? (free at dash.cloudflare.com/sign-up) | S2 |
| `R2` | Store files in R2 (10 GB, needs a payment method on Cloudflare, normally €0) or KV (1 GB, no card)? Default: KV | S3 |
| `LISTS` | 3–6 topics you read about (become topic lists, e.g. *Teknologia*, *Talous*, *Ajattelu*) | S11 |

## S1 — Get the code

- **Check:** you are in a clone of the user's **own fork** (`git remote -v` points to `github.com/<GH_LOGIN>/…`).
- **Do:** HUMAN: on the upstream repo page press **Fork** (keep it public or make it private; private is recommended because of S15 backups). Then clone the fork. If the user only wants to try it, a plain clone is fine, but tier 3 routines need a fork in their GitHub.
- **Verify:** `npm ci --legacy-peer-deps && npx tsc --noEmit` exits 0. Node ≥ 20 (`node -v`).

## S2 — Cloudflare authentication

- **Check:** `npx wrangler whoami` shows an account.
- **Do (local):** `npx wrangler login` (opens a browser; the user approves).
- **Do (cloud session):** wrangler cannot open a browser. HUMAN: dash.cloudflare.com → *My Profile* → *API Tokens* → *Create Token* → template **Edit Cloudflare Workers**, then add permission *Account → D1 → Edit* (and *Workers R2 Storage → Edit* if `R2=yes`) → *Create*. The token must reach wrangler as `CLOUDFLARE_API_TOKEN` without passing through chat: in Claude Code on the web use the session's credential tool for host `api.cloudflare.com` and give wrangler a dummy `CLOUDFLARE_API_TOKEN`; elsewhere the user sets the environment variable themselves. If wrangler asks for an account, set `CLOUDFLARE_ACCOUNT_ID` (not secret; shown in the dashboard URL).
- **Verify:** `npx wrangler whoami` lists the account.
- **Also check the workers.dev subdomain:** a brand-new account must pick one once. HUMAN: dashboard → *Workers & Pages* → follow the prompt to choose a subdomain (it becomes part of every URL: `https://lukupino.<subdomain>.workers.dev`).

## S3 — Configure

- `wrangler.jsonc` has no resource IDs on purpose: `wrangler deploy` (≥ 4.45) creates D1 and KV and writes their IDs back into the file.
- `R2=yes`: uncomment the `"r2_buckets"` line. HUMAN first: dashboard → *R2* → enable (asks for a payment method). Otherwise leave it commented: files go to KV automatically (`src/files.ts`).
- **Verify:** `npx wrangler deploy --dry-run` exits 0.

## S4 — First deploy

- **Do:** `npx wrangler deploy`. Read the printed URL; call it `URL` (e.g. `https://lukupino.<subdomain>.workers.dev`, no trailing slash).
- **Verify:** `curl -s $URL/healthz` → `ok`. `git diff wrangler.jsonc` now shows IDs. Commit that file to the fork (IDs are not secrets; future deploys and routines need them): `git commit -am "Lukupino: resurssitunnisteet" && git push`.

## S5 — Database

- **Do:** `npx wrangler d1 migrations apply DB --remote` (answer yes).
- **Verify:** the command lists `0001`…`0014` (or later) as applied. Full check comes in S8.

## S6 — Generated secrets

Create a temp file **outside the repo** so you can verify later without printing values:

```bash
umask 077; F="$HOME/.lukupino-asennus.env"; : > "$F"
for N in CAPTURE_TOKEN MCP_TOKEN COOKIE_ENCRYPTION_KEY ROUTINE_TOKEN; do
  V=$(openssl rand -hex 32); printf '%s=%s\n' "$N" "$V" >> "$F"
  printf '%s' "$V" | npx wrangler secret put "$N" >/dev/null
done
printf '%s' "<GH_LOGIN>" | npx wrangler secret put ALLOWED_GITHUB_LOGIN >/dev/null
```

- **Check first:** if `/asennus.json` already shows a name as `true`, do not overwrite it (it would break the user's existing shortcut and connector) unless the user asks for rotation.
- **Verify:** `curl -s $URL/asennus.json` → `pakolliset` shows the four required names `true`. `ROUTINE_TOKEN` (optional, but always create it) is the routines' scoped token: the server refuses owner-only fields and imports for it.

## S7 — GitHub OAuth App (HUMAN)

The user creates it; you give them the exact values. The easiest source is the page `$URL/asennus` (section *GitHub OAuth App*, copy buttons), which works on a phone.

1. github.com → *Settings* → *Developer settings* → **OAuth Apps** → *New OAuth App*. (**OAuth Apps, not GitHub Apps** — a different product with a different form.)
2. *Application name* `Lukupino` · *Homepage URL* `$URL` · *Authorization callback URL* `$URL/callback`.
3. After creating: add the second redirect URL `$URL/callback/ui`. Both must match exactly; GitHub does not accept sub-paths. Leave *wildcard matching* off.
4. *Generate a new client secret*.
5. Cloudflare dashboard → *Workers & Pages* → `lukupino` → *Settings* → *Variables and Secrets* → *Add*: type **Secret**, `GITHUB_CLIENT_ID` = Client ID, and again `GITHUB_CLIENT_SECRET` = the secret.

- **Verify:** `curl -s $URL/asennus.json` → `"valmisKirjautumiseen": true`, `"puuttuu": []`.

## S8 — Full self-check

```bash
set -a; . "$HOME/.lukupino-asennus.env"; set +a
curl -s -H "Authorization: Bearer $CAPTURE_TOKEN" "$URL/asennus.json"
```

- **Verify:** `kanta.puuttuvatMigraatiot == []`, `kanta.virhe == null`, `varoitukset == []`, `tiedostot` is `kv` or `r2` as chosen.

## S9 — First login (HUMAN)

Ask the user to open `$URL/asennus` **on their phone in Safari**, tap *Kirjaudu GitHubilla*, approve. After login the page shows the green badge and, blurred, the tokens they will need next. Token values are shown only within 15 minutes of logging in; later the page offers *Kirjaudu uudelleen nähdäksesi tokenit*.

- **Verify:** user confirms the badge *Kaikki pakollinen kunnossa*. If they see `Ei pääsyä: <name>`, `ALLOWED_GITHUB_LOGIN` does not match their GitHub username exactly (case matters).

## S10 — Home screen app (HUMAN, iPhone)

Safari → open `$URL` → *Share* → *Add to Home Screen*. iOS keeps home-screen apps' cookies separate from Safari [assumed]: if the app shows the login page, log in once more inside it.

## S11 — Starter lists

```bash
curl -s -X POST "$URL/api/import" -H "Authorization: Bearer $CAPTURE_TOKEN" \
  -H "User-Agent: lukupino-agent/1.0" -H "Content-Type: application/json" \
  -d '{"lists":[{"name":"Luettavaa","icon":"📚"},{"name":"Sisältö puuttuu","icon":"⚠️"},{"name":"<topic 1>","icon":"<emoji>"}]}'
```

`Luettavaa` and `Sisältö puuttuu` have fixed meanings for the routines. Names without emoji in `name`; emoji only in `icon`.

- **Verify:** `curl -s -H "Authorization: Bearer $CAPTURE_TOKEN" -H "User-Agent: lukupino-agent/1.0" $URL/api/lists` lists them.

## S12 — iPhone shortcut and the three-share test (HUMAN)

Guide the user through [docs/IPHONE.md](docs/IPHONE.md). It asks for two values on import: the address (`$URL`) and the token (`CAPTURE_TOKEN`, copy from `/asennus` while logged in).

Test, in this order:

1. Safari: share an article link → choose *Tutki tämä* → notification `✓ Tallennettu lukupinoon · tutkitaan`.
2. Photos: share a photo → *★★ Hyvä* → `✓ Tallennettu lukupinoon ⭐⭐`.
3. Files: share a PDF → *Ei arviota* → `✓ Tallennettu lukupinoon`.

- **Verify:** all three appear at the top of `$URL`. You can also check `GET $URL/api/export`.

**Tier 1 ends here.** Go to S16.

## S13 — MCP: Claude reads the pile (tier 2)

Nothing new is needed on Cloudflare: MCP is the same Worker at `$URL/mcp`, and its OAuth uses the same GitHub OAuth App (callback `$URL/callback`, S7) and the same `ALLOWED_GITHUB_LOGIN`. Full guide for the user: [docs/MCP.md](docs/MCP.md). Ask which clients they want (claude.ai + Claude apps / Claude Code / other).

- **claude.ai and the Claude apps (HUMAN):** claude.ai → *Settings* (or *Customize*) → *Connectors* → *Add custom connector* → name `Lukupino`, URL `$URL/mcp` → *Connect* → approve on GitHub **with the same account as `ALLOWED_GITHUB_LOGIN`**. The connector is per account, so it also appears in the iPhone app and Claude Desktop. Free Claude plans allow one custom connector; Team/Enterprise need the org admin to allow custom connectors.
- **Claude Code, token:** the user copies `LUKUPINO_MCP_TOKEN` from `/asennus` into their own shell environment (never via chat), then the user runs `claude mcp add --transport http lukupino $URL/mcp --header "Authorization: Bearer $LUKUPINO_MCP_TOKEN"` (default local scope; never `--scope project`, which would write the token into `.mcp.json`). For a committed `.mcp.json`, use the `${LUKUPINO_MCP_TOKEN}` placeholder form shown on `/asennus` instead.
- **Claude Code, OAuth (no token on disk):** `claude mcp add --transport http lukupino $URL/mcp`, then `/mcp` → *lukupino* → *Authenticate* in Claude Code.
- **Verify:** claude.ai: the user asks *"Hae lukupinosta uusimmat tallennukset"* and Claude calls `search-bookmarks` and lists their S12 test items. Claude Code: `claude mcp list` shows `lukupino` connected.
- If tools are missing although the connector is connected: they approved with a different GitHub account (the server returns an empty tool list to anyone else). Remove and re-add the connector.

## S14 — Gemini key (tier 3, HUMAN)

Transcripts use Google Gemini. aistudio.google.com → *Get API key* → create a key in a Google Cloud project **with billing enabled**. In the EEA, Switzerland and the UK the Gemini API terms allow only paid services for apps offered to users there; a billed key is the safe default (a 2-hour podcast costs roughly 200 000 input tokens). Users elsewhere may add a free-tier key as `LUKUPINO_GEMINI_FREE_KEY`.

## S15 — Routines (tier 3, HUMAN, guided)

Follow [routines/README.md](routines/README.md): one environment with `LUKUPINO_URL`, `LUKUPINO_CAPTURE_TOKEN` (= the Worker's **`ROUTINE_TOKEN`**, never `CAPTURE_TOKEN`), `LUKUPINO_GEMINI_KEY`; two routines (morning, Sunday quiz) whose prompts are the short starters in that file. Then *Run now* on the morning routine.

- **Verify:** the run's answer reports queue sizes A–F and contains no **HUOMIO OMISTAJALLE**.
- Optional *Käynnistä nyt* button: `PURKU_ROUTINE` + `PURKU_TOKEN` (same file).
- The skill's weekly export (step 4) writes all saved items into the repo: only if the fork is **private**.

## S16 — Finish

1. `rm -f "$HOME/.lukupino-asennus.env"` (tokens remain readable on `/asennus` when logged in).
2. Optional extras the user may want later: `YOUTUBE_API_KEY` (video descriptions, docs/INFRA.md), R2.
3. Report to the user in their language: a table of G1–G7 with ✓/–, their `URL`, where to find tokens (`/asennus`), and the one-line daily use: *share → choose rating → done*.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `curl` gets `error code: 1010` or 403 from Cloudflare | Default user agent of some HTTP clients is blocked | Send `User-Agent: lukupino-agent/1.0` |
| `wrangler deploy`: *You need to register a workers.dev subdomain* | New account | S2, last bullet |
| `wrangler deploy`: R2 not enabled | `r2_buckets` uncommented without R2 | Comment it out or enable R2 (S3) |
| `wrangler d1 migrations apply`: database not found | Deploy (S4) not run yet, or IDs not written back | Run S4, check `git diff wrangler.jsonc` |
| GitHub: *The redirect_uri is not associated with this application* | Callback URL mismatch | Copy both URLs from `/asennus` exactly, no trailing slash |
| `Ei pääsyä: <login>` (403) | `ALLOWED_GITHUB_LOGIN` ≠ GitHub username | Re-put the secret with the exact username |
| Shortcut shows `✗ Tunnistautuminen epäonnistui` | Wrong or missing token in the shortcut | Re-copy `CAPTURE_TOKEN` from `/asennus` |
| Shortcut shows `✓` but nothing saved | Custom notification text instead of the server's `message` | docs/IPHONE.md, *Miksi ilmoitus luetaan palvelimelta* |
| `Verkkoyhteys katkesi` in the shortcut | Two *Get Contents of URL* actions chained, or a POST with an empty body | docs/IPHONE.md, troubleshooting |
| Routine says `LUKUPINO_URL puuttuu` | Environment variables missing | routines/README.md, step 3 |
| Routine gets `403 … omistajan kenttiä` | Working as designed: the routine tried to write `rating`, `progress` or `recall` with `ROUTINE_TOKEN` | Check what made it try (injected page content?); the skills never write these |
| `/asennus` shows no tokens, only *Kirjaudu uudelleen* | Session older than 15 minutes | Log in again from that button |
| Connector connects but Claude has no Lukupino tools | Approved with a GitHub account other than `ALLOWED_GITHUB_LOGIN` | Remove connector, log out of GitHub, re-add (docs/MCP.md) |
| Claude Code: MCP 401 | `LUKUPINO_MCP_TOKEN` missing or wrong in the user's environment | Re-copy from `/asennus` (64 chars) |
| User asks something you can't find in the docs | Not documented | Say so, don't guess; suggest where to look; maintainers add it to docs/UKK.md |
| Transcription: `GEMINI 403/429` | Key not valid, no billing, or quota | S14 |

## Updating an existing install

```bash
git fetch upstream && git merge upstream/main     # or GitHub "Sync fork", then git pull
npm ci --legacy-peer-deps && npx tsc --noEmit
npx wrangler d1 migrations apply DB --remote       # new migrations, if any
npx wrangler deploy
curl -s -H "Authorization: Bearer <CAPTURE_TOKEN>" "$URL/asennus.json"   # puuttuvatMigraatiot == []
```

Read `docs/CHANGELOG.md` first: entries marked **Toimenpide** need a manual step (new secret, new routine variable).

## Uninstall

`npx wrangler delete` (Worker), `npx wrangler d1 delete <db>`, `npx wrangler kv namespace delete --namespace-id <id>` (twice), R2 bucket if any; delete the GitHub OAuth App; remove the claude.ai connector and routines. Export first if the user wants their data: `GET $URL/api/export`.
