#!/usr/bin/env node
// Kylvää paikalliseen lukupinoon kuvitteellisen demoaineiston (demo.json)
// dokumentaation kuvakaappauksia varten. Ks. README.md tässä kansiossa.
//
// Kulku: tyhjennä paikallinen D1 → /api/import → /api/update (media, tila,
// kansikuva, muistiinpanot) → /api/transcript → /api/research → poiminnat →
// /api/quiz ja muutama vastaus → ajat kohdeviikolle SQL:llä.
//
// Kaikki tehdään paikallisen palvelimen REST-rajapinnan kautta, paitsi
// tyhjennys ja aikaleimojen siirto, jotka ajetaan `wrangler d1 execute
// --local`: rajapinta asettaa poiminnoille, tutkimukselle ja pistokokeelle
// aina nykyhetken, mutta Viikko mediassa -sivu laskee ne kohdeviikolta.
// /api/add jätetään käyttämättä, koska se hakee metatiedot verkosta.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { JUURI, KANSIO, OSOITE, aika, devVars, istuntoEvaste, isoViikko, kohdeviikko, lisaaMinuutteja, lueDemo, pyynto, tarkistaPalvelin } from "./yhteinen.mjs";

const vars = devVars();
const demo = lueDemo();
const nyt = new Date();
const evaste = istuntoEvaste(vars);
const api = (p, o) => pyynto(vars, p, o);
const ui = (p, o = {}) => pyynto(vars, p, { ...o, evaste });

/** SQL paikalliseen D1:een. --local on kovakoodattu: etäkantaan ei kosketa. */
function sql(lauseet) {
	const dir = mkdtempSync(path.join(os.tmpdir(), "lukupino-demo-"));
	const f = path.join(dir, "demo.sql");
	writeFileSync(f, lauseet.join("\n") + "\n");
	const r = spawnSync("npx", ["wrangler", "d1", "execute", "lukupino", "--local", "--file", f], { cwd: JUURI, encoding: "utf8" });
	rmSync(dir, { recursive: true, force: true });
	if (r.status !== 0) throw new Error("wrangler d1 execute --local epäonnistui:\n" + r.stdout + r.stderr);
}
const s = (v) => (v == null ? "NULL" : "'" + String(v).replace(/'/g, "''") + "'");

// --- Kansikuvat ---
// Pienet abstraktit SVG-kuvat data-osoitteina (image_url enintään 1000
// merkkiä). Ne latautuvat ilman verkkoa eikä niissä ole lisenssiehtoja.
const MUODOT = {
	kayra: (c) => `<path d='M16 80H148M16 10V80' stroke='${c}' stroke-opacity='.35'/><path d='M16 16C30 56 52 68 148 74' stroke='${c}' stroke-width='3' fill='none'/><circle cx='16' cy='16' r='4' fill='${c}'/>`,
	porras: (c) => `<path d='M14 16C20 38 26 44 34 46V16C44 36 54 42 68 43V16C84 32 100 37 120 38V16C130 26 140 30 150 31' stroke='${c}' stroke-width='3' fill='none' stroke-linejoin='round'/><path d='M14 80H150' stroke='${c}' stroke-opacity='.35'/>`,
	lamppu: (c) => `<defs><radialGradient id='g'><stop offset='0' stop-color='${c}' stop-opacity='.8'/><stop offset='1' stop-color='${c}' stop-opacity='0'/></radialGradient></defs><circle cx='80' cy='42' r='46' fill='url(#g)'/><path d='M74 28h12l5 24H69z' fill='${c}'/><rect x='71' y='55' width='18' height='5' rx='2' fill='${c}'/>`,
	aallot: (c) => [0, 1, 2].map((i) => `<path d='M0 ${30 + i * 15}q20-${14 - i * 4} 40 0t40 0t40 0t40 0' stroke='${c}' stroke-width='${3 - i * 0.7}' stroke-opacity='${1 - i * 0.3}' fill='none'/>`).join(""),
	kuu: (c, bg) => `<circle cx='112' cy='38' r='17' fill='${c}'/><circle cx='121' cy='31' r='15' fill='${bg}'/><g fill='${c}'><circle cx='30' cy='20' r='1.5'/><circle cx='58' cy='52' r='1'/><circle cx='44' cy='70' r='1.5'/><circle cx='80' cy='18' r='1'/><circle cx='140' cy='70' r='1.5'/></g>`,
	metsa: (c) => `<path d='M14 84l15-36 15 36zM38 84l20-50 20 50zM70 84l14-30 14 30zM92 84l22-56 22 56zM124 84l13-28 13 28z' fill='${c}'/>`,
	verkko: (c) => {
		const sar = [[35, [22, 45, 68]], [80, [16, 36, 56, 76]], [125, [32, 60]]];
		let d = "";
		for (let i = 0; i < 2; i++) for (const y1 of sar[i][1]) for (const y2 of sar[i + 1][1]) d += `M${sar[i][0]} ${y1}L${sar[i + 1][0]} ${y2}`;
		// Solmut nollan mittaisina viivoina pyöreillä päillä: lyhyempi kuin circle-elementit.
		const n = sar.flatMap(([x, ys]) => ys.map((y) => `M${x} ${y}h0`)).join("");
		return `<path d='${d}' stroke='${c}' stroke-opacity='.35'/><path d='${n}' stroke='${c}' stroke-width='8' stroke-linecap='round'/>`;
	},
	kuplat: (c) => `<g fill='${c}'><circle cx='42' cy='58' r='18' opacity='.85'/><circle cx='80' cy='38' r='12' opacity='.55'/><circle cx='108' cy='60' r='22' opacity='.7'/><circle cx='136' cy='28' r='9' opacity='.45'/><circle cx='62' cy='24' r='7' opacity='.4'/></g>`,
	pisteet: (c) => {
		const ryhmat = [[], [], []];
		for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) ryhmat[(i * 2 + j) % 3].push(`M${22 + i * 23} ${22 + j * 23}h0`);
		return ryhmat.map((d, k) => `<path d='${d.join("")}' stroke='${c}' stroke-width='${5 + k * 5}' stroke-opacity='${(k + 1) / 3}' stroke-linecap='round'/>`).join("");
	},
	aurinko: (c, bg) => `<circle cx='80' cy='66' r='28' fill='${c}'/><path d='M0 66H160' stroke='${c}' stroke-width='2'/><path d='M20 74H140M40 82H120' stroke='${bg}' stroke-width='3'/>`,
	ruudukko: (c) => {
		let r = "";
		for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) r += `<rect x='${18 + i * 44}' y='${14 + j * 36}' width='36' height='26' rx='3'/>`;
		return `<g fill='none' stroke='${c}' stroke-width='2'>${r}</g><path d='M54 27h8M98 27h8M76 40v10' stroke='${c}' stroke-width='2'/>`;
	},
	revontulet: (c) => `<path d='M0 52C40 18 90 58 160 20V38C92 72 44 34 0 68z' fill='${c}' fill-opacity='.6'/><path d='M0 34C50 6 96 40 160 8V18C100 50 46 18 0 46z' fill='${c}' fill-opacity='.3'/><g fill='${c}'><circle cx='24' cy='80' r='1'/><circle cx='120' cy='76' r='1.3'/><circle cx='70' cy='84' r='1'/></g>`,
};

function kansi(spec) {
	if (!spec) return undefined;
	const [tausta, vari] = spec.varit;
	const muoto = MUODOT[spec.muoto];
	if (!muoto) throw new Error(`Tuntematon kansikuvan muoto: ${spec.muoto}`);
	const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='90' viewBox='0 0 160 90'><rect width='160' height='90' fill='${tausta}'/>${muoto(vari, tausta)}</svg>`;
	// Koodataan vain merkit, jotka eivät kelpaa url()-arvoon tai HTML-attribuuttiin.
	const uri = "data:image/svg+xml," + svg.replace(/[%#<>"'()\s{}|\\^`[\]]/g, (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"));
	if (uri.length > 1000) throw new Error(`Kansikuva ${spec.muoto} on ${uri.length} merkkiä, raja 1000`);
	return uri;
}

const rivit = (x) => (Array.isArray(x) ? x.join("\n") : x);
const fiPvm = (iso) => {
	const d = new Date(new Date(iso).toLocaleString("en-US", { timeZone: "Europe/Helsinki" }));
	return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
};

async function main() {
	await tarkistaPalvelin();
	const viikko0 = kohdeviikko(nyt);
	console.log(`Palvelin ${OSOITE} · kohdeviikko alkaa ${viikko0} (viikko ${isoViikko(viikko0)})`);

	const ennen = await api("/api/stats");
	if (ennen.total > 0 && !process.argv.includes("--tyhjenna")) {
		throw new Error(`Paikallisessa kannassa on jo ${ennen.total} tallennusta. Aja uudelleen lipulla --tyhjenna, jos ne saa poistaa (vain paikallinen kanta).`);
	}
	console.log("Tyhjennetään paikallinen kanta…");
	sql(["DELETE FROM quiz_items;", "DELETE FROM quizzes;", "DELETE FROM quotes;", "DELETE FROM research;", "DELETE FROM transcripts;", "DELETE FROM bookmarks;", "DELETE FROM lists;"]);

	// 1. Tallennukset ja listat. /api/import säilyttää annetun tallennusajan.
	const ajat = new Map(demo.tallennukset.map((t) => [t.avain, aika(t.tallennettu, nyt)]));
	const imp = await api("/api/import", {
		method: "POST",
		body: {
			lists: demo.listat.map((name) => ({ name })),
			bookmarks: demo.tallennukset.map((t) => ({
				url: t.url,
				title: t.otsikko,
				description: t.kuvaus ?? null,
				excerpt: t.ote ? rivit(t.ote) : null,
				summary: t.tiivistelma ?? null,
				saved_at: ajat.get(t.avain),
				status: t.tila,
				rating: t.arvio ?? undefined,
				lists: t.listat ?? [],
			})),
		},
	});
	if (imp.failed || imp.created !== demo.tallennukset.length) throw new Error("Tuonti epäonnistui: " + JSON.stringify(imp));
	console.log(`  ${imp.created} tallennusta`);

	const vienti = await api("/api/export");
	const id = new Map();
	for (const t of demo.tallennukset) {
		const b = vienti.bookmarks.find((x) => x.url === new URL(t.url).toString());
		if (!b) throw new Error(`Tallennusta ei löytynyt viennistä: ${t.url}`);
		id.set(t.avain, b.id);
	}
	const idOf = (avain) => {
		if (!avain) return null;
		if (!id.has(avain)) throw new Error(`Tuntematon tallennus: ${avain}`);
		return id.get(avain);
	};

	// 2. Mediatyyppi, lukutila, kansikuva, Omin sanoin ja kortti (litteraatin
	//    AIHEET + POIMINNAT; Worker poimii POIMINNAT poimintoihin).
	const up = await api("/api/update", {
		method: "POST",
		body: {
			updates: demo.tallennukset.map((t) => ({
				id: idOf(t.avain),
				media: t.media,
				progress: t.lukutila ?? undefined,
				imageUrl: kansi(t.kansi),
				recall: t.omin_sanoin ? rivit(t.omin_sanoin) : undefined,
				note: t.kortti ? rivit(t.kortti) : undefined,
				fetchNote: t.noutohuomio ?? undefined,
			})),
		},
	});
	if (up.missing?.length) throw new Error("Päivitys ei löytänyt: " + up.missing.join(", "));

	// 3. Litteraatit.
	for (const t of demo.tallennukset.filter((x) => x.litteraatti)) {
		const r = await api("/api/transcript", { method: "POST", body: { id: idOf(t.avain), text: rivit(t.litteraatti), source: "demo" } });
		console.log(`  litteraatti ${t.avain}: ${r.words} sanaa`);
	}

	// 4. Tutkimukset: valmis markdown-tiedostosta tai pelkkä pyyntö jonoon.
	const tutkimusAika = aika({ viikko: 0, pv: 6, klo: "07:10" }, nyt);
	for (const t of demo.tallennukset.filter((x) => x.tutkimus)) {
		if (t.tutkimus === "pyydetty") {
			await api("/api/research", { method: "POST", body: { id: idOf(t.avain), request: true } });
		} else {
			const text = readFileSync(path.join(KANSIO, t.tutkimus), "utf8").replaceAll("{{TUTKITTU}}", fiPvm(tutkimusAika));
			await api("/api/research", { method: "POST", body: { id: idOf(t.avain), text } });
		}
		console.log(`  tutkimus ${t.avain}: ${t.tutkimus === "pyydetty" ? "pyydetty" : "valmis"}`);
	}

	// 5. Poiminnat: omat sanat /api/quotes, korostukset kuten UI ne tallentaa.
	for (const p of demo.poiminnat) {
		const q = { text: p.teksti, bookmarkId: idOf(p.tallennus) ?? undefined, who: p.kuka ?? undefined, at: p.kohta ?? undefined };
		if (p.laji === "korostus") await ui("/ui/quotes", { method: "POST", body: { ...q, kind: "korostus" } });
		else await api("/api/quotes", { method: "POST", body: { quotes: [{ ...q, kind: "oma" }] } });
	}
	const tahdet = new Set([...demo.poiminnat.filter((p) => p.tahti).map((p) => p.teksti), ...(demo.tahdella_lahteesta ?? [])]);
	const kaikki = (await api("/api/export")).quotes;
	for (const q of kaikki.filter((x) => tahdet.has(x.text))) await ui(`/ui/quotes/${q.id}/star`, { method: "POST", body: { starred: true } });
	console.log(`  ${kaikki.length} poimintaa, ${tahdet.size} tähdellä`);

	// 6. Pistokoe ja muutama vastaus. Yksi väite jätetään kaappaukselle.
	const pk = demo.pistokoe;
	const koe = await api("/api/quiz", {
		method: "POST",
		body: {
			title: pk.otsikko.replace("{{VIIKKO}}", String(isoViikko(viikko0))),
			scope: pk.rajaus,
			items: pk.vaitteet.map((v) => ({
				statement: v.statement,
				correct: v.correct,
				explanation: v.explanation,
				bookmark_id: idOf(v.tallennus),
				anchor: v.anchor ?? null,
				kind: v.kind ?? null,
				view: v.view ?? null,
			})),
		},
	});
	const vastatut = [];
	for (const [i, v] of pk.vaitteet.entries()) {
		if (!v.vastaus) continue;
		await ui(`/ui/quiz/${koe.id}/answer`, { method: "POST", body: { pos: i + 1, answer: v.vastaus.answer, confident: v.vastaus.confident } });
		vastatut.push([i + 1, v.vastaus.klo]);
	}
	console.log(`  pistokoe ${koe.id}: ${koe.n} väitettä, ${vastatut.length} vastattu`);

	// 7. Ajat kohdeviikolle. Rajapinta merkitsi kaiken luoduksi nyt.
	const lauseet = [];
	const tekstinAika = new Map(demo.poiminnat.map((p) => [p.teksti, aika(p.aika, nyt)]));
	const lahdeLaskuri = new Map();
	for (const q of kaikki) {
		let t = tekstinAika.get(q.text);
		if (!t && q.bookmark_id) {
			const avain = [...id].find(([, v]) => v === q.bookmark_id)?.[0];
			const n = lahdeLaskuri.get(q.bookmark_id) ?? 0;
			lahdeLaskuri.set(q.bookmark_id, n + 1);
			t = lisaaMinuutteja(ajat.get(avain), 45 + n);
		}
		if (t) lauseet.push(`UPDATE quotes SET created_at = ${s(t)} WHERE id = ${s(q.id)};`);
	}
	for (const t of demo.tallennukset) {
		const bid = idOf(t.avain);
		lauseet.push(`UPDATE bookmarks SET updated_at = saved_at WHERE id = ${s(bid)};`);
		if (t.litteraatti) lauseet.push(`UPDATE transcripts SET created_at = ${s(lisaaMinuutteja(ajat.get(t.avain), 30))} WHERE bookmark_id = ${s(bid)};`);
		if (t.tutkimus && t.tutkimus !== "pyydetty") lauseet.push(`UPDATE research SET created_at = ${s(tutkimusAika)} WHERE bookmark_id = ${s(bid)};`);
	}
	lauseet.push(`UPDATE quizzes SET created_at = ${s(aika(pk.luotu, nyt))} WHERE id = ${s(koe.id)};`);
	for (const [pos, klo] of vastatut) {
		lauseet.push(`UPDATE quiz_items SET answered_at = ${s(aika({ ...pk.luotu, klo }, nyt))} WHERE quiz_id = ${s(koe.id)} AND pos = ${pos};`);
	}
	sql(lauseet);

	const st = await api("/api/stats");
	console.log(`Valmis: ${st.total} tallennusta · ${JSON.stringify(st.byMedia)}`);
}

main().catch((e) => {
	console.error("✗ " + (e instanceof Error ? e.message : String(e)));
	process.exit(1);
});
