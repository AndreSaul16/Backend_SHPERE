#!/usr/bin/env bash
# check-monorepo-invariants.sh — Guard contra contaminación de la raíz del monorepo.
#
# SPHERE es un monorepo LOCAL pero DOS repos de GitHub separados:
#   - Backend_SHPERE  (backend/)
#   - Frontend_SPHERE (frontend/)
#
# Ambos reciben el árbol COMPLETO en cada push, así que lo que vive en la raíz
# afecta a los dos servicios. Este guard verifica que no hay nada ahí que deba
# estar acotado por servicio.
#
# Las reglas NO se escriben aquí: viven en scripts/infra-manifest.conf (IN-002),
# que es también lo que lee la suite de backend. Añadir una línea allí basta para
# que ambos la apliquen; reescribirla a mano aquí pone en rojo el meta-test
# test_manifiesto_es_el_unico_origen — que es justo como el guard y la suite
# llegaron a contradecirse.
#
# Salida legible por máquina (IN-003):
#   INVARIANTS root=PASS|FAIL scoping=PASS|FAIL|SKIP
# Los dos resultados son independientes a propósito: hoy el scoping falla por un
# workflow ajeno a este cambio, y sin separarlos «la raíz está limpia» no sería
# afirmable.
#
# Exit codes:  0 = limpio, 1 = error de argumentos, 2 = violaciones encontradas
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MANIFEST="$REPO_ROOT/scripts/infra-manifest.conf"
ROOT_VIOLATIONS=0
SCOPING_VIOLATIONS=0
ONLY="all"

# Ficheros que nunca se barren (dependencias, no código del repo).
PRUNE_DIRS=(".git" ".venv" "node_modules" "__pycache__")

# --- Lectura del manifiesto -------------------------------------------------

is_comment() {
    # $1 = campo kind ya leído
    [[ -z "${1// /}" || "${1:0:1}" == "#" ]]
}

manifest_values() {
    # $1 = kind, $2 = scope (opcional; vacío = cualquiera)
    local want_kind="$1" want_scope="${2:-}"
    local kind scope value note
    while IFS='|' read -r kind scope value note; do
        if is_comment "$kind"; then continue; fi
        if [[ "$kind" != "$want_kind" ]]; then continue; fi
        if [[ -n "$want_scope" && "$scope" != "$want_scope" ]]; then continue; fi
        echo "$value"
    done < "$MANIFEST"
}

usage() {
    cat <<'EOF'
Usage: check-monorepo-invariants.sh [--only root|scoping] [-h|--help]

Verifica que la configuración de la raíz está acotada por servicio.

Comprueba:
  - scoping : workflows de .github/workflows/ sin filtro de rutas
  - root    : ficheros prohibidos en la raíz e instrucciones prohibidas en
              cualquier Dockerfile del repositorio

--only root|scoping ejecuta sólo ese bloque y su código de salida refleja
únicamente ese resultado (pensado para un gate de CI parcial).

Exit codes:  0 = limpio, 1 = error de argumentos, 2 = violaciones encontradas
EOF
    echo ""
    echo "Reglas declaradas en ${MANIFEST#"$REPO_ROOT"/}:"
    local kind scope value note etiqueta
    while IFS='|' read -r kind scope value note; do
        if is_comment "$kind"; then continue; fi
        etiqueta="$kind"
        if [[ -n "$scope" && "$scope" != "-" ]]; then etiqueta="$kind/$scope"; fi
        echo "   • [$etiqueta] $value — $note"
    done < "$MANIFEST"
}

# --- Argumentos -------------------------------------------------------------

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)
            usage
            exit 0
            ;;
        --only)
            shift
            case "${1:-}" in
                root|scoping) ONLY="$1" ;;
                *)
                    echo "❌ Valor inválido para --only: '${1:-}' (usa root o scoping)" >&2
                    exit 1
                    ;;
            esac
            ;;
        *)
            echo "❌ Argumento desconocido: '$1'" >&2
            usage >&2
            exit 1
            ;;
    esac
    shift
done

# --- Comprobaciones ---------------------------------------------------------

check_scoping() {
    echo "── scoping: workflows de .github/workflows/ ──"
    if [[ ! -d "$REPO_ROOT/.github/workflows" ]]; then
        echo "   ✅ no hay workflows en la raíz"
        return 0
    fi
    local wf wfname unscoped=0
    for wf in "$REPO_ROOT/.github/workflows"/*.yml "$REPO_ROOT/.github/workflows"/*.yaml; do
        [[ -f "$wf" ]] || continue
        wfname=$(basename "$wf")
        if grep -q "paths:" "$wf" 2>/dev/null; then
            echo "   ✅ $wfname — acotado por rutas"
        else
            echo "   ⚠️  $wfname — sin filtro de rutas (correría en AMBOS repos)"
            unscoped=$((unscoped + 1))
        fi
    done
    if [[ $unscoped -gt 0 ]]; then
        echo "   ❌ $unscoped workflow(s) sin acotar."
        echo "      POR QUÉ: un workflow sin rutas corre en Backend_SHPERE y en"
        echo "      Frontend_SPHERE en cada push; un check fallando en el repo"
        echo "      equivocado reproduce el incidente de deploys SKIPPED."
        SCOPING_VIOLATIONS=$((SCOPING_VIOLATIONS + unscoped))
    fi
}

check_root_files() {
    echo "── root: ficheros prohibidos en la raíz ──"
    local kind scope value note encontrados
    while IFS='|' read -r kind scope value note; do
        if is_comment "$kind"; then continue; fi
        case "$kind" in
            root_forbidden)
                if [[ -e "$REPO_ROOT/$value" ]]; then
                    echo "   ❌ $value — $note"
                    ROOT_VIOLATIONS=$((ROOT_VIOLATIONS + 1))
                else
                    echo "   ✅ sin $value"
                fi
                ;;
            root_forbidden_glob)
                encontrados=$(find "$REPO_ROOT" -maxdepth 1 -name "$value" 2>/dev/null || true)
                if [[ -n "$encontrados" ]]; then
                    echo "   ❌ $value — $note"
                    local f
                    for f in $encontrados; do echo "      • $(basename "$f")"; done
                    ROOT_VIOLATIONS=$((ROOT_VIOLATIONS + 1))
                else
                    echo "   ✅ sin $value"
                fi
                ;;
        esac
    done < "$MANIFEST"
}

check_dockerfiles() {
    echo "── root: instrucciones prohibidas en Dockerfiles ──"
    # Qué ficheros son Dockerfiles lo define el mismo patrón que la raíz prohíbe:
    # no se escribe aquí para no duplicar el manifiesto.
    local prune=() d
    for d in "${PRUNE_DIRS[@]}"; do prune+=(-name "$d" -prune -o); done

    local patrones instrucciones patron df instruccion encontrados=0
    patrones=$(manifest_values root_forbidden_glob)
    instrucciones=$(manifest_values dockerfile_forbidden)

    # while-read y no `for patron in $patrones`: sin comillas, bash expandiría el
    # patrón contra el directorio actual antes de dárselo a find.
    while IFS= read -r patron; do
        [[ -n "$patron" ]] || continue
        while IFS= read -r df; do
            [[ -n "$df" ]] || continue
            encontrados=$((encontrados + 1))
            while IFS= read -r instruccion; do
                [[ -n "$instruccion" ]] || continue
                if grep -qE "^[[:space:]]*${instruccion}[[:space:]]" "$df"; then
                    echo "   ❌ ${df#"$REPO_ROOT"/} declara $instruccion"
                    ROOT_VIOLATIONS=$((ROOT_VIOLATIONS + 1))
                fi
            done <<< "$instrucciones"
        done < <(find "$REPO_ROOT" "${prune[@]}" -type f -name "$patron" -print 2>/dev/null || true)
    done <<< "$patrones"

    if [[ $encontrados -eq 0 ]]; then
        echo "   ⚠️  ningún fichero coincidió con los patrones del manifiesto"
    else
        echo "   ✅ $encontrados fichero(s) inspeccionado(s)"
    fi
}

# --- Ejecución --------------------------------------------------------------

echo "=== SPHERE Monorepo Invariant Check ==="
echo "   Root:     $REPO_ROOT"
echo "   Manifest: ${MANIFEST#"$REPO_ROOT"/}"
echo ""

if [[ ! -f "$MANIFEST" ]]; then
    echo "❌ No se encuentra el manifiesto: $MANIFEST" >&2
    exit 2
fi

ROOT_STATUS="SKIP"
SCOPING_STATUS="SKIP"

if [[ "$ONLY" == "all" || "$ONLY" == "scoping" ]]; then
    check_scoping
    echo ""
    if [[ $SCOPING_VIOLATIONS -eq 0 ]]; then SCOPING_STATUS="PASS"; else SCOPING_STATUS="FAIL"; fi
fi

if [[ "$ONLY" == "all" || "$ONLY" == "root" ]]; then
    check_root_files
    check_dockerfiles
    echo ""
    # root NO se contamina con el resultado de scoping: son contadores distintos.
    if [[ $ROOT_VIOLATIONS -eq 0 ]]; then ROOT_STATUS="PASS"; else ROOT_STATUS="FAIL"; fi
fi

echo "=== Result ==="
echo "INVARIANTS root=$ROOT_STATUS scoping=$SCOPING_STATUS"

case "$ONLY" in
    root)    TOTAL=$ROOT_VIOLATIONS ;;
    scoping) TOTAL=$SCOPING_VIOLATIONS ;;
    *)       TOTAL=$((ROOT_VIOLATIONS + SCOPING_VIOLATIONS)) ;;
esac

if [[ $TOTAL -eq 0 ]]; then
    echo "✅ Sin violaciones en el alcance comprobado ($ONLY)."
    exit 0
fi
echo "❌ $TOTAL violación(es) en el alcance comprobado ($ONLY)."
exit 2
