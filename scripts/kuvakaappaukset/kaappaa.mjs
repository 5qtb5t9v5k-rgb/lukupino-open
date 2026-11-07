#!/usr/bin/env node
// Ottaa dokumentaation kuvakaappaukset paikallisesta lukupinosta
// docs/kuvat/-kansioon. Aja seed.mjs ensin. Ks. README.md tässä kansiossa.
//
//   node scripts/kuvakaappaukset/kaappaa.mjs            kaikki kuvat
//   node scripts/kuvakaappaukset/kaappaa.mjs kirja lue  vain nämä
//
// Huom: pistokoe-kuva vastaa yhteen väitteeseen selaimessa, joten se
// muuttaa kantaa. Aja seed.mjs uudelleen ennen seuraavaa kaappausta.

import { mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { JUURI, OSOITE, devVars, istuntoEvaste, kohdeviikko, lueDemo, pyynto, tarkistaPalvelin } from "./yhteinen.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const ULOS = path.join(JUURI, "docs", "kuvat");
const PUHELIN = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const TYOPOYTA = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };

const vars = devVars();
const demo = lueDemo();

/** Odota fontit, kuvat ja asettelu, jotta kuva ei jää kesken latauksen. */
async function valmis(page) {
	await page.evaluate(() => document.fonts.ready);
	// Laiskat kuvat näkymän ulkopuolella eivät lataudu koskaan, joten niitä ei odoteta.
	await page.waitForFunction(() => [...document.images].filter((i) => i.loading !== "lazy" || i.getBoundingClientRect().top < innerHeight).every((i) => i.complete), null, { timeout: 15000 });
	await page.waitForTimeout(400);
	const virhe = await page.evaluate(() => {
		const t = document.body.innerText;
		return ["Ladataan…", "ei löytynyt", "Ei tuloksia", "unauthorized", "Kirjaudu GitHubilla"].find((x) => t.includes(x)) ?? null;
	});
	if (virhe) throw new Error(`Sivulla näkyy "${virhe}" — onko seed.mjs ajettu?`);
}

/** Kuvan alareuna: elementin alareuna + väli, enintään sivun korkeus. */
async function alareuna(page, selector, vali = 16, monesko = 0) {
	return page.evaluate(
		([sel, v, n]) => {
			const el = document.querySelectorAll(sel)[n];
			const h = document.documentElement.scrollHeight;
			if (!el) return h;
			return Math.min(h, Math.ceil(el.getBoundingClientRect().bottom + scrollY + v));
		},
		[selector, vali, monesko],
	);
}

async function main() {
	await tarkistaPalvelin();
	mkdirSync(ULOS, { recursive: true });
	const vienti = await pyynto(vars, "/api/export");
	const id = (avain) => {
		const t = demo.tallennukset.find((x) => x.avain === avain);
		const b = t && vienti.bookmarks.find((x) => x.url === new URL(t.url).toString());
		if (!b) throw new Error(`Tallennusta ${avain} ei löytynyt — aja seed.mjs`);
		return b.id;
	};
	const kokeet = (await pyynto(vars, "/api/quiz")).quizzes;
	if (!kokeet.length) throw new Error("Pistokoetta ei löytynyt — aja seed.mjs");
	const koe = kokeet[0];
	const viikko = kohdeviikko();

	// Google Fonts haetaan verkosta. Agenttiympäristössä selaimen on käytettävä
	// samaa välityspalvelinta kuin muutkin työkalut; localhost ohitetaan.
	const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined;
	// Päivämääräkentän muoto (8.10.2026) tulee selainprosessin kielestä, ei kontekstin localesta.
	const browser = await chromium.launch({ ...(proxy ? { proxy } : {}), args: ["--lang=fi-FI"], env: { ...process.env, LANG: "fi_FI.UTF-8" } });
	const evaste = istuntoEvaste(vars);
	const host = new URL(OSOITE).hostname;
	async function konteksti(asetukset, colorScheme = "light") {
		const ctx = await browser.newContext({ ...asetukset, colorScheme, locale: "fi-FI", timezoneId: "Europe/Helsinki" });
		// http://localhost: Secure-lippu jätetään pois, muuten eväste ei kulje.
		await ctx.addCookies([{ ...evaste, domain: host, path: "/", httpOnly: true, secure: false, sameSite: "Lax" }]);
		return ctx;
	}

	const kuvat = {
		// 1. Etusivu: hyllyt (pistokoe, kesken, tutkimukset, kuuntele, perehdy, helmet, luettavaa).
		etusivu: { ctx: "puhelin", polku: "/", odota: "#out .bm", korkeus: (page) => alareuna(page, "#hylly .shelf", 8, 3) },
		// 2. Kortti alapaneelissa, kuten Luettavaa-rivin napautuksesta.
		kortti: {
			ctx: "puhelin",
			polku: "/",
			odota: "#out .bm",
			ennen: async (page) => {
				await page.evaluate((bid) => window.kortille({ preventDefault() {} }, bid), id("ebbinghaus"));
				await page.waitForSelector("#ks:not([hidden]) #ksis .bm");
			},
		},
		// 3. Koko litteraatti.
		// Rajataan ensimmäiseen korostettuun kappaleeseen asti, jotta poiminta näkyy.
		litteraatti: {
			ctx: "puhelin",
			polku: `/litteraatti/${id("lukulamppu")}`,
			odota: "#tx .p .hl",
			korkeus: async (page) => {
				await page.evaluate(() => document.querySelector("#tx .hl").closest(".p").setAttribute("data-kuva", "1"));
				return alareuna(page, "#tx .p[data-kuva]", 12);
			},
		},
		// 4. Lukunäkymä korostuksineen.
		lue: { ctx: "puhelin", polku: `/lue/${id("aho")}`, odota: "#tx .p .hl" },
		// 5. Tutkimus ja sen kuva.
		tutkimus: { ctx: "puhelin", polku: `/tutkimus/${id("ebbinghaus")}`, odota: "#tx figure.kuva img", korkeus: (page) => alareuna(page, "#tx figure.kuva", 20) },
		// 7. Viikko mediassa: demon kohdeviikko.
		// Kolme ruutua vierekkäin: jokainen on oma puhelinnäkymänsä (390 × 844).
		viikko: {
			ctx: "puhelin",
			polku: `/viikko/${viikko}`,
			odota: "section.r3",
			kuvaa: async (page, tiedosto) => {
				const palat = [];
				for (let i = 0; i < 3; i++) {
					await page.evaluate((n) => {
						const r = document.getElementById("rata");
						r.scrollLeft = n * r.clientWidth;
					}, i);
					await page.waitForTimeout(300);
					palat.push((await page.screenshot()).toString("base64"));
				}
				const vali = 16;
				const koonti = await browser.newPage({ viewport: { width: 390 * 3 + vali * 2, height: 844 }, deviceScaleFactor: 2 });
				await koonti.setContent(`<body style="margin:0;background:#0c1511;display:flex;gap:${vali}px">${palat.map((b) => `<img src="data:image/png;base64,${b}" style="display:block;width:390px;height:844px">`).join("")}</body>`);
				await koonti.waitForFunction(() => [...document.images].every((i) => i.complete));
				await koonti.screenshot({ path: tiedosto });
				await koonti.close();
			},
		},
		// 8. Poiminnat.
		poiminnat: { ctx: "puhelin", polku: "/poiminnat", odota: "#out .qt" },
		// 9. Kirjamuistio.
		kirja: { ctx: "puhelin", polku: `/kirja/${id("seitsemanveljesta")}`, odota: "#km .sec" },
		// 10. Lisää-paneeli auki.
		lisaa: {
			ctx: "puhelin",
			polku: "/",
			odota: "#out .bm",
			ennen: async (page) => {
				await page.click("#addbtn");
				await page.waitForSelector("#add.open");
			},
		},
		// 11. Työpöytä.
		// Hyllyt ja ensimmäinen rivi kahden sarakkeen korttilistaa.
		tyopoyta: { ctx: "tyopoyta", polku: "/", odota: "#out .bm", korkeus: (page) => alareuna(page, "#out .bm", 24, 1) },
		// 12. Tumma teema.
		"etusivu-tumma": { ctx: "tumma", polku: "/", odota: "#out .bm", korkeus: (page) => alareuna(page, "#hylly .shelf", 8, 3) },
		// 6. Pistokoe: vastataan yhteen väitteeseen, jolloin perustelu ja lähde näkyvät.
		// Viimeisenä, koska vastaus muuttaa etusivun pistokoebanneria (4/12 → 5/12).
		pistokoe: {
			ctx: "puhelin",
			polku: `/pistokoe/${koe.id}`,
			odota: ".card",
			ennen: async (page) => {
				const v = demo.pistokoe.kaappauksessa_vastataan;
				const nyt = await page.textContent(".vn");
				if (!nyt.startsWith(`Väite ${v.pos} `)) throw new Error(`Pistokoe ei ole väitteessä ${v.pos} (${nyt}) — aja seed.mjs uudelleen`);
				await page.click(`.btns [data-a="${v.answer}"]`);
				if (v.answer !== -1) await page.click(`.btns [data-c="${v.confident}"]`);
				await page.waitForSelector(".card .rv");
			},
		},
	};

	const valitut = process.argv.slice(2).filter((x) => !x.startsWith("-"));
	for (const v of valitut) if (!kuvat[v]) throw new Error(`Tuntematon kuva: ${v}. Vaihtoehdot: ${Object.keys(kuvat).join(", ")}`);
	const kontekstit = {};
	for (const [nimi, k] of Object.entries(kuvat)) {
		if (valitut.length && !valitut.includes(nimi)) continue;
		kontekstit[k.ctx] ??= await konteksti(k.ctx === "tyopoyta" ? TYOPOYTA : PUHELIN, k.ctx === "tumma" ? "dark" : "light");
		const page = await kontekstit[k.ctx].newPage();
		await page.goto(OSOITE + k.polku, { waitUntil: "networkidle" });
		await page.waitForSelector(k.odota, { timeout: 15000 });
		await valmis(page);
		if (k.ennen) {
			await k.ennen(page);
			await valmis(page);
		}
		const tiedosto = path.join(ULOS, `${nimi}.png`);
		if (k.kuvaa) await k.kuvaa(page, tiedosto);
		else if (k.korkeus) {
			// Pitkä kuva: ikkunaa venytetään eikä käytetä fullPagea, koska fullPage
			// pudottaa mobiiliemuloinnin ja hyllyrivit rivittyvät kuin työpöydällä.
			const leveys = page.viewportSize().width;
			await page.setViewportSize({ width: leveys, height: Math.max(844, await k.korkeus(page)) });
			await valmis(page);
			await page.setViewportSize({ width: leveys, height: Math.max(844, await k.korkeus(page)) });
			await page.screenshot({ path: tiedosto });
		} else await page.screenshot({ path: tiedosto });
		console.log(`${nimi}.png  ${Math.round(statSync(tiedosto).size / 1024)} kt`);
		await page.close();
	}
	await browser.close();
}

main().catch((e) => {
	console.error("✗ " + (e instanceof Error ? e.message : String(e)));
	process.exit(1);
});
