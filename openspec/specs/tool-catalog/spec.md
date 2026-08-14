# tool-catalog

> **Source**: tools-seguridad (archived 2026-08-14)
> **TDD**: ACTIVE (pytest)

## Purpose

Garantiza que el catálogo de herramientas es un compromiso comprobable: lo que está registrado existe, se anuncia sólo si existe y tiene etiqueta humana. Alcance: `registry.py` (`get_tools_for_role`), los prompts de rol de `orchestrator.py`, `TOOL_LABELS` (`ToolExecutionCard.tsx`) y la credencial de Jules. Las 5 retiradas: `create_jules_task`, `check_jules_status`, `review_jules_output`, `get_market_analysis`, `whatsapp_read_messages`. Catálogo resultante: **23**.

## Requirements

| ID | Requirement | N |
|----|------------|---|
| TCAT-001 | Estar en el catálogo significa las cuatro cosas a la vez —registrada, esquema bindeado al LLM en el chat 1-a-1, anunciable en los prompts de rol y con etiqueta humana—; una herramienta cuyo endpoint externo no existe MUST NOT registrarse, y retirar MUST significar desregistrar y MUST NOT significar borrar el código ni los workflows n8n | 1 |
| TCAT-002 | `get_tools_for_role` MUST NOT devolver ninguna de las 5 retiradas para ningún rol, incluidos los no declarados; los prompts de rol MUST NOT mencionarlas y la credencial de Jules MUST NOT ofrecerse en la UI de servicios | 3 |
| TCAT-003 | `TOOL_LABELS` MUST cubrir el catálogo entero —toda herramienta que un rol pueda recibir MUST tener entrada y ninguna entrada MAY apuntar a una herramienta no registrada—; la comprobación MUST derivar el catálogo del registry real y MUST NOT compararlo contra una lista mantenida a mano dentro del propio test | 4 |
| TCAT-004 | Los prompts de rol MUST NOT nombrar herramientas que no estén registradas | 2 |

### TCAT-001: Estar en el catálogo es un compromiso

> Retirar es desregistrar, no borrar: el código y los workflows n8n se quedan en el repositorio para que reactivar sea un revert.

- GIVEN el registry cargado con `load_all_tools()`
  WHEN se enumeran los nombres distintos de todos los roles
  THEN son 23
  AND ninguno de los 5 nombres retirados está entre ellos

### TCAT-002: Las cinco retiradas no se ofrecen a ningún agente

- GIVEN el registry cargado
  WHEN se pide `get_tools_for_role` para CEO, CTO, CFO, CMO y para un rol arbitrario no declarado
  THEN ninguna lista contiene ninguno de los 5 nombres

- GIVEN los prompts de rol del orquestador
  WHEN se buscan los 5 nombres en su texto
  THEN no aparece ninguno

- **Mutación**: GIVEN se vuelve a registrar `get_market_analysis` para el CFO
  WHEN se ejecuta la suite
  THEN el primer escenario MUST fallar
  AND si pasa, el test no observa el registry real y MUST reescribirse

### TCAT-003: Ninguna herramienta ofrecida se queda sin etiqueta

- GIVEN el conjunto `C` de nombres del registry y el conjunto `L` de claves de `TOOL_LABELS`
  WHEN se comparan
  THEN `C - L` está vacío
  AND `L - C` está vacío

- GIVEN se registra una herramienta nueva y no se le añade etiqueta
  WHEN se ejecuta la comprobación
  THEN falla nombrando la herramienta sin etiqueta

- **Mutación**: GIVEN se elimina la entrada `calendar_delete_event` de `TOOL_LABELS`
  WHEN se ejecuta la suite
  THEN el primer escenario MUST fallar

- **Mutación** (el test que no puede fallar): GIVEN la comprobación compara `TOOL_LABELS` contra una lista literal escrita en el test
  WHEN se registra una herramienta nueva sin etiqueta
  THEN la comprobación pasa igualmente
  AND ese test MUST rechazarse en verificación: no cumple TCAT-003

### TCAT-004: Los prompts no anuncian lo que no existe

> Límite declarado: que una herramienta registrada no se anuncie es una carencia conocida y aceptada
> en este cambio (`calendar_update_event`, `calendar_delete_event` y las 7 OAuth siguen sin anunciarse);
> lo contrario —anunciar lo inexistente— MUST NOT ocurrir.

- GIVEN los nombres de herramienta citados en los prompts de rol
  WHEN se contrastan con el registry
  THEN todos están registrados

- **Mutación**: GIVEN se deja `create_jules_task` en el prompt del CTO tras desregistrarla
  WHEN se ejecuta la suite
  THEN el escenario anterior MUST fallar
