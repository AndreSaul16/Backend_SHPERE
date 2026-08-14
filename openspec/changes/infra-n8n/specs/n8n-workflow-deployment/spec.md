# Delta for n8n-workflow-deployment

Capacidad nueva: todo es ADDED. Cubre `n8n_deployer.py` —el módulo que decide si los 18
workflows llegan a producción y que hoy tiene **0 líneas ejecutadas** por 338 tests— y la
verificación read-only del estado real de la instancia.

## ADDED Requirements

### Requirement: NWD-001 — Despliegue idempotente, verificable sin instancia real

El despliegue de arranque (`deploy_all_workflows`, invocado desde el lifespan) **MUST** ser
idempotente sobre la API pública de n8n: crear el workflow si no existe, actualizarlo si su
contenido difiere (`nodes`/`connections`/`settings`), no tocarlo si es idéntico, y activarlo si
está inactivo.

El contrato **MUST** ser verificable **sin instancia real**, sustituyendo el transporte HTTP
(`httpx.MockTransport`). **MUST NOT** exigirse una instancia viva ni un porcentaje de cobertura.
Un fallo de autenticación (401) **MUST** registrarse y **MUST NOT** abortar el arranque del backend.

| Estado remoto | Acción MUST |
|---|---|
| No existe | crear + activar |
| Existe y difiere | actualizar + reactivar si quedó inactivo |
| Existe e idéntico | no enviar `PUT` |
| API devuelve 401 | log de error, sin excepción propagada al lifespan |

#### Scenario: Idéntico no se reescribe

- GIVEN un workflow remoto cuyos `nodes`, `connections` y `settings` coinciden con el JSON local
- WHEN corre el despliegue
- THEN no se emite ninguna petición de actualización para ese workflow

#### Scenario: Difiere y se sincroniza

- GIVEN el mismo workflow con un nodo distinto en el remoto
- WHEN corre el despliegue
- THEN se emite la actualización con el contenido local

#### Scenario: Mutación — romper la comparación

- GIVEN se fuerza `_workflow_differs` a devolver siempre `True`
- WHEN se ejecuta la suite
- THEN el escenario «idéntico no se reescribe» **MUST** fallar

### Requirement: NWD-002 — Un solo worker despliega

Con varios workers de uvicorn ejecutando el lifespan, **exactamente uno** **MUST** desplegar; el
resto **MUST** hacer no-op sin error. n8n no impone unicidad de nombre, así que sin esto se crean
N copias de cada workflow.

#### Scenario: Segunda invocación es no-op

- GIVEN un despliegue ya en curso (lock tomado)
- WHEN otro worker ejecuta el despliegue
- THEN no emite ninguna petición de creación y termina sin excepción

#### Scenario: Mutación — quitar el lock

- GIVEN se elimina la adquisición del lock
- WHEN se ejecuta la suite
- THEN el escenario anterior **MUST** fallar

### Requirement: NWD-003 — El despliegue no se expone a los agentes

Ningún tool del registry ni ninguna ruta de `app/presentation/` **MAY** instanciar `N8NDeployer`
ni permitir que el contenido de un workflow provenga de un LLM. Decisión con causa verificada:
`NODE_FUNCTION_ALLOW_BUILTIN=crypto` y `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` son obligatorias para
que la verificación HMAC funcione, y juntas convierten un workflow escrito por un LLM en lectura de
`$env` — es decir, exfiltración de `N8N_WEBHOOK_SECRET` y de las credenciales del entorno n8n.

El código muerto que insinúa esa superficie (`ensure_workflow()`, `n8n_deployer.py:314-342`, cero
llamadores) **MUST** eliminarse. La restricción **MUST** ser una comprobación ejecutable, no una
nota en un documento.

#### Scenario: El deployer no tiene llamadores en la capa de presentación

- GIVEN el árbol de `backend/app/`
- WHEN se ejecuta la comprobación estructural
- THEN el único llamador de `deploy_all_workflows` es el lifespan de arranque
- AND ningún módulo bajo `app/presentation/` ni `app/infrastructure/tools/` importa `N8NDeployer`

#### Scenario: Mutación — exponerlo como ruta o tool

- GIVEN se añade una ruta o un tool que importa `N8NDeployer`
- WHEN se ejecuta la suite
- THEN el escenario anterior **MUST** fallar

### Requirement: NWD-004 — El estado de la instancia lo responde un script, no un documento

`scripts/check-n8n-health.sh` **MUST** ser la única fuente que responda si la instancia existe,
está sana y tiene los workflows activos. **MUST** ser read-only (sólo lecturas: `/healthz` y
`GET /api/v1/workflows`) y **MUST NOT** crear, activar ni modificar nada.

**MUST** distinguir tres desenlaces con códigos de salida distintos:

| Desenlace | Cuándo |
|---|---|
| **No determinable** | Falta `N8N_BASE_URL` o `N8N_API_KEY` en el entorno |
| **Inalcanzable / no sana** | Hay configuración pero `/healthz` no responde correctamente |
| **Sana** | Responde, y reporta cuántos de los workflows esperados están presentes y activos |

Ausencia de configuración **MUST NOT** reportarse como «la instancia no existe».
El script **MUST NOT** imprimir `N8N_API_KEY` ni `N8N_WEBHOOK_SECRET` en ninguna salida, ni
siquiera parcialmente. El conjunto de workflows esperados **MUST** derivarse de los ficheros JSON
de `backend/infrastructure/n8n-workflows/`; **MUST NOT** estar escrito a mano en el script.

#### Scenario: Sin configuración no se concluye nada

- GIVEN `N8N_BASE_URL` y `N8N_API_KEY` sin definir
- WHEN se ejecuta el script
- THEN el desenlace es «no determinable» y su código de salida se distingue del de «no sana»
- AND la salida no afirma que la instancia exista ni que no exista

#### Scenario: El recuento sigue a los ficheros

- GIVEN los 18 JSON de workflows del repositorio
- WHEN se calcula el conjunto esperado
- THEN sale de los ficheros presentes en ese directorio

#### Scenario: Mutación — número escrito a mano

- GIVEN se añade o elimina un fichero de workflow
- WHEN se ejecuta la comprobación del conjunto esperado
- THEN refleja el nuevo recuento sin editar el script
- AND si el script codifica el 18 literal, la comprobación **MUST** fallar

#### Scenario: Mutación — filtrar el secreto

- GIVEN se añade una traza que imprime `N8N_API_KEY`
- WHEN se ejecuta la comprobación de la salida del script
- THEN **MUST** fallar
