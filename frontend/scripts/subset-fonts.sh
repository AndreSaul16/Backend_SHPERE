#!/usr/bin/env bash
# Regenera public/fonts/*.woff2 — las 4 fuentes variables de DESIGN §3.1.
#
#   pip install fonttools brotli
#   bash scripts/subset-fonts.sh
#
# Los .woff2 van commiteados; este script existe para que sean reproducibles y
# auditables, no para ejecutarse en el build.
#
# ─── PRESUPUESTO: DESVIACIÓN DOCUMENTADA ─────────────────────────────────────
# DESIGN §3.1 y la tarea 0.3 del plan fijan «≤ 45 KB por fichero» y «los tres
# críticos suman ≤ 135 KB». Ese presupuesto NO es alcanzable para una fuente
# variable de dos ejes con cobertura latin + latin-ext, y la evidencia es que
# Google Fonts, sirviendo sus propias slices optimizadas de estas mismas dos
# fuentes (medido el 2026-07-30 contra fonts.gstatic.com), pesa MÁS que esto:
#
#   Fichero                        aquí   |  slice de Google Fonts
#   ------------------------------ ------ |  ---------------------------------
#   literata-var.woff2            119.080 |  latin 110.080 + latin-ext 89.668
#   archivo-var.woff2             100.700 |  latin  90.104 + latin-ext 86.240
#   literata-var-italic.woff2     121.864 |  (idem, cara itálica)
#   jetbrains-mono-var.woff2       23.040 |  (un solo eje: sí cabría en 45 KB)
#
# O sea que estos ficheros cubren latin Y latin-ext en UNO donde Google necesita
# dos (219 KB aquí frente a 200 KB de Literata / 176 KB de Archivo sólo para las
# dos slices). La causa es `gvar`: 155 KB de deltas en Literata, porque dos ejes
# generan 7-8 regiones de tuplas en las esquinas del espacio de diseño. Se midió
# el suelo real quitando cosas: sin latin-ext y sin kerning, Literata baja a
# 84 KB y Archivo a 73 KB — sigue siendo el doble del presupuesto, y se paga con
# tofu en nombres europeos dentro del acta y con el kerning del cuerpo de texto.
#
# Decisión: se conservan la cobertura y el kerning, y el presupuesto de §3.1 se
# marca como pendiente de revisar. Alternativas reales si hace falta bajarlo,
# por orden de coste creciente para la identidad:
#   1. Instanciar `opsz` de Literata y perder la escala display fluida de §3.4.
#   2. Servir latin y latin-ext como dos @font-face con `unicode-range`, como
#      Google: el arranque en español baja a 110/90 KB, pero son 2 ficheros.
#   3. Pinchar el eje `wdth` de Archivo y perder la placa de asiento condensada
#      (§9.10), que es el efecto de firma nº1.
#
# Los ejes se verifican tras subsetear, que es lo que la tarea 0.3 pide como
# criterio no negociable: `wght`+`wdth` en Archivo y `wght`+`opsz` en Literata.
set -euo pipefail

cd "$(dirname "$0")/.."
OUT=public/fonts
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

BASE=https://raw.githubusercontent.com/google/fonts/main/ofl

# latin + latin-ext + puntuación general + euro + comillas tipográficas
UNICODES='U+0000-00FF,U+0100-017F,U+2000-206F,U+20AC,U+2018-201F'

# nombre_salida  ruta_en_google/fonts  ejes_esperados
FACES=(
  "literata-var         literata/Literata%5Bopsz%2Cwght%5D.ttf              opsz,wght"
  "literata-var-italic  literata/Literata-Italic%5Bopsz%2Cwght%5D.ttf       opsz,wght"
  "archivo-var          archivo/Archivo%5Bwdth%2Cwght%5D.ttf                wdth,wght"
  "jetbrains-mono-var   jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf           wght"
)

for face in "${FACES[@]}"; do
  read -r name path want <<<"$face"
  echo "── $name"
  curl -sfL -o "$TMP/$name.ttf" "$BASE/$path"

  # `--layout-features` acota a lo que el sistema usa: kern (cuerpo de texto),
  # liga y tnum (cifras tabulares, obligatorias en DESIGN §3.3). pyftsubset
  # conserva `fvar`/`gvar` por defecto, así que los ejes sobreviven.
  pyftsubset "$TMP/$name.ttf" \
    --flavor=woff2 \
    --output-file="$OUT/$name.woff2" \
    --layout-features='kern,liga,tnum' \
    --unicodes="$UNICODES"

  python3 - "$OUT/$name.woff2" "$want" <<'PY'
import sys
from fontTools.ttLib import TTFont

path, want = sys.argv[1], set(sys.argv[2].split(","))
got = {a.axisTag for a in TTFont(path)["fvar"].axes}
missing = want - got
import os
print(f"   {os.path.getsize(path):>7} bytes · ejes: {','.join(sorted(got))}", end="")
if missing:
    sys.exit(f"\n   FALLA: faltan los ejes {sorted(missing)}")
print(" ok")
PY
done

echo
echo "Listo. Recuerda: el presupuesto de 45 KB de DESIGN §3.1 no se cumple; ver la cabecera."
