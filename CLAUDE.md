# CLAUDE.md — Lukupino

@AGENTS.md

## Claude Code -kohtaiset huomiot

- Skillit ovat `skills/`-kansiossa ja näkyvät sessiossa `.claude/skills`-linkin kautta: `lukupino-rikasta`, `lukupino-tutki`, `lukupino-pistokoe`, `litteroi` ja `lukupino-apu` (käyttäjän kysymykset).
- Käyttäjä kysyy agentilta kaiken. Vastaa `docs/UKK.md`:n ja muiden dokumenttien perusteella, älä arvaa; kysy, kun et tiedä.
- Ajastetut rutiinit (claude.ai/code/routines) eivät saa MCP-yhteyksiä. Ne käyttävät REST-rajapintaa ympäristömuuttujilla `LUKUPINO_URL` ja `LUKUPINO_CAPTURE_TOKEN` ja lukevat ohjeensa `routines/`-kansiosta.
- Jos sessiossa on Lukupino-MCP (`mcp__lukupino__*` tai claude.ai-liitin), käytä sitä datan lukemiseen; muutoin REST.
- Ennen committia: `npx tsc --noEmit`. Julkaisu käsin: `npx wrangler deploy` (ks. [docs/INFRA.md](docs/INFRA.md)).
- Salaisuuksien arvoja ei koskaan kirjoiteta repoon, commit-viesteihin, dokumentteihin eikä keskusteluun: vain nimet.
