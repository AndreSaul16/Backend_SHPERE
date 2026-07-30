# Product

<!-- impeccable:product-schema 1 -->

> **Nota de procedencia.** Este registro se escribió sin ronda de entrevista: la
> sesión que lo generó no disponía de herramienta de preguntas al usuario. Todo
> lo no marcado proviene de evidencia directa del repositorio (código, rutas,
> specs de `openspec/`, docs). Lo marcado **[inferido]** proviene del brief de la
> tarea o de deducción sobre el código y debe confirmarse antes de tratarse como
> verdad de producto.

## Platform

web

## Users

Fundadores, directivos y operadores de pymes y startups que tienen que tomar
decisiones de negocio con criterio y sin un comité real detrás: precios,
go-to-market, contratación, build-vs-buy, runway, lanzamiento. Trabajan en
escritorio durante la jornada y consultan en móvil entre reuniones **[inferido:
las plantillas de debate en `frontend/src/lib/debateTemplates.ts` describen
exactamente estos seis escenarios; el turno de uso es inferido]**.

Segundo público confirmado por el código: administradores de la plataforma
(`/admin`, `AdminPage.tsx`, `adminService.users()`), que revisan usuarios y
consumo.

## Product Purpose

SPHERE convierte una pregunta de negocio en una **decisión defendible**. El
usuario plantea el problema; un consejo de agentes IA con roles ejecutivos
(CEO Oberon, CTO Nexus, CFO Ledger, CMO Vortex, más un Abogado del Diablo
opcional llamado Némesis) debate en fases, cada uno emite un **voto estructurado**
(SI / NO / CONDICIONAL con un nivel de confianza 0-100), y el CEO cierra con un
**acta ejecutiva** que incluye una sección "Próximos pasos" accionable.

El éxito no es "una respuesta larga y bonita": es que el usuario salga con una
recomendación, el recuento de votos que la respalda, y unos próximos pasos que
puede ejecutar o convertir en issues.

## Positioning

El mecanismo que un chat multi-modelo genérico no puede copiar honestamente es el
**debate adversarial con voto y acta**:

- El debate tiene **fases explícitas** (`opening → analysis → rebuttal → devil →
  synthesis`, tipo `BoardPhase` en `frontend/src/types/index.ts`).
- Los directores hablan **en paralelo** y sus tokens llegan intercalados; el
  frontend enruta cada token a la burbuja de su rol (`bubbleByRole` en
  `frontend/src/store/useChatStore.ts`).
- Cada director **vota** y el voto se persiste (`additional_kwargs.board_vote`).
- Hay **recuento y consenso** (`tally`, `unanimous`, `earlyExit`): si el consejo
  está de acuerdo pronto, el debate se abrevia y **cuesta menos** (3 créditos en
  vez de 5).
- Existe un **Abogado del Diablo** cuyo trabajo es romper el consenso.
- El usuario puede **intervenir en mitad del debate** (`chatService.intervene`);
  su mensaje entra antes de la siguiente fase.
- El resultado es un artefacto: el **acta**, exportable y accionable.

Ningún competidor que solo enrute a varios modelos puede afirmar que sus
respuestas fueron sometidas a réplica, voto y recuento.

## Operating Context

- **Créditos, no suscripción.** Un único plan (`free`); lo de pago son compras
  puntuales de packs y top-ups. Un mensaje directo cuesta 1 crédito; un debate de
  la junta cuesta 5, o 3 si el triaje reduce participantes
  (`useBillingStore.decrementOptimistic`, `PaywallModal`).
- **Verificación de email obligatoria** antes de recibir créditos o usar
  `/stream` (`VerifyEmailPage.tsx`, `AuthContext.signUpWithEmail`).
- **Sesiones compartibles** en solo lectura mediante token público
  (`/share/:token`, `SharedSessionPage.tsx`).
- **Juntas programadas** (`ScheduledBoardsSection.tsx`): debates que se ejecutan
  solos según calendario.
- **Integraciones reales** conectadas a las herramientas de los agentes: Notion,
  WhatsApp, n8n, Google Calendar, LinkedIn, Instagram, GitHub (issues desde el
  acta), Jules; OAuth y credenciales por servicio
  (`ServiceCredentialsSettings.tsx`, `IntegrationsSettings.tsx`,
  `ConnectionsSettings.tsx`, `ToolExecutionCard.TOOL_LABELS`).
- **Agentes propios** con base de conocimiento (RAG): asistente de creación de
  agentes, subida de documentos, estado de procesamiento por chunks
  (`AgentCreationWizard.tsx`, `KnowledgeBasePanel.tsx`, `AgentDocument`).
- **Artefactos** como ciudadanos de primera clase: código, markdown, mermaid,
  tablas de datos, SVG, en un panel lateral redimensionable.
- **Memoria ejecutiva y analytics** (PostHog) sobre eventos de producto.
- Despliegue en Railway; backend propio en el mismo monorepo.

## Capabilities and Constraints

Confirmado en código:

- Stack: React 19.2, TypeScript 5.9 strict, Vite 7, Tailwind CSS v4 (vía
  `@tailwindcss/postcss`), Framer Motion 12, Zustand 5, React Router 7, Firebase
  Auth (email/password + Google + GitHub + Microsoft), PostHog, react-markdown,
  mermaid, react-syntax-highlighter, lucide-react, clsx + tailwind-merge.
- Tests: Vitest + Testing Library + MSW, 30 ficheros de test.
- Streaming SSE con `AbortController` (Stop Generation) y eventos de dominio:
  `onBoardStart/Plan/Phase/Vote/Consensus/Agent/Intervention`, `onThinking`,
  `onArtifactOpen/Chunk/Close`, `onToolStart/Result/Error`.
- El razonamiento del modelo (`reasoning_content`) se muestra como bloque
  colapsable de "Razonamiento".
- Sin i18n: la UI está escrita en español en el código, con restos en inglés
  ("Pinned", "Artifact Workspace", "Document Preview").
- Sin backend de preferencias de UI: el avatar de usuario vive en `localStorage`
  como base64 (`useUserAvatar.ts`).

Constraints que el rediseño debe respetar:

- No se puede romper el contrato de eventos de streaming ni el modelo de datos de
  `Message` / `ChatSession` / `Artifact` sin tocar backend.
- El coste en créditos debe ser visible antes de gastar.
- La vista compartida pública no puede exponer acciones autenticadas.

Explícitamente sin decidir: idioma de producto (¿solo español o es-ES + en-US?),
si habrá tema claro además de oscuro, si habrá app nativa.

## Brand Commitments

- Nombre: **SPHERE**. Título actual del documento: "SPHERE | Intelligent
  Orchestration".
- Nombres propios de los agentes, ya establecidos y no negociables sin decisión
  de producto: **Oberon** (CEO), **Nexus** (CTO), **Ledger** (CFO), **Vortex**
  (CMO), **Némesis** (Abogado del Diablo). Cada uno tiene un color de identidad
  ya usado en el producto.
- Vocabulario del producto, ya establecido en la UI: *junta*, *directores*,
  *debate*, *fase*, *voto*, *acta*, *próximos pasos*, *créditos*, *intervenir*.
- **No hay logotipo.** Hoy se usa el favicon por defecto de Vite
  (`public/vite.svg`) y emojis (⚡, 🏛️, 🤖, 💬) en lugar de marca. Un logo real
  es un activo pendiente que el rediseño debe pedir o crear.
- Copy heredado que el equipo debe decidir si conserva: "Powered by SPHERE
  Neuro-Link v2.0", "Canal Encriptado de Extremo a Extremo", "OBJETOS
  DETECTADOS". Es retórica de ciencia ficción sobre un producto de decisiones de
  negocio **[inferido: que desentona es juicio, no hecho]**.

## Evidence on Hand

Real, en el repositorio:

- Seis plantillas de debate con prompts completos
  (`frontend/src/lib/debateTemplates.ts`).
- Etiquetas humanas para 20 herramientas de agente
  (`ToolExecutionCard.TOOL_LABELS`).
- Saludos redactados por agente (`AGENT_GREETINGS` en `useChatStore.ts`).
- Parser real de la sección "Próximos pasos" del acta con sus casos límite
  documentados (`frontend/src/utils/actaParser.ts` + su test).
- QA de producción con fecha: `docs/BOARD_FRONTERA_Y_QA_2026-06-11.md`.
- Especificaciones de billing, créditos, rate limiting y settings en
  `openspec/specs/`.

Ausencias que no se deben inventar: no hay clientes, testimonios, logos de
empresas, benchmarks, precios públicos ni número de usuarios. No hay logotipo. No
hay fotografía de producto. Cualquier dato de demostración en pantallas de
marketing debe marcarse como sintético.

## Product Principles

1. **La decisión es el entregable.** Todo lo que no acerque al usuario a una
   recomendación votada y unos próximos pasos es adorno.
2. **El desacuerdo es la función, no el error.** Un consejo unánime aporta menos
   que uno dividido con motivos; la interfaz debe hacer visible el conflicto.
3. **El coste siempre a la vista.** El usuario nunca debe descubrir a posteriori
   que una acción le costó cinco créditos.
4. **El proceso es auditable.** Quién habló, en qué fase, qué votó, con qué
   confianza y qué herramienta ejecutó: recuperable después, no solo en vivo.
5. **El usuario puede interrumpir.** Es su junta; puede intervenir, detener,
   regenerar y corregir el rumbo en mitad del debate.

## Accessibility & Inclusion

No se ha establecido un requisito normativo con el usuario. Hechos relevantes:
la UI está en español pero `index.html` declara `lang="en"`; hoy no hay ni una
etiqueta `htmlFor` en 69 controles de formulario, cero `focus-visible`, ningún
`role="dialog"` y ningún `aria-live`. El objetivo que el rediseño asume, y que
debe confirmarse, es **WCAG 2.2 AA** con AAA en texto de cuerpo **[inferido]**.
