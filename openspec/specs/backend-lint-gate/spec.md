# backend-lint-gate

> **Source**: pulido-lanzamiento (archived 2026-08-14)
> **TDD**: ACTIVE (pytest)

## Purpose

El lint del backend comprueba un conjunto de reglas **enumerado y explícito** (`ruff.toml` en la
raíz), el árbol está a cero hallazgos sobre esa selección y el job `lint` de CI bloquea el merge.
Lo que deliberadamente **no** se selecciona queda justificado por escrito —con su recuento y su
motivo— dentro del propio `ruff.toml`, no en un acta que nadie abre. Invariante rector: **el lint no
afirma nada que no haya comprobado, y lo que comprueba se lee**; el alcance son `ruff.toml` (raíz),
`backend/requirements-dev.txt` y el job `lint` de `.github/workflows/ci.yml`.

## Requirements

| ID | Requirement | N |
|----|------------|---|
| BLG-001 | El repositorio MUST contener un `ruff.toml` con `select` enumerado por regla; MUST NOT usarse `select = ["ALL"]` ni el conjunto por defecto | 2 |
| BLG-002 | `B008` MUST NOT estar activa: `Depends()` es el idioma obligatorio de FastAPI, y la exclusión MUST NOT lograrse editando el código | 2 |
| BLG-003 | `ruff check backend/app` MUST terminar sin hallazgos y el job `lint` MUST NOT llevar `continue-on-error` | 3 |
| BLG-004 | La versión de ruff MUST estar fijada en un solo sitio del repositorio y MUST NOT añadirse a `backend/requirements.txt` | 2 |
| BLG-005 | Todo `try/except/pass` superviviente MUST registrar la excepción con el nivel que corresponda a su consecuencia | 4 |
| BLG-006 | Los re-exports MUST conservarse y declararse en `__all__`; los imports de efecto secundario MUST NOT eliminarse con un `RUF100 --fix` automático | 3 |
| BLG-007 | Un `datetime.now()` sin `tz` MUST pasar a `datetime.now(timezone.utc)` o llevar un `noqa` con el motivo escrito | 2 |

### BLG-001: El lint del backend tiene configuración explícita

El repositorio **MUST** contener un `ruff.toml` que declare `select` de forma **enumerada por
regla**. **MUST NOT** usarse `select = ["ALL"]` ni depender del conjunto por defecto de la
herramienta: ese conjunto cambia entre versiones y convierte el resultado del job en una función de
la fecha, no del código.

Toda familia con hallazgos en el árbol que **no** se seleccione **MUST** llevar, en el propio
`ruff.toml`, su número de hallazgos y el motivo de la exclusión en una línea.

Se seleccionan **REGLAS, no familias**: `S` o `SIM` enteras traen hallazgos que nadie ha medido, y
el objetivo es un cero honesto, no un cero grande. Criterio de admisión: la regla entra si violarla
puede producir un resultado observable equivocado, o si arreglarla es mecánico y de riesgo ~0.

Ausencias deliberadas, con su recuento y su motivo —éste es el valor de la capacidad, y por eso vive
en el `ruff.toml` y no en un acta:

| Familia | Hallazgos | Motivo de la exclusión |
|---|---|---|
| `B008` | 63 | `Depends()` en el valor por defecto es el idioma **obligatorio** de FastAPI: falso positivo puro, exclusión **permanente**. Por eso no se selecciona `B` entera (ver BLG-002) |
| `B904` | 33 | `raise ... from`: mejora la traza, no el resultado. 33 handlers |
| `UP` | 312 | `Optional[X]` → `X \| None` y equivalentes: codemod de todo el backend, cero efecto en ejecución. Se salva `UP037`, que es 1 y es mecánico |
| `I001` | 75 | Lo arregla UN `ruff check --fix`, pero toca 75 ficheros. Primer candidato en cuanto el árbol esté quieto tras el merge |
| `BLE001` | 95 | Cada `except Exception` exige decidir a qué se estrecha. Es un change propio, no una tarea suelta |

Los recuentos de la tabla son los medidos sobre el árbol final, que es lo que lleva el `ruff.toml`
del repositorio; la medición previa a los changes de `pulido-lanzamiento` daba `B904` 31, `UP` 310 y
**619** en total, y ése es el número que citan los escenarios de abajo.

- GIVEN el repositorio en `feat/lanzamiento-e2e`
  WHEN se lee `ruff.toml`
  THEN `select` enumera reglas concretas
  AND cada familia excluida con hallazgos conocidos (`B008`, `B904`, `UP`, `I001`, `BLE001`) aparece
  comentada con su recuento y su motivo

- GIVEN que sin fichero de configuración el mismo comando devuelve **45** hallazgos con ruff 0.8.6
  y **619** con ruff 0.16.3
  WHEN se evalúa si basta con no configurar nada
  THEN la respuesta es no: el resultado no depende del código
  AND por eso BLG-001 y BLG-004 son requisitos separados y ambos obligatorios

### BLG-002: `Depends()` no es un hallazgo

`B008` (`function-call-in-default-argument`) **MUST NOT** estar activa. `Depends()` en el valor por
defecto de un parámetro es el idioma **obligatorio** de FastAPI y está presente en 63 sitios; una
regla que marca el framework como error convierte el lint en ruido con autoridad.

La exclusión **MUST** conseguirse no seleccionando la familia, o seleccionándola con `B008` en
`ignore`. **MUST NOT** conseguirse editando el código para satisfacer la regla.

- GIVEN el `ruff.toml` nuevo
  WHEN se ejecuta `ruff check backend/app`
  THEN no se reporta ningún `B008`
  AND WHEN se ejecuta `ruff check backend/app --select B008`
  THEN se siguen reportando 63, porque el código no se tocó

- **Mutación**: GIVEN alguien sustituye `def f(user: dict = Depends(get_current_user))` por un patrón que evite
  la llamada en el valor por defecto
  WHEN se revisa el cambio
  THEN **MUST** rechazarse: rompe la inyección de dependencias de FastAPI para complacer a una regla
  que este documento declara inaplicable

### BLG-003: El backend está a cero y el job bloquea

Con el `ruff.toml` del repositorio, `ruff check backend/app` **MUST** terminar sin hallazgos. El job
`lint` **MUST NOT** llevar `continue-on-error`. El nombre del paso **MUST NOT** decir «no
bloqueante».

La medición del cero **MUST** hacerse sobre el árbol final —después de todos los changes que se
apliquen antes— y **MUST** repetirse una segunda vez.

- GIVEN todos los changes previos aplicados
  WHEN se ejecuta `ruff check backend/app` dos veces seguidas
  THEN las dos devuelven `All checks passed!`

- GIVEN el job ya sin `continue-on-error`
  WHEN un commit introduce una violación de una regla seleccionada
  THEN el job `lint` termina en rojo
  AND el merge queda bloqueado hasta arreglarlo

- **Mutación**: GIVEN se reintroduce `continue-on-error: true` en el job `lint`
  WHEN se introduce después una violación
  THEN CI pasa en verde con la violación dentro
  AND eso es exactamente el estado que este requisito elimina: un job en rojo perpetuo que nadie lee

### BLG-004: Una sola versión de ruff en todo el repositorio

La versión de ruff **MUST** estar fijada de forma exacta y **MUST** existir en **un solo** sitio del
repositorio. El job de CI **MUST** obtener la herramienta de ese sitio. La herramienta **MUST NOT**
añadirse a `backend/requirements.txt`: la imagen de producción no carga un linter.

- GIVEN un desarrollador con el venv del backend
  WHEN instala `backend/requirements-dev.txt`
  THEN obtiene exactamente la versión que ejecuta CI
  AND `ruff check backend/app` da el mismo resultado que el job

- **Mutación**: GIVEN la versión aparece tanto en el workflow como en el fichero de dependencias de desarrollo
  WHEN una de las dos se actualiza
  THEN el CI y el local comprueban cosas distintas sin que nadie se entere
  AND por eso el requisito exige **un** sitio, no «los mismos valores en dos sitios»

### BLG-005: Un `except` silencioso registra por qué

Todo `try/except/pass` que sobreviva en `backend/app` **MUST** registrar la excepción. El nivel
**MUST** corresponder a la consecuencia: `warning` cuando el fallo degrada una garantía operativa,
`debug` cuando la operación es best-effort declarada.

El arreglo **MUST NOT** cambiar el flujo: la excepción se sigue tragando y la función sigue
devolviendo lo mismo.

- GIVEN Redis no responde al persistir el estado del circuito
  WHEN se ejecuta la ruta que hoy hace `except Exception: pass`
  THEN se emite un registro de nivel `warning` con la excepción
  AND la función devuelve lo mismo que antes del cambio

- GIVEN el circuito está en `OPEN` y no puede leerse `updated_at`
  WHEN se evalúa si toca pasar a `HALF_OPEN`
  THEN se emite un `warning`
  AND se conserva el `return False` de hoy

- GIVEN falla la lectura o la escritura de la caché de embeddings
  WHEN se ejecuta esa ruta
  THEN el registro es de nivel `debug`, no `warning`
  AND un miss de caché no aparece como problema en los logs

- **Mutación**: GIVEN se devuelve `except Exception: pass` en la persistencia del circuito
  WHEN se ejecuta la suite
  THEN el primer escenario de este requisito **MUST** fallar

### BLG-006: Un import muerto y un re-export no son lo mismo

Un import sin uso en un módulo que existe para re-exportar **MUST** conservarse y declararse en
`__all__`. **MUST NOT** borrarse. Un import cuyo único propósito es un efecto secundario **MUST**
conservar su `# noqa` y **MUST NOT** eliminarse aplicando `RUF100` de forma automática.

La trampa concreta: un `--fix` a ciegas sobre los `# noqa: F401` de `load_all_tools()` —seis
imports que existen sólo por su efecto de registro— **vacía el catálogo de herramientas**. La única
guarda que lo caza es `test_tool_catalog.py` (TCAT-001, recuento 23); nada más lo detecta.

- GIVEN `backend/app/domain/models/__init__.py` con 14 imports sin uso local
  WHEN se resuelven sus `F401`
  THEN se resuelven declarándolos en `__all__`
  AND `from app.domain.models import <cualquiera de los 14>` sigue funcionando

- GIVEN `load_all_tools()` importa seis módulos sólo por su efecto de registro, con `# noqa: F401`
  WHEN se resuelven los `RUF100` de ese fichero
  THEN se conserva el `noqa` que sí es necesario
  AND el catálogo sigue teniendo 23 herramientas

- **Mutación**: GIVEN se elimina de `load_all_tools()` el import de `oauth_tools`
  WHEN se ejecuta la suite
  THEN `test_tool_catalog.py` **MUST** fallar por recuento de catálogo y por paridad de etiquetas
  AND ese fallo es la única señal que existe: nada más lo detecta

### BLG-007: Una fecha sin zona se corrige o se justifica

Un `datetime.now()` sin `tz` **MUST** resolverse de una de estas dos formas, nunca de una tercera:
pasar a `datetime.now(timezone.utc)` cuando el valor se almacena o se compara, o llevar un `noqa`
**con el motivo escrito** cuando la hora local es la conducta correcta.

Antes de cambiar cualquiera de ellos **MUST** verificarse si el valor se compara con fechas leídas
de Mongo: mezclar naive y aware lanza `TypeError` en tiempo de ejecución.

- GIVEN los `default_factory` de `created_at`/`updated_at` de los modelos de credenciales
  WHEN se corrigen
  THEN pasan a `datetime.now(timezone.utc)`
  AND se deja constancia de que sus clases no se instancian hoy, así que el cambio es inerte

- GIVEN el `timestamp` del formateador de logs de consola
  WHEN se evalúa el cambio
  THEN **MUST NOT** cambiarse a UTC
  AND lleva un `noqa` que dice que la hora local es deliberada, que no se persiste y que no se compara
