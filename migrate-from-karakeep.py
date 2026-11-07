#!/usr/bin/env python3
"""Karakeep → Lukupino -migraatio. Kertaluontoinen, mutta idempotentti: sama
URL ohitetaan palvelimella, joten ajon voi toistaa turvallisesti.

Käyttö:  python3 migrate-from-karakeep.py <LUKUPINO_URL> <CAPTURE_TOKEN>
Ympäristö: KARAKEEP_API_KEY (pakollinen), KARAKEEP_URL (Karakeep-palvelimesi
osoite, esim. https://karakeep.example.com)

Siirtää kirjanmerkit, korttien muistiinpanot (note) ja listat. URL-ittomat
liitetiedostot (`type: asset`) jäävät pois: niitä ei voi noutaa osoitteesta.
Vertaa määriä Karakeepiin ennen kuin puret sen: erotuksen pitää selittyä
liitetiedostoilla. Jos ei selity, älä jatka purkuun vaan selvitä ero ensin."""
import html as htmlmod
import json
import os
import re
import sys
import urllib.request

KB = os.environ["KARAKEEP_URL"].rstrip("/")
KK = os.environ["KARAKEEP_API_KEY"]
LB, LT = sys.argv[1].rstrip("/"), sys.argv[2]
MAX_EXCERPT = 3000


# Cloudflare estää Pythonin oletus-user-agentin virheellä 1010 ("banned based on
# your browser's signature"). Oma tunniste menee läpi. Karakeep ei välitä, mutta
# lukupino on Cloudflaren takana — siksi tämä on pakollinen kaikissa pyynnöissä.
UA = "lukupino-migrate/1.0"


def kget(p):
    r = urllib.request.Request(KB + p, headers={"Authorization": "Bearer " + KK, "User-Agent": UA})
    return json.load(urllib.request.urlopen(r, timeout=120))


def page(p, key):
    out, cur, seen = [], None, set()
    while True:
        d = kget(p + ("&" if "?" in p else "?") + "limit=50" + (f"&cursor={cur}" if cur else ""))
        ids = [x["id"] for x in d[key]]
        if ids and ids[0] in seen:
            raise SystemExit("sivutus toisti sivun — keskeytetään")
        seen.update(ids)
        out += d[key]
        cur = d.get("nextCursor")
        if not cur:
            break
    return out


TAG_RE = re.compile(r"<(script|style|noscript)[^>]*>.*?</\1>", re.S | re.I)


def html_to_text(h):
    if not h:
        return None
    t = TAG_RE.sub(" ", h)
    t = re.sub(r"<br\s*/?>|</p>|</div>|</li>|</h\d>", "\n", t, flags=re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    t = htmlmod.unescape(t)
    t = re.sub(r"[ \t ]+", " ", t)
    t = re.sub(r"\n\s*\n+", "\n", t).strip()
    return t[:MAX_EXCERPT] if t else None


print("Luetaan Karakeep…")
bms = page("/api/v1/bookmarks?includeContent=true", "bookmarks")
lists = kget("/api/v1/lists")["lists"]
member = {}
for l in lists:
    for b in page(f"/api/v1/lists/{l['id']}/bookmarks", "bookmarks"):
        member.setdefault(b["id"], []).append(l["name"])
print(f"  kirjanmerkkejä {len(bms)}, listoja {len(lists)}, jäsenyyksiä {sum(len(v) for v in member.values())}")

items, skipped_no_url = [], 0
for b in bms:
    c = b.get("content") or {}
    url = c.get("url")
    if not url:
        skipped_no_url += 1  # liitetiedostot ilman URLia — ei siirretä
        continue
    excerpt = html_to_text(c.get("htmlContent"))
    items.append({
        "url": url,
        "title": b.get("title") or c.get("title"),
        "description": c.get("description"),
        "excerpt": excerpt,
        "summary": b.get("summary"),
        "note": b.get("note"),
        "saved_at": b.get("createdAt"),
        "lists": member.get(b["id"], []),
    })
print(f"  siirrettäviä {len(items)}, ohitettu ilman URLia {skipped_no_url}")

tot = {"created": 0, "skipped": 0, "failed": 0, "errors": []}
payload_lists = [{"name": l["name"], "icon": l.get("icon")} for l in lists]
for i in range(0, len(items), 40):
    body = json.dumps({"bookmarks": items[i:i + 40], "lists": payload_lists if i == 0 else []}).encode()
    r = urllib.request.Request(LB + "/api/import", data=body, method="POST",
                               headers={"Authorization": "Bearer " + LT, "Content-Type": "application/json",
                                        "User-Agent": UA})
    d = json.load(urllib.request.urlopen(r, timeout=300))
    for k in ("created", "skipped", "failed"):
        tot[k] += d[k]
    tot["errors"] += d.get("errors", [])
    print(f"  erä {i//40+1}: +{d['created']} ohitettu {d['skipped']} virhe {d['failed']}")
print("YHTEENSÄ", {k: v for k, v in tot.items() if k != "errors"})
for e in tot["errors"][:10]:
    print("  !", e)

# Todennus palvelimelta
r = urllib.request.Request(LB + "/api/export", headers={"Authorization": "Bearer " + LT, "User-Agent": UA})
ex = json.load(urllib.request.urlopen(r, timeout=120))
eb = ex["bookmarks"]
print(f"TODENNUS: lukupinossa {len(eb)} | note {sum(1 for b in eb if b['note'])} | summary {sum(1 for b in eb if b['summary'])} "
      f"| excerpt {sum(1 for b in eb if b['excerpt'])} | listoissa {sum(1 for b in eb if b['lists'])} | listoja {len(ex['lists'])}")
from collections import Counter
print("  status:", dict(Counter(b["status"] for b in eb)))
