# Spec (delta): session-history-integrity

> Capacidad **nueva**. Cubre el riesgo **#16**.
> Ámbito: `backend/app/presentation/api/v1/sessions.py`.
> RFC 2119. Escenarios en Given/When/Then.

## El defecto que se cierra

`sessions.py:342-345` captura cualquier excepción al cargar el historial y devuelve **200 con lista vacía**. El cliente
no puede distinguir «esta sesión no tiene mensajes» de «no he podido leerlos». El usuario abre su debate de ayer y ve
un chat vacío, como si nunca hubiera existido: la peor forma de perder el entregable, sin ruido.

---

## SH-001 — Un fallo de lectura se comunica como fallo

Cuando la carga del historial de una sesión falla por un error de infraestructura o de datos, el endpoint
**MUST** responder con un estado de error (5xx) y **MUST NOT** responder 200.

El endpoint **MUST NOT** devolver una lista de mensajes vacía para representar un fallo.

El fallo **MUST** seguir registrándose en el log del servidor con el `session_id`, como hoy.

El mensaje de error devuelto al cliente **MUST** ser presentable en castellano y **MUST NOT** contener trazas de pila ni
detalles internos de la base de datos.

#### Escenario: la base de datos falla al leer

- **Given** una sesión existente propiedad del usuario
- **And** la lectura de sus mensajes lanza una excepción
- **When** el cliente pide el historial
- **Then** la respuesta **MUST** ser 5xx
- **And** **MUST NOT** ser 200 con `messages: []`
- **And** el log **MUST** contener el `session_id` y el motivo

#### Escenario: el error no filtra interioridades

- **Given** el escenario anterior
- **When** se inspecciona el cuerpo de la respuesta
- **Then** **MUST NOT** contener trazas de pila, cadenas de conexión ni nombres de colección

---

## SH-002 — Una sesión sin mensajes sigue siendo un caso normal

El endpoint **MUST** responder 200 con `messages: []` cuando la sesión existe, pertenece al usuario y **no tiene
mensajes**. Ese caso **MUST NOT** confundirse con un fallo.

Los casos de autorización y de existencia **MUST NOT** cambiar: una sesión ajena o inexistente sigue produciendo el
mismo estado que hoy (`require_owner`, `sessions.py:322`), y ese camino **MUST NOT** quedar cubierto por SH-001.

#### Escenario: sesión recién creada

- **Given** una sesión del usuario sin ningún mensaje
- **When** el cliente pide el historial
- **Then** la respuesta **MUST** ser 200
- **And** `messages` **MUST** ser una lista vacía
- **And** **MUST NOT** registrarse ningún error

#### Escenario: una sesión ajena no cambia de comportamiento

- **Given** una sesión que pertenece a otro usuario
- **When** el cliente pide el historial
- **Then** la respuesta **MUST** ser la misma que antes de este cambio
- **And** **MUST NOT** convertirse en un 5xx

#### Escenario: el aviso de agente borrado sobrevive

- **Given** una sesión cuyo agente personalizado ya no existe
- **When** el cliente pide el historial
- **Then** la respuesta **MUST** ser 200 con `warning: "agent_deleted"`, como hoy

---

## SH-003 — La vista compartida no hereda el cambio a ciegas

`_load_session_messages` tiene un segundo consumidor (`sessions.py:561`, vista pública compartida). Ese camino
**MUST** conservar su comportamiento actual frente a un fallo de lectura: una vista pública **MUST NOT** empezar a
exponer errores de infraestructura a un visitante anónimo.

#### Escenario: la vista pública falla en silencio hacia fuera

- **Given** una sesión compartida cuya lectura de mensajes falla
- **When** un visitante anónimo la abre
- **Then** **MUST NOT** exponerse un detalle de infraestructura
- **And** el comportamiento **MUST** ser el mismo que antes de este cambio
