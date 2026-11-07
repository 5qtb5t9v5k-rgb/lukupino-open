#!/bin/bash
# Gemini-litterointi: YouTube-video osoitteesta, podcast MP3:sta.
# Käyttö: litteroi.sh teksti  <kirjanmerkin-id> <ohje-tiedosto>
#         litteroi.sh youtube <url> <ohje-tiedosto>
#         litteroi.sh audio   <mp3-url> <ohje-tiedosto>
# Ensisijainen on `teksti` (21.10.2026): tiivistelmä koko litteraatista, joka
# on jo lukupinossa (koko.py --tallenna). Teksti on murto-osan hintainen,
# eikä videota lueta toiseen kertaan. youtube/audio on varareitti, kun
# litteraattia ei ole (RECITATION tai epäonnistunut ajo).
set -e
MODE=$1; SRC=$2; PROMPT_FILE=$3
M=gemini-flash-latest
# Avaimet: ensin valinnainen ilmaistason LUKUPINO_GEMINI_FREE_KEY, ja jos se
# puuttuu, ei kelpaa tai kiintiö on täynnä, LUKUPINO_GEMINI_KEY (laskutettu
# projekti). EU:ssa, Sveitsissä ja Britanniassa käytä vain LUKUPINO_GEMINI_KEY:tä
# (Geminin ehdot, ks. docs/INFRA.md). Nimet ovat LUKUPINO_-alkuisia, jotta ne
# eivät törmää muiden projektien muuttujiin samassa ympäristössä.
AVAIMET=()
[ -n "$LUKUPINO_GEMINI_FREE_KEY" ] && AVAIMET+=("$LUKUPINO_GEMINI_FREE_KEY")
[ -n "$LUKUPINO_GEMINI_KEY" ] && AVAIMET+=("$LUKUPINO_GEMINI_KEY")
[ ${#AVAIMET[@]} -eq 0 ] && { echo "LUKUPINO_GEMINI_KEY puuttuu ympäristöstä" >&2; exit 1; }
P=$(python3 -c "import json,sys;print(json.dumps(open(sys.argv[1]).read()))" "$PROMPT_FILE")
if [ "$MODE" = teksti ]; then
  LT=$(curl -sS -m 60 -H "Authorization: Bearer ${LUKUPINO_CAPTURE_TOKEN:?LUKUPINO_CAPTURE_TOKEN puuttuu}" -H "User-Agent: lukupino-agent/1.0" \
    "${LUKUPINO_URL:?LUKUPINO_URL puuttuu (esim. https://lukupino.<tili>.workers.dev)}/api/transcript/$SRC" \
    | python3 -c "import json,sys;d=json.load(sys.stdin);t=(d.get('text') or '').strip();print(json.dumps(t)) if t else sys.exit(1)") \
    || { echo "EI_LITTERAATTIA: aja ensin koko.py --tallenna tai käytä youtube/audio-tilaa" >&2; exit 1; }
fi
[ "$MODE" = audio ] && { AUD=$(mktemp /tmp/aud.XXXX.mp3); curl -sSL -m 600 -A "Mozilla/5.0" "$SRC" -o "$AUD"; }

pyynto() {  # $1 = avain; kirjoittaa pyynnön tiedostoon /tmp/gem_req.json
  local K=$1
  if [ "$MODE" = teksti ]; then
    BODY="{\"contents\":[{\"parts\":[{\"text\":$P},{\"text\":\"LITTERAATTI:\"},{\"text\":$LT}]}],\"generationConfig\":{\"temperature\":0.3}}"
  elif [ "$MODE" = youtube ]; then
    # fps 0.01: kuvaa ei tarvita, laskutetaan käytännössä vain ääni (21.10.2026).
    BODY="{\"contents\":[{\"parts\":[{\"text\":$P},{\"file_data\":{\"file_uri\":\"$SRC\"},\"video_metadata\":{\"fps\":0.01}}]}],\"generationConfig\":{\"temperature\":0.3}}"
  else
    # Files API -tiedosto kuuluu avaimen projektiin, joten se lähetetään
    # jokaisella avaimella erikseen.
    SZ=$(stat -c%s "$AUD")
    UP=$(curl -sS -m 60 -D - -o /dev/null -X POST "https://generativelanguage.googleapis.com/upload/v1beta/files" \
      -H "x-goog-api-key: $K" -H "X-Goog-Upload-Protocol: resumable" -H "X-Goog-Upload-Command: start" \
      -H "X-Goog-Upload-Header-Content-Length: $SZ" -H "X-Goog-Upload-Header-Content-Type: audio/mpeg" \
      -H "Content-Type: application/json" -d '{"file":{"display_name":"jakso"}}' \
      | grep -i "^x-goog-upload-url" | tr -d '\r' | cut -d' ' -f2)
    URI=$(curl -sS -m 900 -X POST "$UP" -H "Content-Length: $SZ" -H "X-Goog-Upload-Offset: 0" \
      -H "X-Goog-Upload-Command: upload, finalize" --data-binary "@$AUD" \
      | python3 -c "import json,sys;d=json.load(sys.stdin);print((d.get('file') or d).get('uri',''))" 2>/dev/null || true)
    [ -z "$URI" ] && return 4  # lähetys ei onnistunut tällä avaimella
    BODY="{\"contents\":[{\"parts\":[{\"text\":$P},{\"file_data\":{\"mime_type\":\"audio/mpeg\",\"file_uri\":\"$URI\"}}]}],\"generationConfig\":{\"temperature\":0.3}}"
  fi
  echo "$BODY" > /tmp/gem_req.json
}

# Paluukoodit: 0 ok · 1 virhe · 2 muoto · 4 avain ei käy tai kiintiö täynnä
kutsu() {
  curl -sS -m 900 -X POST "https://generativelanguage.googleapis.com/v1beta/models/$M:generateContent" \
    -H "x-goog-api-key: $1" -H "Content-Type: application/json" --data-binary @/tmp/gem_req.json \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
if 'error' in d:
    e=d['error']; c=e.get('code'); m=e.get('message','')
    sys.stderr.write('GEMINI '+str(c)+' '+m[:160]+'\n')
    sys.exit(4 if c in (403,429) or (c==400 and 'api key' in m.lower()) else 1)
t=''.join(p.get('text','') for p in d['candidates'][0]['content']['parts'])
# Malli vuotaa joskus oman tarkistuksensa ennen vastausta (todettu 4.10.2026):
# pidetään vain viimeisestä TIIVISTELMÄ-otsikosta alkava osa.
i=t.rfind('\nTIIVISTELMÄ')
t=t[i+1:] if i>=0 else t
if not t.lstrip().startswith('TIIVISTELMÄ') or 'AIHEET' not in t:
    sys.stderr.write('MUOTO: vastaus ei noudata rakennetta\n'); sys.exit(2)
print(t)"
}

n=0
for K in "${AVAIMET[@]}"; do
  n=$((n+1))
  set +e; pyynto "$K"; r=$?; [ $r -eq 0 ] && { kutsu "$K"; r=$?; }; set -e
  [ $r -ne 4 ] && break
  [ $n -lt ${#AVAIMET[@]} ] && echo "avain $n ei käynyt (kiintiö tai oikeus), seuraava avain" >&2
done
[ -n "$AUD" ] && rm -f "$AUD"
[ $r -eq 4 ] && r=1
exit $r
