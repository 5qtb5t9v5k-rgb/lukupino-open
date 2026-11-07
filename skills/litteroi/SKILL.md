---
name: litteroi
description: "Tekee podcast-jaksosta tai videosta tiivistelmän, aiheet ja poiminnat Geminin avulla ja tallentaa ne lukupinoon. YouTube suoraan osoitteesta, Spotify RSS-syötteen MP3:n kautta. Käytä kun käyttäjä pyytää litteraattia, tiivistelmää videosta tai jaksosta, tai kutsuu /litteroi."
---

# Litterointi

Lukupino saa YouTubelta ja Spotifylta otsikon ja kansikuvan, mutta ei
sisältöä: YouTube vastaa konesalista bottimuurilla ja Spotifyn oma
kuvaus on pelkkä "Podcast · Episode". **Gemini kuuntelee lähteen
puolestasi** — se ottaa YouTube-osoitteen sellaisenaan ja podcastin
MP3:n Files API:n kautta.

Mitattu 20.9.2026: kahden tunnin jakso, 126 Mt, valmis **30 sekunnissa**.

## Lue ensin

[`../lukupino-rikasta/LAHTEET.md`](../lukupino-rikasta/LAHTEET.md): lähteiden
säännöt ja podcastien vartija (ei koskaan YouTube-vastinetta podcastille).
Litteraatti menee `note`-kenttään, joka on täystekstihaussa.

## Vaatimukset

Ympäristömuuttujat (nimet ovat `LUKUPINO_`-alkuisia, jotta ne eivät törmää
muiden projektien muuttujiin samassa ympäristössä):

| Muuttuja | Pakollinen | Mihin |
|---|---|---|
| `LUKUPINO_URL` | kyllä | asennuksen osoite, esim. `https://lukupino.<tili>.workers.dev` |
| `LUKUPINO_CAPTURE_TOKEN` | kyllä | Workerin `CAPTURE_TOKEN` |
| `LUKUPINO_GEMINI_KEY` | kyllä | Gemini-avain projektista, johon on liitetty laskutus |
| `LUKUPINO_GEMINI_FREE_KEY` | ei | ilmaistason avain; **ei EU:ssa, Sveitsissä eikä Britanniassa** (Geminin ehdot, ks. `docs/INFRA.md`) |

Jos ympäristössä on myös **`LUKUPINO_GEMINI_FREE_KEY`**, skriptit käyttävät
ensin sitä ja siirtyvät laskutettuun avaimeen, jos ilmaisavain ei kelpaa tai
kiintiö on täynnä (400 avainvirhe, 403, 429). Siirto näkyy stderrissä, ja
litteraatin `source`-kenttä kertoo tason. Flex-tasoa yritetään vain
maksullisella avaimella. Malli on **`gemini-flash-latest`** —
älä kovakoodaa versionumeroa: `gemini-2.5-flash` lakkasi toimimasta uusille
avaimille, ja `latest`-alias kestää sen.

## Vaihe 1 — Valitse kohteet

Ilman argumenttia: `search-bookmarks` kyselyllä
`-has:note status:ei-noudettavissa`, `sortOrder: rating`. Käytännössä
YouTube- ja Spotify-linkit, parhaiksi arvioidut ensin.

**Aja helmet ensin.** Kahden tunnin jakso maksaa noin 200 000 syötetokenia,
joten kaikkea ei kannata litteroida — vain se mitä oikeasti aikoo käyttää.

## Vaihe 2 — Aja

**Järjestys 21.10.2026 alkaen: ensin koko litteraatti, sitten tiivistelmä
litteraatista.** Video tai ääni luetaan vain kerran; tiivistelmä tehdään
tekstistä, joka on murto-osan hintainen.

```bash
python3 skills/litteroi/koko.py youtube "<video-url>" --tallenna <id>   # ks. Koko litteraatti
bash skills/litteroi/litteroi.sh teksti <id> skills/litteroi/ohje.txt
```

Jos `koko.py` ei tuottanut litteraattia (koodi 3 = RECITATION, tai 2),
tiivistelmä tehdään suoraan lähteestä varareittinä:

```bash
skills/litteroi/litteroi.sh youtube "<video-url>"  skills/litteroi/ohje.txt
skills/litteroi/litteroi.sh audio   "<mp3-url>"    skills/litteroi/ohje.txt
```

MP3:n osoite on kirjanmerkin **`media_url`**-kentässä (Worker poimii sen
RSS-syötteestä). Jos se puuttuu, hae syöte kuten
`skills/lukupino-rikasta/SKILL.md` vaiheessa 2b.

Skripti hoitaa podcastilla latauksen ja Files API -lähetyksen itse.
YouTubella riittää osoite — videota ei ladata.

## Vaihe 3 — Tallenna

`update-bookmark` tai `POST /api/update`:

| Kenttä | Sisältö |
|---|---|
| `summary` | TIIVISTELMÄ-osio sellaisenaan |
| `note` | `# Litteraatti (Gemini, ääni/video)` ja sen alle AIHEET + POIMINNAT |
| `status` | `kortitettu` |
| `fetchNote` | `tiivistelmä ja aiheet Geminiltä lähteen äänestä` |

`note` menee täystekstihakuun, joten jakso löytyy sanoilla jotka siinä
sanottiin — ei pelkällä otsikolla. Se on koko tämän skillin pointti.

## Koko litteraatti

Tiivistelmän rinnalle tehdään **sanatarkka litteraatti** aikaleimoineen ja
puhujineen. Omistaja selaa sitä lukunäkymässä `/litteraatti/<id>` (haku,
aiheet hyppylinkkeinä, aikaleima avaa lähteen kohdasta) ja korostaa siitä
lauseita suoraan poimintoihin. Lisätty 5.10.2026.

```bash
python3 skills/litteroi/koko.py youtube "<video-url>" --tallenna <id>
python3 skills/litteroi/koko.py audio   "<media_url>" --puhujat "Juontaja (juontaja), Vieras (vieras)" --tallenna <id>
```

`--tallenna` lähettää tuloksen `POST /api/transcript` -reitille. Litteraatti
ei mene `note`-kenttään: 2 h jakso on 140 000 merkkiä, ja se on omassa
taulussaan (`transcripts`), jotta vienti ja listaus pysyvät kevyinä.
`--puhujat` kannattaa antaa podcastille otsikosta tai kuvauksesta — ilman
sitä malli nimeää puhujat vain jos nimet sanotaan ääneen.

**Kulu (21.10.2026).** YouTube luetaan asetuksella `fps: 0.01`: kuvaa ei
tarvita litteraattiin, ja tunti videota maksaa silloin noin 100 000
syötetokenia (täydellä kuvalla noin 330 000). Testissä litteraatti ja nimet
pysyivät samoina. Pyyntö yritetään ensin **Flex-tasolla** (puoleen hintaan);
jos se ei vastaa — 21.10. kapasiteettia ei ollut kertaakaan, 503 — skripti
siirtyy heti tavalliselle tasolle. `LITTEROI_FLEX=0` ohittaa Flexin.

**Paloissa, ei yhdellä kutsulla.** Mitattu 5.10.2026 kahden tunnin
jaksolla: yksi kutsu ajatteli 36 000 tokenia ja katkesi kohdassa 1:26, ja
kahden puolikkaan jälkimmäisen aikaleimat valuivat jakson pituuden yli.
Podcast leikataan 30 minuutin tavupaloihin ja video 15 minuutin
`video_metadata`-siirtymiin (30 min pala jäi videolla kesken). Tulos:
aikaleimat osuivat YouTubeen sekunnin tarkkuudella, 2 h jakso 86 s.

Paluukoodi 3 = **RECITATION**: Geminin tekijänoikeussuodatin ei anna
sanatarkkaa tekstiä (5.10.2026: 3/16 videosta, mm. Dan Pink ja Ali
Abdaal). Sitä ei kierretä; `--tallenna` merkitsee tallennuksen
ei-saatavilla (`transcript_words: 0`), eikä rutiini yritä uudelleen.

Tarkista tulos: aikaleimat kasvavat koko ajan eivätkä ylitä kestoa.
Pitkä väli kahden aikaleiman välillä ei ole aukko, jos sanamäärä täsmää
puhenopeuteen (~200 sanaa/min) — se on pitkä puheenvuoro.

## Rajat joita ei ylitetä

**Älä koskaan lainaa erisnimeä tarkistamatta.** Koneellinen litteraatti
sotkee ne säännöllisesti; ohje käskee mallin merkitä epäselvät
`[epäselvä]`, ja se merkintä jätetään näkyviin.

**Älä litteroi väärää lähdettä.** YouTube-vastineen etsiminen podcastille
on kielletty ([`LAHTEET.md`](../lukupino-rikasta/LAHTEET.md) → *Podcastit*); käytä aina
jakson omaa MP3:a.

**Älä aja koko pinoa.** Kiintiö on jaettu ja jokainen ajo maksaa.

## Poiminnat menevät kokoelmaan

POIMINNAT-osio ei jää vain kortille: Worker poimii sen rivit lukupinon
poimintakokoelmaan (`/poiminnat`) heti kun `note` kirjoitetaan. Pidä siksi
muoto `h:mm:ss – "lainaus"` — rivi ilman lainausmerkkejä ei päädy
kokoelmaan. Puhujan voi lisätä: `h:mm:ss – Puhuja: "lainaus"`.
Kirjan sivun kuvasta kohta on sivunumero: `s. 176 – "lainaus"`.

Jos video tai jakso on kokoelma (*"21 kirjaa"*, *"7 mallia"*), litteraatin
lisäksi jokainen kohta selitetään konseptina ja kontekstina — ks.
`lukupino-rikasta` vaihe 3c.

