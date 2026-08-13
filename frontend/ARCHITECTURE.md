# Arquitectura del frontend de SPHERE

> **Reescrito el 8 de agosto de 2026** (tarea 7.8 · D39 del `PLAN_REFACTOR_FRONTEND_V3.md`).
>
> La versión anterior de este fichero describía `src/shared/ui/`, `features/chat`,
> `features/auth`, `widgets/` e **interceptores de Axios**. Nada de eso existía ni
> había existido nunca: no hay `axios` en `package.json`, no hay una sola carpeta
> `features/`, y su regla estrella —«ningún componente de React llama directamente
> a `fetch()`»— la incumplían cinco ficheros. Era el documento más peligroso del
> repositorio porque parecía autoritativo y mandaba al siguiente lector a buscar
> carpetas inexistentes.
>
> Lo que sigue describe **lo que hay**. Cada afirmación se puede comprobar con un
> `ls` o un `grep`, y donde algo es una regla y no una descripción, se dice.

---

## 1. Lo que es esto

Una SPA de React 19 + TypeScript servida por Vite 7. Habla con un backend FastAPI
por REST y recibe las respuestas de los agentes por **SSE** (nunca WebSockets).
La autenticación es Firebase Auth en el cliente; el backend valida el JWT.

**No hay renderizado en servidor, no hay Next.js, no hay monorepo.** El frontend
es esta carpeta y se despliega como estáticos detrás de nginx.

---

## 2. El árbol, tal cual

```
src/
├── App.tsx              Las 13 rutas y sus guardas. Nada más.
├── main.tsx             Monta la app. Pinta el tema ANTES del primer render.
├── index.css            TODO el sistema de diseño: los tokens en @theme.
├── components/
│   ├── agents/          Base de conocimiento de un agente
│   ├── artifacts/       El panel de artefactos y sus cinco visores
│   ├── auth/            El armazón compartido de entrar / registrarse
│   ├── chat/            El transcript, el compositor, la mesa y el rail
│   ├── common/          Avisos transversales (conexión, error global)
│   ├── layout/          MainLayout: el shell de tres columnas
│   ├── modals/          Diálogos con lógica propia (asistente de agentes…)
│   ├── shared/          Fronteras de error y piezas sin dueño claro
│   ├── sidebar/         El historial de juntas
│   └── ui/              LOS PRIMITIVOS. Ver §4.
├── contexts/            auth.ts (contexto + hook) y AuthContext.tsx (proveedor)
├── hooks/               Ganchos reutilizables, uno por fichero
├── lib/                 Lógica sin React: tema, atajos, resaltado, errores…
├── pages/               Una carpeta o un fichero por ruta
├── services/            api.ts (el cliente) y errorHandler.ts (la traducción)
├── store/               Zustand. Ver §3.
├── types/               Los tipos del dominio (index.ts) y los de la red (api.ts)
└── utils/               Funciones puras de dominio (parseo del acta, export…)
```

**La regla que sí se cumple y por la que se separan `lib/` y `hooks/`:** en `lib/`
no se importa React. Eso permite llamar a `lib/tema.ts` desde `main.tsx` antes de
que exista un árbol de componentes, y probar esa lógica sin montar nada.

**La regla que separa `.ts` de `.tsx`:** un fichero que exporta un componente no
exporta nada más. No es estética: Vite pierde el refresco en caliente en cuanto un
`.tsx` exporta una función o una constante junto al componente, y recarga la
página entera perdiendo el estado. Por eso existen `buttonStyles.ts` al lado de
`Button.tsx`, `cardStyles.ts`, `fieldStyles.ts`, `mermaidTheme.ts` y
`contexts/auth.ts`. El lint lo vigila (`react-refresh/only-export-components`).

---

## 3. El estado

Tres almacenes de Zustand, sin `redux`, sin `context` de estado:

| Almacén | Qué guarda |
|---|---|
| `store/useChatStore.ts` | **Es un barrel de 58 líneas.** La lógica vive troceada en `store/chat/` |
| `store/useBillingStore.ts` | Plan, saldo, paywall, `stripe_configured` |
| `store/useBoardSettingsStore.ts` | Ajustes de la junta (activada, abogado del diablo) |

`store/chat/` está partido por responsabilidad (tarea 7.1 · D40 — antes era un
solo fichero de 1267 líneas):

```
types.ts           El contrato: el estado y todas las acciones
agentsSlice.ts     Directores de fábrica y agentes a medida
sessionsSlice.ts   Crear, listar, abrir y borrar juntas
messagesSlice.ts   Enviar, transmitir, regenerar, interrumpir
artifactsSlice.ts  Los artefactos y cuál está abierto
boardSlice.ts      El estado vivo del debate (fases, votos, consenso)
uiSlice.ts         Los interruptores del shell
errorsSlice.ts     `errorStates` por contexto
agentCatalog.ts    Los cinco directores y sus colores
historyMapper.ts   Del historial del backend al modelo del hilo
sessionIdentity.ts Quién habla en una sesión (el P0 F2)
streamHandlers.ts  Los manejadores de los eventos SSE del chat
boardStreamHandlers.ts  Los del debate
streamContext.ts   El contexto que comparten los dos anteriores
boardSession.ts    La forma del war-room
resetState.ts      Volver a fábrica al cerrar sesión
```

**Regla de suscripción, y no es opcional:** nadie hace
`const { a, b } = useChatStore()`. Se usa **un selector atómico por campo**
(`useChatStore((s) => s.sessions)`) o `useShallow` si hace falta una lista. La
razón está medida: con la suscripción al store entero, un token de streaming
repintaba el árbol completo sesenta veces por segundo. **No hay React Compiler en
este proyecto**, así que la memoización (`memo`, `useMemo`, `useCallback`) es
manual y obligatoria.

---

## 4. Los primitivos de interfaz

`components/ui/` es la capa compartida. Los componentes de ahí **no saben del
dominio**: no importan el store ni los servicios.

| Pieza | Qué resuelve |
|---|---|
| `Button.tsx` + `buttonStyles.ts` | Las 5 variantes de §9.1 y sus 6 estados |
| `Field.tsx` + `fieldStyles.ts` | `TextField`, `PasswordField`, `TextAreaField`, `SelectField` |
| `cardStyles.ts` | `panelClass()`: el panel de e2 con filete |
| `Modal.tsx`, `ConfirmDialog.tsx` | Diálogo con foco atrapado y `role="dialog"` |
| `Toast.tsx` + `lib/toastBus.ts` | **El único** sistema de avisos |
| `InlineError.tsx` | Un fallo de sección con su salida |
| `EstadoVacio.tsx` | El hueco con glifo, frase y acción |
| `Esqueleto.tsx` | La espera con la FORMA de lo que viene |
| `BarraDeGuardado.tsx` | La barra adherida de un formulario largo |
| `UnsavedGuardDialog.tsx` | La guarda de cambios sin guardar |
| `CommandPalette.tsx`, `ShortcutSheet.tsx` | ⌘K y la hoja de `?` |
| `ConmutadorDeTema.tsx` | Los tres estados del tema |
| `AvatarImage.tsx`, `Pista.tsx` | Imagen con respaldo, pista de primera vez |

Fuentes únicas que **no** se duplican en ningún sitio de uso:

- **Atajos:** `hooks/useShortcuts.ts` → `ATAJOS`. La hoja de `?` se pinta de ahí.
- **Modelos:** `lib/modelos.ts`. La ficha del director, el asistente y los ajustes
  por rol leen la misma lista.
- **Rutas perezosas:** `lib/rutasPerezosas.ts` → `MODULOS_DE_RUTA`, 13 entradas.
  `RutasPerezosas.test.tsx` compara la lista exacta: tocarla sin tocar el test lo
  rompe, y eso es deliberado.
- **Tema:** `lib/tema.ts` + `hooks/useTheme.ts`.
- **¿Es admin?:** `hooks/useEsAdmin.ts`.

---

## 5. La red

`services/api.ts` es el cliente. **`fetch` nativo, no `axios`** — no está
instalado y no hay interceptores.

- `req<T>()` es el camino normal: mete el `Authorization`, serializa el JSON,
  traduce el error con `services/errorHandler.ts` y lo pasa por el manejador
  global (que abre el paywall ante un 402).
- `skipGlobalHandler: true` es para las **sondas**: peticiones cuyo error es un
  resultado esperado. Sin él, el 403 de «no eres admin» abría el modal de «Has
  agotado tus créditos» a todo usuario no administrador en cada carga.
- Las formas de la respuesta están en `types/api.ts`. Desde la tarea 7.4 **no hay
  ni un `any`** en todo `src/`, y `@typescript-eslint/no-explicit-any` está en
  `error` en `eslint.config.js`.

**Cinco ficheros llaman a `fetch()` directamente y no pasan por `req()`:**
`store/useBillingStore.ts`, `pages/BillingPage.tsx`,
`pages/AgentDetailPage/useAgentDetail.ts`,
`components/modals/agent-wizard/useAgentTemplates.ts` y el propio `services/api.ts`.
Se dice aquí porque es verdad, no porque esté bien: son deuda conocida, y unificarlos
no estaba en el plan de esta fase.

---

## 6. Estilos

**Tailwind v4 sin `tailwind.config.js`.** Los tokens viven en el bloque `@theme`
de `src/index.css` y nada más. Esto tiene una consecuencia que muerde:

> Una clase que el compilador no reconoce **no genera CSS y no avisa**. El estilo
> simplemente no se aplica.

El control es `node scripts/check-dead-classes.mjs`, que compila el CSS de verdad
y compara con las clases que usa `src`. Tiene que salir **0**.

El tema claro es real desde la tarea 6.11: `[data-theme]` en la raíz, tres estados
(`dark` / `light` / `system`), y `main.tsx` lo pinta antes del primer render para
que no haya fogonazo. El resaltado de código tiene **dos** temas de Prism
conmutados por el mismo atributo (`lib/resaltado.ts` + `hooks/useTemaDeCodigo.ts`).

---

## 7. Rendimiento

Las 13 rutas y los cinco visores de artefactos van en trozos aparte
(`lib/rutasPerezosas.ts`, `ArtifactRenderer.tsx`): `mermaid` son ~600 KB que sólo
bajan cuando hay un diagrama de verdad, y el resaltado registra **ocho**
gramáticas en vez de las ~300 del índice de `refractor`.

---

## 8. Pruebas

Vitest + Testing Library + MSW, en `tests/` (fuera de `src/`).

```bash
cd frontend
./node_modules/.bin/vitest run          # los tests
./node_modules/.bin/tsc -b --noEmit     # tipos — el -b es OBLIGATORIO
npx eslint src                          # 0 errores
node scripts/check-dead-classes.mjs     # 0 clases muertas
```

**`tsc --noEmit` sin `-b` es un no-op** en este repo: el `tsconfig.json` es de
tipo *solution* y sin `-b` no comprueba nada. Es una trampa que ya ha costado
tiempo más de una vez.

---

## 9. Lo que este documento NO es

No es el contrato de diseño: eso es `DESIGN.md` en la raíz del repositorio, y
manda sobre cualquier cosa que se diga aquí sobre colores, espaciado, movimiento
o accesibilidad. Este fichero describe dónde está el código; aquél, cómo tiene
que verse y comportarse.
