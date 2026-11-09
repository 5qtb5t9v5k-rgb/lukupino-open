// Piirtää infograafin kuvaksi: node scripts/infograafi/piirra.mjs
// Tulos: docs/kuvat/infograafi.jpg (1080 px leveä). Google Fonts haetaan verkosta;
// jos HTTPS_PROXY on asetettu, selain käyttää sitä.
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

// Playwright on asennettu globaalisti (kuten scripts/kuvakaappaukset), joten require eikä import.
const { chromium } = createRequire(import.meta.url)("playwright");
const tama = dirname(fileURLToPath(import.meta.url));
const lahde = pathToFileURL(join(tama, "infograafi.html")).href;
const kohde = join(tama, "..", "..", "docs", "kuvat", "infograafi.jpg");
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;
const selain = await chromium.launch({ proxy });
const sivu = await selain.newPage({ viewport: { width: 1080, height: 1200 }, deviceScaleFactor: 1 });
await sivu.goto(lahde, { waitUntil: "networkidle" });
await sivu.evaluate(() => document.fonts.ready);
const ala = await sivu.evaluate(() => document.body.firstElementChild.getBoundingClientRect().height);
await sivu.setViewportSize({ width: 1080, height: Math.ceil(ala) });
await sivu.screenshot({ path: kohde, type: "jpeg", quality: 85, fullPage: true });
console.log(`infograafi.jpg 1080×${Math.ceil(ala)}`);
await selain.close();
