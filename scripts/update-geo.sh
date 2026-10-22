#!/usr/bin/env bash
# Descarga la base DB-IP "IP to City Lite" (CC-BY 4.0, https://db-ip.com) del mes y la deja en
# $TUBIO_DATA_DIR/geo/dbip-city-lite.mmdb. Si el mes aún no sale, prueba el anterior. Reinicia tubio si cambió.
set -euo pipefail
DATA_DIR="${TUBIO_DATA_DIR:-$(dirname "$0")/../data}"
DEST="$DATA_DIR/geo/dbip-city-lite.mmdb"
mkdir -p "$DATA_DIR/geo"
tmp=$(mktemp)
trap 'rm -f "$tmp" "$tmp.mmdb"' EXIT
for m in "$(date +%Y-%m)" "$(date -d '-1 month' +%Y-%m)"; do
  if curl -fsSL --max-time 300 "https://download.db-ip.com/free/dbip-city-lite-$m.mmdb.gz" -o "$tmp"; then
    gunzip -c "$tmp" > "$tmp.mmdb"
    # sanidad mínima: un MMDB válido pesa decenas de MB
    [ "$(stat -c %s "$tmp.mmdb")" -gt 10000000 ] || { echo "archivo sospechoso ($m)"; exit 1; }
    if [ -f "$DEST" ] && cmp -s "$tmp.mmdb" "$DEST"; then echo "sin cambios ($m)"; exit 0; fi
    mv "$tmp.mmdb" "$DEST"
    echo "actualizada: $m"
    command -v pm2 >/dev/null && pm2 restart tubio --update-env >/dev/null 2>&1 || true
    exit 0
  fi
done
echo "no se pudo descargar la base" >&2
exit 1
