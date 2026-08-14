# Tareas — Viveza-2 (segunda tanda del Pulido v3.1)

Baseline: `a8619dc`, frontend 1081 passed / 124 files.
Entrega: un solo tramo (lo fija el prompt del orquestador: 3-4 commits lógicos, sin push).

## Fase 1 · §8.12 Odómetro de cifras

- [x] 1.1 RED/GREEN `Odometro.tsx`: rueda al cambiar el valor, sin timers
- [x] 1.2 RED/GREEN `Odometro.tsx`: `prefers-reduced-motion` → cambio seco + señal de latón
- [x] 1.3 Aplicarlo al saldo de créditos (cabecera y BillingPage)
- [x] 1.4 Aplicarlo al recuento de votos de la junta

## Fase 2 · §8.9 Latido de actuación + auditoría de bucles (§7.4)

- [x] 2.1 RED/GREEN latido one-shot al arrancar la herramienta en `ToolExecutionCard`
- [x] 2.2 Barra indeterminada sólo mientras la herramienta está en vuelo
- [x] 2.3 Auditoría de bucles de la superficie del chat y consolidación
- [x] 2.4 Nota del cálculo en DESIGN §7.4

## Fase 3 · §8.8 Pluma del acta

- [x] 3.1 Contador de chunks reales en el almacén de artefactos
- [x] 3.2 RED/GREEN la regla avanza con chunks inyectados y NO con el paso del tiempo
- [x] 3.3 Al cerrar el artefacto la regla se completa y da paso al sello

## Fase 4 · §8.7 Telégrafo de actuaciones

- [ ] 4.1 Registro de actuaciones en el almacén, escrito por onToolStart/Result/Error
- [ ] 4.2 RED/GREEN `RegistroActuaciones.tsx`: role=log, aria-live=polite, entradas por handler real
- [ ] 4.3 RED/GREEN en reposo no renderiza animación
- [ ] 4.4 Montarlo en la cabecera del panel de artefactos

## Fase 5 · Mutaciones

- [ ] 5.1 m1 pluma movida por setInterval → test de la pluma en rojo
- [ ] 5.2 m2 latido con iteración infinita → test del latido en rojo
- [ ] 5.3 m3 odómetro ignora reduced-motion → test del odómetro en rojo
