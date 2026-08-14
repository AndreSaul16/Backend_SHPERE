# Nota de archivo — auditorías, no un change

**Archivado**: 2026-08-14 · **Sufijo `-auditorias` a propósito.**

`lanzamiento-v1` nunca fue un ciclo SDD: es el **material de auditoría** del que nacieron
los seis changes del lanzamiento. No tiene `proposal.md`, ni `tasks.md`, ni deltas, así
que **no se ha sincronizado nada** a `openspec/specs/` — no hay requisitos que promover.

Se conserva porque es la evidencia citada como «Base:» en la cabecera de casi todas las
propuestas del lanzamiento:

| Documento | Alimentó a |
|---|---|
| `auditoria-guardarrailes.md` | `lanzamiento-p0` (#1-4, #9-11, #19) y `artefactos-guardarrailes` (#6, #8, #12-18, #21) |
| `auditoria-herramientas.md` | `tools-seguridad` (S1-S6) |
| `auditoria-n8n.md` | `infra-n8n` (N4-N8) |
| `decision-tools-en-junta.md` | `junta-honesta` (§8, fases F0 y F0b) |
| `alcance-prometido.md`, `delta-produccion.md` | encuadre del lanzamiento |

Varias afirmaciones de estas auditorías **caducaron** durante la ejecución y fueron
corregidas dentro de los changes que las citan (§«Correcciones a la auditoría» de
`artefactos-guardarrailes/proposal.md` e `infra-n8n/proposal.md`). Léanse siempre junto a
esas correcciones, nunca solas.
