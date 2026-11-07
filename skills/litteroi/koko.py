#!/usr/bin/env python3
"""Koko litteraatti Geminillä: sanatarkka teksti, aikaleimat ja puhujat.

Käyttö (rutiinit: aina --id, ei osoitteita komentoriville):
  python3 skills/litteroi/koko.py --id <id> [--puhujat-tiedosto /tmp/puhujat.txt]
  python3 skills/litteroi/koko.py youtube <url>      [--puhujat "A (juontaja), B (vieras)"] [--tallenna <id>]
  python3 skills/litteroi/koko.py audio   <mp3-url>  [--puhujat ...] [--tallenna <id>]

`--id` hakee tallennuksen lukupinosta (GET /api/bookmark/<id>): jos sillä on
media_url, litteroidaan se äänenä, muuten YouTube-osoite videona; tulos
tallennetaan samalle tunnukselle. Näin vierasta osoitetta ei koskaan kirjoiteta
komentoriville, jossa komentotulkki voisi laajentaa siinä olevia merkkejä.

Tulostaa litteraatin (rivi per kappale, `[0:04:22] Puhuja: teksti`).
`--tallenna <id>` lähettää sen lukupinoon (POST /api/transcript).

Paluukoodit: 0 ok · 2 ei aikaleimoja (aja kerran uudelleen) ·
3 RECITATION — Gemini ei anna sanatarkkaa tekstiä; `--tallenna` merkitsee
sen ei-saatavilla (transcript_words = 0), eikä sitä yritetä uudelleen.

Miksi paloissa (mitattu 5.10.2026, 2 h jakso):
- Yhdellä kutsulla malli ajatteli 36 000 tokenia ja loppui kesken
  (MAX_TOKENS) kohdassa 1:26.
- Kahdella puolikkaalla samasta tiedostosta jälkimmäisen aikaleimat
  valuivat jakson pituuden yli (2:58, kun jakso oli 1:58).
- 30 minuutin paloilla aikaleimat osuivat YouTubeen sekunnin
  tarkkuudella, ja neljä palaa veivät rinnakkain 40 sekuntia.

Ääni leikataan tavuina (MP3-kehykset tahdistuvat itse), ja kesto luetaan
mutagenilla. Kuvaa ei tarvita litteraattiin: `fps: 0.01` (21.10.2026) laskuttaa YouTubesta
käytännössä vain äänen (~27 tokenia/s, fps 1:llä ~91), eikä litteraatti
muuttunut testissä. YouTube-video paloitellaan `video_metadata`-siirtymillä
15 minuutin paloihin, koska 30 minuutin pala päättyi kesken (48 min
videosta saatiin 25 min). Videon kestoa ei tiedetä etukäteen, joten
loppu tunnistetaan vastauksesta LOPPU tai virheestä videon lopun yli
osuvalla siirtymällä (Gemini palauttaa silloin 500).
"""
import argparse, io, json, os, re, subprocess, sys, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

M = "gemini-flash-latest"
BASE = "https://generativelanguage.googleapis.com"
PALA = 1800
PALA_YT = 900
LUKUPINO = os.environ.get("LUKUPINO_URL", "").rstrip("/")  # esim. https://lukupino.<tili>.workers.dev

OHJE = """Litteroi tämä {mika} SANATARKASTI alusta loppuun alkuperäisellä kielellä. Älä tiivistä, älä jätä mitään pois, älä käännä.

Muoto:
- Uusi kappale aina kun puhuja vaihtuu tai noin 30–60 sekunnin välein.
- Jokainen kappale alkaa aikaleimalla ja puhujan nimellä: `[0:04:22] Nimi: teksti`
- {puhujat}
- Poista täytesanat (um, uh) ja toistot ("it's it's it's"), mutta älä muuta merkitystä.
- Mainoskatkot merkitään yhdellä rivillä `[0:12:00] [mainos]` eikä niitä litteroida.
- Ei mitään muuta tekstiä ennen tai jälkeen litteraatin.

Tämä on yksi pala pidemmästä tallenteesta. Aikaleimat alkavat tämän palan alusta [0:00:00]. Jos ensimmäinen tai viimeinen lause on katkennut, litteroi siitä se mikä kuuluu. Jos palassa ei ole lainkaan puhetta, koska tallenne on jo loppunut, vastaa pelkkä LOPPU."""

TS = re.compile(r"^\[(\d+):(\d\d):(\d\d)\]", re.M)


class Recitation(Exception):
    """Geminin tekijänoikeussuodatin kieltäytyy sanatarkasta tekstistä.
    Todettu 5.10.2026: 3/16 YouTube-videosta (Dan Pink, Ali Abdaal), joka
    pala ja joka uusintayritys. Ei kierretä — merkitään ei-saatavilla."""


# Avaimet: ensin valinnainen ilmaistason LUKUPINO_GEMINI_FREE_KEY, ja jos se
# puuttuu, ei kelpaa tai kiintiö on täynnä, LUKUPINO_GEMINI_KEY (laskutettu
# projekti). EU:ssa, Sveitsissä ja Britanniassa käytä vain LUKUPINO_GEMINI_KEY:tä
# (Geminin ehdot, ks. docs/INFRA.md).
ILMAINEN = os.environ.get("LUKUPINO_GEMINI_FREE_KEY")
AVAIMET = [k for k in (ILMAINEN, os.environ.get("LUKUPINO_GEMINI_KEY")) if k]
_avain = 0


class AvainVaihtui(Exception):
    """Ilmaisavain ei käynyt kesken ajon. Files API -tiedosto kuuluu avaimen
    projektiin, joten ääni on lähetettävä uudelleen uudella avaimella."""


def key():
    if not AVAIMET:
        sys.exit("LUKUPINO_GEMINI_KEY puuttuu ympäristöstä")
    return AVAIMET[_avain]


def ilmaisella():
    return bool(ILMAINEN) and _avain == 0


def vaihda_maksulliseen(syy):
    global _avain
    if ilmaisella() and len(AVAIMET) > 1:
        _avain = 1
        sys.stderr.write(f"ilmaisavain ei käynyt ({syy}), maksullinen avain\n")
        return True
    return False


def post(url, body, headers=None, raw=False, timeout=900):
    h = {"x-goog-api-key": key(), "Content-Type": "application/json"}
    h.update(headers or {})
    data = body if raw else json.dumps(body).encode()
    return urllib.request.urlopen(urllib.request.Request(url, data=data, headers=h, method="POST"), timeout=timeout)


def upload(data, mime):
    r = post(BASE + "/upload/v1beta/files", {"file": {"display_name": "pala"}},
             {"X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
              "X-Goog-Upload-Header-Content-Length": str(len(data)), "X-Goog-Upload-Header-Content-Type": mime})
    up = r.headers["x-goog-upload-url"]
    r = urllib.request.urlopen(urllib.request.Request(up, data=data, method="POST", headers={
        "Content-Length": str(len(data)), "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize"}), timeout=900)
    f = json.loads(r.read())["file"]
    for _ in range(60):
        if f.get("state") in (None, "ACTIVE"):
            break
        time.sleep(3)
        f = json.loads(urllib.request.urlopen(urllib.request.Request(BASE + "/v1beta/" + f["name"], headers={"x-goog-api-key": key()}), timeout=60).read())
    return f["uri"]


# Flex-taso (21.10.2026): puoleen hintaan, mutta kapasiteetti on
# "best-effort" — testissä 21.10. ensimmäinen pyyntö sai heti 503:n
# ("high demand"). Siksi Flex ensin ja sen kaatuessa heti tavallinen taso.
# LITTEROI_FLEX=0 ohittaa Flexin.
FLEX = os.environ.get("LITTEROI_FLEX", "1") != "0"


def _kutsu(body):
    d = json.loads(post(f"{BASE}/v1beta/models/{M}:generateContent", body).read())
    c = d["candidates"][0]
    if c.get("finishReason") == "RECITATION":
        raise Recitation()
    t = "".join(p.get("text", "") for p in c.get("content", {}).get("parts", []))
    return t.strip(), c.get("finishReason")


def generate(part, ohje, yrityksia=3, tiedoston_avain=None):
    """tiedoston_avain: millä avaimella Files API -tiedosto lähetettiin. Jos
    toinen säie on sillä välin vaihtanut avaimen, tiedosto ei näy uudelle
    avaimelle (403) — silloin pala lähetetään uudelleen (AvainVaihtui).
    Todettu 21.10.2026: kaksi rinnakkaista podcast-palaa, ilmaiskiintiö täyttyi
    kesken ja toinen pala sai 403:n."""
    if tiedoston_avain is not None and tiedoston_avain != _avain:
        raise AvainVaihtui()
    body = {"contents": [{"parts": [{"text": ohje}, part]}],
            "generationConfig": {"temperature": 0.1, "maxOutputTokens": 65536,
                                 "thinkingConfig": {"thinkingBudget": 0},
                                 "mediaResolution": "MEDIA_RESOLUTION_LOW"}}
    # Flex on vain maksullisella tasolla.
    if FLEX and not ilmaisella():
        try:
            return _kutsu({**body, "service_tier": "flex"})
        except Recitation:
            raise
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:
            sys.stderr.write(f"flex ei vastannut ({getattr(e, 'code', e)}), tavallinen taso\n")
    for yritys in range(yrityksia):
        try:
            return _kutsu(body)
        except urllib.error.HTTPError as e:
            if e.code == 403 and tiedoston_avain is not None and tiedoston_avain != _avain:
                raise AvainVaihtui()
            if ilmaisella():
                viesti = e.read().decode(errors="replace").lower()
                if e.code in (403, 429) or (e.code == 400 and "api key" in viesti):
                    if vaihda_maksulliseen(e.code):
                        if "/v1beta/files/" in json.dumps(part):
                            raise AvainVaihtui()
                        return generate(part, ohje, yrityksia)
            if e.code in (429, 500, 503) and yritys < yrityksia - 1:
                time.sleep(20 * (yritys + 1))
                continue
            raise


def siirra(t, alku):
    """Palan aikaleimat koko tallenteen aikaan. Malli antaa joskus valmiiksi
    absoluuttiset (YouTube-siirtymillä), joskus palan alusta — päätellään
    ensimmäisestä aikaleimasta."""
    ts = [int(h) * 3600 + int(m) * 60 + int(s) for h, m, s in TS.findall(t)]
    if not ts or alku == 0 or ts[0] >= alku - 60:
        return t, (ts[-1] if ts else None)
    def f(m):
        x = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3)) + int(alku)
        return f"[{x // 3600}:{x % 3600 // 60:02d}:{x % 60:02d}]"
    return TS.sub(f, t), ts[-1] + int(alku)


def audio(url, ohje):
    try:
        from mutagen.mp3 import MP3
    except ImportError:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "mutagen"], check=True, capture_output=True)
        from mutagen.mp3 import MP3
    data = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=900).read()
    kesto = MP3(io.BytesIO(data)).info.length
    n = max(1, round(kesto / PALA))
    rajat = [(i * kesto / n, (i + 1) * kesto / n) for i in range(n)]

    def tee(r):
        a, b = r
        pala = data[int(len(data) * a / kesto):int(len(data) * b / kesto)]
        for kierros in range(3):
            try:
                avain = _avain
                uri = upload(pala, "audio/mpeg")
                t, fin = generate({"file_data": {"mime_type": "audio/mpeg", "file_uri": uri}}, ohje, tiedoston_avain=avain)
                break
            except AvainVaihtui:
                continue
            except urllib.error.HTTPError as e:
                # Lähetys ilmaisavaimella voi kaatua kiintiöön tai avaimeen: maksulliselle.
                viesti = e.read().decode(errors="replace").lower() if e.code == 400 else ""
                if (e.code in (403, 429) or "api key" in viesti) and vaihda_maksulliseen(e.code):
                    continue
                raise
        else:
            raise RuntimeError("pala ei onnistunut avaimen vaihdon jälkeen")
        if fin != "STOP":
            sys.stderr.write(f"pala {a/60:.0f} min: {fin}\n")
        return siirra(t, a)[0]

    # Kaksi rinnakkain: neljä 30 min palaa kerralla on ~180k tokenia minuutissa.
    with ThreadPoolExecutor(2) as ex:
        return [t for t in ex.map(tee, rajat)], kesto


def youtube(url, ohje):
    osat = []
    for i in range(20):  # enintään 5 h
        a = i * PALA_YT
        part = {"file_data": {"file_uri": url}, "video_metadata": {"start_offset": f"{a}s", "end_offset": f"{a + PALA_YT}s", "fps": 0.01}}
        try:
            # Videon lopun yli osuva siirtymä antaa 500:n — uusintoja vain yksi.
            t, fin = generate(part, ohje, 3 if i == 0 else 2)
        except urllib.error.HTTPError as e:
            if i > 0:
                break
            raise
        if t.strip() == "LOPPU" or not TS.search(t):
            break
        t, viimeinen = siirra(t, a)
        osat.append(t)
        if fin != "STOP":
            sys.stderr.write(f"pala {a/60:.0f} min: {fin}\n")
    return osat, None


TUNNUS = re.compile(r"[A-Za-z0-9_-]{4,40}")
YOUTUBE = re.compile(r"https?://(www\.|m\.)?(youtube\.com|youtu\.be)/", re.I)


def hae_tallennus(kid):
    req = urllib.request.Request(f"{LUKUPINO}/api/bookmark/{kid}",
                                 headers={"Authorization": "Bearer " + os.environ["LUKUPINO_CAPTURE_TOKEN"],
                                          "User-Agent": "lukupino-agent/1.0"})
    return json.loads(urllib.request.urlopen(req, timeout=60).read().decode()).get("bookmark") or {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("tila", nargs="?", choices=["youtube", "audio"])
    ap.add_argument("lahde", nargs="?")
    ap.add_argument("--id", dest="kid", metavar="ID", help="hae lähde lukupinosta ja tallenna samalle tunnukselle")
    ap.add_argument("--puhujat", default="")
    ap.add_argument("--puhujat-tiedosto", metavar="POLKU", help="puhujat tiedostosta (rutiinit: kirjoita tiedosto, älä komentoriville)")
    ap.add_argument("--tallenna", metavar="ID")
    a = ap.parse_args()
    if not a.kid and not (a.tila and a.lahde):
        ap.error("anna --id <tunnus> tai tila ja lähde")
    # Tarkistus ennen kuin Geminin kiintiötä kuluu: tallennus tarvitsee osoitteen ja tokenin.
    if (a.tallenna or a.kid) and not (LUKUPINO and os.environ.get("LUKUPINO_CAPTURE_TOKEN")):
        sys.exit("LUKUPINO_URL tai LUKUPINO_CAPTURE_TOKEN puuttuu ympäristöstä (ks. docs/INFRA.md)")
    if a.kid:
        if not TUNNUS.fullmatch(a.kid):
            sys.exit("virheellinen tunnus")
        b = hae_tallennus(a.kid)
        media, url = (b.get("media_url") or "").strip(), (b.get("url") or "").strip()
        if media.lower().startswith(("http://", "https://")):
            a.tila, a.lahde = "audio", media
        elif YOUTUBE.match(url):
            a.tila, a.lahde = "youtube", url
        else:
            sys.exit("EI_LAHDETTA: tallennuksella ei ole media_url:ia eikä YouTube-osoitetta (podcastille: hae MP3 syötteestä ja kirjoita se mediaUrl-kenttään /api/updatella)")
        a.tallenna = a.tallenna or a.kid
    if not a.lahde.lower().startswith(("http://", "https://")):
        sys.exit("lähteen pitää olla http(s)-osoite")
    if a.puhujat_tiedosto:
        a.puhujat = open(a.puhujat_tiedosto, encoding="utf-8").read().strip()[:500]
    puhujat = (f"Puhujat: {a.puhujat}. Jos et tiedä kuka puhuu, käytä `?`." if a.puhujat
               else "Tunnista puhujat nimeltä, jos nimet käyvät ilmi; muuten Puhuja 1, Puhuja 2.")
    lahde = a.lahde
    if a.tila == "youtube":
        lahde = re.sub(r"[?&]is=[^&]*", "", lahde)
    ohje = OHJE.format(mika="podcast-jakso" if a.tila == "audio" else "video", puhujat=puhujat)
    t0 = time.time()
    try:
        osat, _ = (audio if a.tila == "audio" else youtube)(lahde, ohje)
    except Recitation:
        sys.stderr.write("RECITATION: Gemini ei anna tästä sanatarkkaa litteraattia (tekijänoikeussuodatin)\n")
        if a.tallenna:
            tallenna({"id": a.tallenna, "unavailable": "RECITATION"})
        sys.exit(3)
    teksti = "\n\n".join(o.strip() for o in osat if o.strip())
    if not TS.search(teksti):
        sys.stderr.write("MUOTO: litteraatissa ei ole aikaleimoja\n")
        sys.exit(2)
    print(teksti)
    sanoja = len(teksti.split())
    sys.stderr.write(f"{len(osat)} palaa, {sanoja} sanaa, {time.time() - t0:.0f} s\n")
    if a.tallenna:
        taso = "ilmaistaso" if ilmaisella() else "maksullinen"
        tallenna({"id": a.tallenna, "text": teksti, "source": f"gemini {M}, {a.tila}, paloina, {taso}"})


def tallenna(body):
    req = urllib.request.Request(f"{LUKUPINO}/api/transcript", method="POST", data=json.dumps(body).encode(),
                                 headers={"Authorization": "Bearer " + os.environ["LUKUPINO_CAPTURE_TOKEN"],
                                          "Content-Type": "application/json", "User-Agent": "lukupino-agent/1.0"})
    sys.stderr.write(urllib.request.urlopen(req, timeout=60).read().decode() + "\n")


if __name__ == "__main__":
    main()
