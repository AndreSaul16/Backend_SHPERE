# service-connection-test

> **Source**: pulido-lanzamiento (archived 2026-08-14)
> **TDD**: ACTIVE (pytest)

## Purpose

El catálogo de servicios conectables (`SERVICE_DEFINITIONS`) y el código que prueba sus credenciales
(`test_service_credential`) se mantienen sincronizados en los dos sentidos: ni ramas muertas que la
guarda de entrada vuelve inalcanzables, ni servicios del catálogo sin rama que probarlos. Invariante
rector: **el catálogo de servicios y el código que los prueba no pueden divergir en silencio**;
el alcance es `SERVICE_DEFINITIONS` y `test_service_credential` en
`backend/app/presentation/api/v1/auth.py`.

## Requirements

| ID | Requirement | N |
|----|------------|---|
| SCT-001 | El conjunto de servicios comparados en `test_service_credential` MUST ser **igual** al conjunto de claves de `SERVICE_DEFINITIONS`, en los dos sentidos | 3 |
| SCT-002 | El test MUST leer el código fuente real y extraer de él los literales comparados; MUST NOT limitarse a invocar el endpoint ni hacer `skip` | 2 |
| SCT-003 | Borrar una rama que la guarda ya hacía inalcanzable MUST NOT cambiar ninguna respuesta observable de la API | 2 |

### SCT-001: Las ramas del test de conexión coinciden con el catálogo

El conjunto de servicios comparados dentro de `test_service_credential` **MUST** ser **igual** al
conjunto de claves de `SERVICE_DEFINITIONS`. Igualdad en los dos sentidos, no inclusión: una rama
sin entrada en `SERVICE_DEFINITIONS` es **código inalcanzable** —la guarda de entrada responde 400
antes de llegar a ella—, y una entrada sin rama cae en el retorno final y devuelve «Test no
implementado para este servicio» a un servicio que el usuario sí puede conectar.

- GIVEN `SERVICE_DEFINITIONS` con las claves `linkedin`, `whatsapp`, `instagram` y `financial_api`
  WHEN se extraen los servicios comparados en `test_service_credential`
  THEN el conjunto extraído es exactamente ese
  AND no aparece `jules`, retirado del catálogo en `6fcdd3d`
  AND no aparece `google_calendar`, movido a OAuth en `6efbf1a`

- **Mutación**: GIVEN se añade una clave a `SERVICE_DEFINITIONS` sin escribir su rama
  WHEN se ejecuta la suite
  THEN el primer escenario **MUST** fallar
  AND el fallo nombra la clave que sobra, no un recuento

- **Mutación**: GIVEN se vuelve a añadir `elif service == "jules"` a `test_service_credential`
  WHEN se ejecuta la suite
  THEN el primer escenario **MUST** fallar nombrando `jules`
  AND si pasa, el test no observa nada y **MUST** reescribirse

### SCT-002: La guarda se comprueba leyendo el código, no llamando al endpoint

El test **MUST** leer el código fuente real de `test_service_credential` y extraer de él los
literales comparados. **MUST NOT** limitarse a invocar el endpoint y comprobar que responde 400: esa
comprobación pasa **hoy**, con las dos ramas muertas dentro, porque observa la guarda y no el código
que la guarda vuelve inalcanzable.

Si la extracción no encuentra ningún literal, el test **MUST** fallar. **MUST NOT** hacer `skip`: un
skip haría desaparecer la comprobación sin que nadie se entere.

- GIVEN el test estructural
  WHEN el patrón de extracción deja de encontrar literales
  THEN el test falla diciendo que se extrajeron 0 servicios
  AND no queda en `skipped`

- **Mutación**: GIVEN se sustituye la lectura del código fuente por una lista de servicios escrita en el propio test
  WHEN se añade una rama muerta al endpoint
  THEN la suite **pasa**
  AND eso es el fallo: un test así **MUST** rechazarse en verify

### SCT-003: Borrar código inalcanzable no cambia ninguna conducta

Eliminar una rama que la guarda ya hacía inalcanzable **MUST NOT** cambiar ninguna respuesta
observable de la API. Cualquier diferencia de conducta al borrarlas significa que la rama **no** era
inalcanzable y el borrado **MUST** revertirse.

- GIVEN una petición de test de conexión para `jules` o para `google_calendar`
  WHEN se compara la respuesta antes y después del borrado
  THEN es la misma: 400 con «Servicio no soportado»
  AND ningún test existente cambia de resultado

- GIVEN los servicios de `SERVICE_DEFINITIONS`
  WHEN se ejecuta su test de conexión
  THEN el comportamiento es idéntico al de antes del cambio
