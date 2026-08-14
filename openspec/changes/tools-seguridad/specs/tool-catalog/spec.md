# Delta for tool-catalog

Capacidad nueva: todo es ADDED. Alcance: `registry.py` (`get_tools_for_role`), los prompts de
rol de `orchestrator.py`, `TOOL_LABELS` (`ToolExecutionCard.tsx`) y la credencial de Jules.
Las 5 retiradas: `create_jules_task`, `check_jules_status`, `review_jules_output`,
`get_market_analysis`, `whatsapp_read_messages`. Catálogo resultante: **23**.

## ADDED Requirements

### Requirement: TCAT-001 — Estar en el catálogo es un compromiso

Que una herramienta esté en el catálogo significa las cuatro cosas a la vez: está registrada,
su esquema se bindea al LLM en el chat 1-a-1, puede anunciarse en los prompts de rol y tiene
etiqueta humana. Una herramienta cuyo endpoint externo no existe o que no puede funcionar
**MUST NOT** registrarse. Retirar **MUST** significar desregistrar; **MUST NOT** significar
borrar el código ni los workflows n8n del repositorio, para que reactivar sea un revert.

#### Scenario: El catálogo tiene el tamaño declarado

- GIVEN el registry cargado con `load_all_tools()`
- WHEN se enumeran los nombres distintos de todos los roles
- THEN son 23
- AND ninguno de los 5 nombres retirados está entre ellos

### Requirement: TCAT-002 — Las cinco retiradas no se ofrecen a ningún agente

`get_tools_for_role` **MUST NOT** devolver ninguna de las 5 para ningún rol, incluidos los
roles no declarados que heredan las compartidas. Los prompts de rol **MUST NOT** mencionarlas.
La credencial de Jules **MUST NOT** ofrecerse en la UI de servicios.

#### Scenario: Ningún rol las recibe

- GIVEN el registry cargado
- WHEN se pide `get_tools_for_role` para CEO, CTO, CFO, CMO y para un rol arbitrario no declarado
- THEN ninguna lista contiene ninguno de los 5 nombres

#### Scenario: Los prompts tampoco las anuncian

- GIVEN los prompts de rol del orquestador
- WHEN se buscan los 5 nombres en su texto
- THEN no aparece ninguno

#### Scenario: Mutación — dejar una registrada debe romper la suite

- GIVEN se vuelve a registrar `get_market_analysis` para el CFO
- WHEN se ejecuta la suite
- THEN el primer escenario **MUST** fallar
- AND si pasa, el test no observa el registry real y **MUST** reescribirse

### Requirement: TCAT-003 — Ninguna herramienta ofrecida se queda sin etiqueta

`TOOL_LABELS` **MUST** cubrir el catálogo entero: toda herramienta que un rol pueda recibir
**MUST** tener entrada, y ninguna entrada **MAY** apuntar a una herramienta no registrada.
La comprobación **MUST** derivar el catálogo del registry real; **MUST NOT** compararlo contra
una lista de nombres mantenida a mano dentro del propio test, porque entonces añadir una
herramienta nueva sin etiqueta no haría fallar nada.

#### Scenario: Paridad en los dos sentidos

- GIVEN el conjunto `C` de nombres del registry y el conjunto `L` de claves de `TOOL_LABELS`
- WHEN se comparan
- THEN `C - L` está vacío
- AND `L - C` está vacío

#### Scenario: Herramienta nueva sin etiqueta

- GIVEN se registra una herramienta nueva y no se le añade etiqueta
- WHEN se ejecuta la comprobación
- THEN falla nombrando la herramienta sin etiqueta

#### Scenario: Mutación — quitar una etiqueta debe romper la suite

- GIVEN se elimina la entrada `calendar_delete_event` de `TOOL_LABELS`
- WHEN se ejecuta la suite
- THEN el primer escenario **MUST** fallar

#### Scenario: Mutación — el test que no puede fallar

- GIVEN la comprobación compara `TOOL_LABELS` contra una lista literal escrita en el test
- WHEN se registra una herramienta nueva sin etiqueta
- THEN la comprobación pasa igualmente
- AND ese test **MUST** rechazarse en verificación: no cumple TCAT-003

### Requirement: TCAT-004 — Los prompts no anuncian lo que no existe

Los prompts de rol **MUST NOT** nombrar herramientas que no estén registradas. Que una
herramienta registrada no se anuncie es una carencia conocida y aceptada en este cambio
(`calendar_update_event`, `calendar_delete_event` y las 7 OAuth siguen sin anunciarse), pero
lo contrario —anunciar lo inexistente— **MUST NOT** ocurrir.

#### Scenario: Todo nombre anunciado existe

- GIVEN los nombres de herramienta citados en los prompts de rol
- WHEN se contrastan con el registry
- THEN todos están registrados

#### Scenario: Mutación — dejar una mención huérfana

- GIVEN se deja `create_jules_task` en el prompt del CTO tras desregistrarla
- WHEN se ejecuta la suite
- THEN el escenario anterior **MUST** fallar
