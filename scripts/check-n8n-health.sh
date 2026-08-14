#!/usr/bin/env bash
# check-n8n-health.sh — ¿existe la instancia de n8n, está viva, y con qué workflows?
#
# Esta es la ÚNICA fuente que responde esa pregunta (NWD-004). Ningún documento
# del repositorio debe afirmarlo: hasta ahora DEPLOY_CHECKLIST decía que faltaba
# desplegarla y DEPLOYMENT_RUNBOOK daba su URL de producción — los dos documentos
# oficiales se contradecían sobre el hecho básico.
#
# READ-ONLY: sólo hace GET /healthz y GET /api/v1/workflows. No crea, no activa,
# no modifica nada.
#
# Códigos de salida (los tres desenlaces son distinguibles A PROPÓSITO):
#   0  sana        — responde y reporta cuántos workflows esperados están activos
#   1  uso         — argumento desconocido
#   3  no sana     — hay configuración pero la instancia no responde correctamente
#   4  no determinable — falta configuración en el entorno; NO significa que no exista
#
# Nunca imprime N8N_API_KEY ni N8N_WEBHOOK_SECRET, ni siquiera parcialmente, y
# deliberadamente no activa el modo traza de bash: imprimiría la cabecera entera,
# clave incluida. Un test lo comprueba sobre el texto del script.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKFLOWS_DIR="${N8N_WORKFLOWS_DIR:-$REPO_ROOT/backend/infrastructure/n8n-workflows}"

usage() {
    cat <<'EOF'
Usage: check-n8n-health.sh [--list-expected] [-h|--help]

Responde, sin modificar nada, si la instancia de n8n está viva y cuántos de los
workflows del repositorio están presentes y activos en ella.

  --list-expected   Imprime el conjunto de workflows esperados (uno por línea),
                    derivado de los ficheros del repositorio. No usa la red.

Variables de entorno (ver scripts/infra-manifest.conf):
  N8N_BASE_URL        URL de la instancia
  N8N_API_KEY         API key de n8n (nunca se imprime)
  N8N_WORKFLOWS_DIR   Directorio de workflows (por defecto, el del repositorio)

Códigos de salida: 0 sana · 1 uso · 3 no sana · 4 no determinable
EOF
}

# Conjunto esperado: sale de los ficheros, nunca de un número escrito a mano.
# `name` es la primera clave de cada JSON, así que grep -m1 basta y no hace falta
# un parser de JSON en bash. Si dejara de serlo, el test que compara este listado
# con el que pytest deriva por su cuenta se pondría en rojo.
list_expected() {
    local fichero
    shopt -s nullglob
    for fichero in "$WORKFLOWS_DIR"/*.json; do
        grep -m1 '"name"' "$fichero" \
            | sed -E 's/.*"name"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/'
    done
    shopt -u nullglob
}

case "${1:-}" in
    "")
        ;;
    --list-expected)
        list_expected
        exit 0
        ;;
    -h|--help)
        usage
        exit 0
        ;;
    *)
        echo "❌ Argumento desconocido: '$1'" >&2
        usage >&2
        exit 1
        ;;
esac

# --- Desenlace «no determinable» -------------------------------------------
if [[ -z "${N8N_BASE_URL:-}" || -z "${N8N_API_KEY:-}" ]]; then
    echo "NO DETERMINABLE: faltan N8N_BASE_URL y/o N8N_API_KEY en el entorno."
    echo "Sin ellas este script no puede consultar nada, y no concluye nada:"
    echo "no sabe si hay instancia ni en qué estado. Configúralas y repite."
    exit 4
fi

BASE="${N8N_BASE_URL%/}"

CODIGO=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$BASE/healthz" 2>/dev/null || echo "000")
if [[ "$CODIGO" != "200" ]]; then
    echo "NO SANA: /healthz devolvió '$CODIGO' (000 = sin respuesta dentro de 5s)."
    exit 3
fi

RESPUESTA=$(curl -s --max-time 5 -H "X-N8N-API-KEY: $N8N_API_KEY" \
    "$BASE/api/v1/workflows" 2>/dev/null || echo "")
if [[ -z "$RESPUESTA" ]]; then
    echo "NO SANA: /healthz responde pero la API de workflows no devolvió nada."
    echo "Suele significar API key inválida o API pública desactivada."
    exit 3
fi

# El recuento necesita leer JSON de verdad (nombre + estado activo). Si no hay
# python3, el estado no es determinable — y decirlo es más honesto que estimarlo.
if ! command -v python3 >/dev/null 2>&1; then
    echo "NO DETERMINABLE: /healthz responde, pero sin python3 no se puede leer"
    echo "la lista de workflows para contar cuántos están activos."
    exit 4
fi

ESPERADOS=$(list_expected)
RESUMEN=$(printf '%s' "$RESPUESTA" | ESPERADOS="$ESPERADOS" python3 -c '
import json, os, sys

esperados = [n for n in os.environ.get("ESPERADOS", "").splitlines() if n.strip()]
try:
    datos = json.load(sys.stdin).get("data", [])
except Exception:
    print("ILEGIBLE")
    raise SystemExit(0)

remotos = {w.get("name"): bool(w.get("active")) for w in datos}
presentes = [n for n in esperados if n in remotos]
activos = [n for n in presentes if remotos[n]]
faltan = [n for n in esperados if n not in remotos]

print(f"{len(esperados)}|{len(presentes)}|{len(activos)}")
for n in faltan:
    print(f"AUSENTE {n}")
for n in presentes:
    if not remotos[n]:
        print(f"INACTIVO {n}")
')

if [[ "$RESUMEN" == "ILEGIBLE" ]]; then
    echo "NO SANA: la API de workflows respondió algo que no es JSON."
    exit 3
fi

CIFRAS=$(printf '%s' "$RESUMEN" | head -1)
IFS='|' read -r TOTAL PRESENTES ACTIVOS <<< "$CIFRAS"
echo "SANA: $PRESENTES de $TOTAL workflows esperados están presentes; $ACTIVOS activos."
printf '%s\n' "$RESUMEN" | tail -n +2 | sed 's/^/   /'
exit 0
