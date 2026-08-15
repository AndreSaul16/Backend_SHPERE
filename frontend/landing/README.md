# Landing de SPHERE

Landing de marketing de SPHERE — la junta directiva de IA. Página única, español
de España, sin formulario: todos los CTA llevan a la aplicación, que regala 30
créditos al mes (D5).

El contrato de dirección creativa, copy y coreografía es [`DIRECCION.md`](./DIRECCION.md).
Donde ese documento calla, manda `../../DESIGN.md`.
**Ni el copy ni la paleta se improvisan.**

## Dónde vive esto y por qué

Esta carpeta es un proyecto Vite **independiente** —su propio `package.json`,
su propio Tailwind, su propio ESLint y su propia suite— que vive dentro de
`frontend/` por una razón concreta: el contexto de build de Docker del servicio
de Railway del frontend es esa carpeta, y los ajustes de Railway no se tocan.
Lo que no esté aquí dentro no llega a la imagen.

Y desde ese mismo servicio se sirve. **La landing es la portada del dominio:**

| URL | Quién responde |
|---|---|
| `/` | Esta landing (nginx nombra `landing/index.html` directamente) |
| `/landing/…` | Sus assets con hash, sus fuentes, su `og.png` |
| `/landing`, `/landing/` | 301 a `/` — el documento vive en una sola URL |
| todo lo demás (`/login`, `/register`, `/chat/…`) | La aplicación, igual que siempre |

La asimetría **documento en la raíz, assets en una subruta** es deliberada y es
lo que hace que la convivencia funcione: `base: '/landing/'` en
[`vite.config.ts`](./vite.config.ts) es lo único que impide que los ficheros con
hash de la landing pisen los del producto, que también se llaman `assets/…` y
comparten raíz de nginx. El documento, en cambio, lo sirve nginx desde donde le
apetezca, porque `base` sólo afecta a las URLs que escribe Vite.

Esa ruta está escrita en tres sitios —la `base`, el `COPY` del Dockerfile y el
`try_files` de nginx— y si una se mueve sola, la página se sirve **sin estilos y
sin JavaScript**, con 200 en el documento y 404 en todo lo demás: no falla
ningún build y no hay error en ningún log. Lo vigila
[`test/despliegue.test.ts`](./test/despliegue.test.ts).

Lo que el producto tuvo que aprender a ignorar (`@source not` de Tailwind, el
`exclude` de vitest, el `globalIgnores` de ESLint) está en sus propios ficheros,
cada uno con el número que lo justifica.

## Stack

Vite 7 · TypeScript strict · vanilla TS (sin React) · Tailwind CSS v4 (`@tailwindcss/vite`) · GSAP 3.15
(plugins gratuitos desde 3.13: solo se registran `ScrollTrigger`, `SplitText` y `DrawSVGPlugin`).

Una única dependencia de ejecución: `gsap`. Todo lo demás es tooling de
desarrollo, y que siga siendo así lo vigila un test.

## Comandos

```bash
pnpm install        # pnpm SIEMPRE (npm está interceptado en este entorno)
pnpm dev            # servidor de desarrollo en :4173/landing/ ← así se previsualiza
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint .
pnpm test           # vitest run — 145 tests, incluye el contrato de §8
pnpm og             # regenera public/og.png y favicon-32.png (one-off)
pnpm verificar      # Chromium contra el dev-server: los puntos manuales de §8
```

**`pnpm dev` sirve la página en `http://localhost:4173/landing/`, no en `/`.** Es
la única diferencia dev/producción y sale de `base`: en desarrollo no hay nginx
que sirva el documento donde quiera, así que Vite lo cuelga de la base y redirige
la raíz allí (302). En producción es al revés: el documento está en `/` y sólo
sus assets bajo `/landing/`. Lo que sí es idéntico en los dos sitios son las URLs
de los activos —Vite les antepone la base también en desarrollo—, y por eso en
`index.html` se escriben desde la raíz (`/fonts/…`): escribirlas ya con
`/landing/` las duplicaría en desarrollo (`/landing/landing/fonts/…`).

## Verificación

**Esta landing no se construye en local.** `vite build` lo ejecutan el job
`test-landing` de CI y el Dockerfile en Railway (regla del propietario). Los
gates de todos los días son `pnpm typecheck` + `pnpm lint` + `pnpm test` + el
servidor de desarrollo.

Consecuencia práctica que conviene tener presente: **la primera vez que
`vite build` se ejecuta de verdad es en CI.** Merece la pena mirar el log de ese
build en vez de darlo por bueno. Ese job hace después algo que ningún test
puede hacer, porque necesita un `dist/` que en local no existe:
[`scripts/comprobar-base.mjs`](./scripts/comprobar-base.mjs) mide que todas las
URLs del documento y del CSS emitido cuelguen de `/landing/`, y enseña las que
ha encontrado.

El checklist mecánico de `DIRECCION.md` §8 vive en
[`test/contratoDeAceptacion.test.ts`](./test/contratoDeAceptacion.test.ts): cada
punto es un test que, al fallar, imprime fichero, línea y texto — no un
«esperaba 0, recibí 3». Los demás tests defienden el motor de la demo, el
presupuesto de motion, el gating, los metadatos, el contrato de despliegue y los
activos sociales. Las cabeceras de seguridad las vigila
`../tests/lib/cabecerasDeSeguridad.test.ts`, en la suite del producto: el
`nginx.conf` es del servicio, y el guard vive donde vive el fichero.

Para los puntos que sólo se pueden mirar con un navegador:

```bash
pnpm dlx playwright@1.62.1 install chromium   # una vez (~170 MB)
pnpm dev                                      # en otra terminal
pnpm verificar
```

Deja la evidencia en [`docs/capturas/`](./docs/capturas): cinco capturas y un
`verificacion.json` con cada medida. Cada comprobación devuelve el **número
medido**, no un «pasa».

| Captura | Qué prueba |
|---|---|
| `hero-movil-390.png` · `hero-escritorio-1440.png` | El hero con la sesión en marcha a los 9 s |
| `demo-terminada-movil-390.png` | §8.15: la demo entera, sellada, en un pantallazo de 390×844 |
| `procedimiento-escritorio-1440.png` | S3 con el pin a media carrera: tarjeta a su medida y bloque repartido |
| `acta-escritorio-1440.png` | El capítulo en papel con el sello aterrizado (D7) |

## Estado del checklist §8, punto a punto

| # | Punto | Estado |
|---|---|---|
| 1 | Cero `backdrop-blur` / `backdrop-filter` | ✓ automatizado |
| 2 | Cero radios grandes | ✓ automatizado |
| 3 | Cero tipografía bajo 12px | ✓ automatizado |
| 4 | Cero fuentes remotas | ✓ automatizado |
| 5 | Sólo Literata y Archivo | ✓ automatizado |
| 6 | Cero plugins GSAP prohibidos | ✓ automatizado |
| 7 | El único gradiente es el radial de la lámpara | ✓ automatizado |
| 8 | Ningún tween fuera de las propiedades permitidas | ✓ automatizado |
| 9 | Un `lang="es"`, un `<h1>` | ✓ automatizado |
| 10 | Cero prueba social inventada | ✓ automatizado |
| 11 | La ruta de registro sólo en `config.ts`, con su `utm_content` | ✓ automatizado |
| 12 | `tsc` y ESLint limpios · una sola dependencia de ejecución | ✓ automatizado (gates + test) |
| 13 | Sin JS: copy completo, CTAs navegan, demo en su fotograma final | ✓ verificado en navegador |
| 14 | `prefers-reduced-motion`: cero tweens creados, botón «Reproducir» | ✓ verificado en navegador |
| 15 | 390×844: sin scroll horizontal, H1 ≤ 3 líneas, CTA en el primer viewport, demo en un pantallazo | ✓ verificado en navegador — **demo 772 px** |
| 16 | Bucles: ≤ 2 durante la demo, 0 en reposo | ✓ verificado en navegador |
| 17 | CPU 6×: p95 ≥ 55 fps en 10 s de scroll | ⏳ pendiente (perfilado manual) |
| 18 | Lighthouse móvil ≥ 90/95/95/95 · LCP < 2,5 s · CLS < 0,1 | ⏳ pendiente en producción |
| 19 | Teclado: recorrido completo con foco visible | ✓ verificado en navegador |
| 20 | El copy renderizado coincide con §2 | ✓ parcial automatizado + lectura humana |
| 21 | La anilina es del sello y de nadie más | ✓ automatizado |
| 22 | Fondo paño, capítulo en papel, ningún negro puro | ✓ automatizado |

### Lo medido en navegador (`pnpm verificar`)

- **§8.13** — Las diez frases-titular de §2 presentes sin JavaScript, `<h1>`
  visible, los 5 CTA de registro con `href` absoluto y sus cuatro `utm_content`,
  el acta de la demo ya sellada con el recuento 2 · 1 · 1 y **ninguna** sección
  invisible esperando un tween.
- **§8.14** — Con `reduce`: **0** ScrollTriggers y **0** tweens. El control es lo
  que le da valor: **sin** `reduce` hay **62** ScrollTriggers. Botón
  «Reproducir» visible.
- **§8.16** — Muestreando la demo entera y quedándose con el peor momento:
  **1 bucle** (el cursor de streaming, el nº 1 del presupuesto) y **0** en reposo.
- **§8.19** — 31 paradas, del skip-link al pie pasando por el Canto, la
  navegación, el hero, precios, preguntas y el cierre. Cero paradas sin foco
  visible y cero con un anillo que no sea el de la casa (2px con 2px de
  separación).
- **§8.15** — Documento de **390 px** en un viewport de 390 (cero desbordamiento
  horizontal, y cero elementos culpables), **H1 en 2 líneas**, CTA primario
  dentro del primer viewport y la Sesión de Muestra en **772 px**, por debajo de
  los **775** que deja la pantalla de referencia bajo la cabecera adherida. Y
  **crece 0 px al terminar**: el alto reservado es ya el del final.

### §8.15 — qué se le pide a la demo, y qué no

**La pieza cabe en una pantalla: 772 px medidos, techo 775.** Venía de 890 —más
alta que los 844 px de la pantalla de referencia ella sola—, y los 118 px salen
de adelgazarla, no de recortar copy: el Palco pasó de rejilla 2×2 a banda de
cuatro asientos (170 → 79 px), la ventana de turnos de 336 a 248, el acta mini
de 24 a 12 px de aire y la tarjeta de 20 a 16. La evidencia es
[`demo-terminada-movil-390.png`](./docs/capturas/demo-terminada-movil-390.png):
rótulo, pregunta, fase, los cuatro asientos, recuento, turnos, acta sellada y el
botón de reproducir, todo dentro de un pantallazo.

Lo que **no** se cumple, con su número: la demo no comparte el primer viewport
con el claim. El bloque de texto del hero —rótulo, H1, entradilla, dos CTA y el
microcopy— ocupa **511 px** antes de que la demo empiece, así que en 844 px no
caben las dos cosas. Eso sólo se arreglaría recortando la entradilla, que es
copy cerrado de §2. El checklist lo mide (`demoEntera`) y lo anota; el gate
exige lo otro (`cabeEnUnPantallazo`), que es lo que sí depende de este build.

### Pulido pendiente (P2, anotado por la revisión de acabado)

Ninguno de estos bloquea nada: son acabado, están vistos y están sin hacer a
propósito para no ampliar el ciclo de remate por cuenta propia.

- **El rail móvil de S3 no tiene pista visible.** El cursor de latón avanza
  sobre el paño y se lee como un guion suelto; le falta la hairline de fondo que
  sí tiene su hermano el Canto, para que se vea el recorrido y no sólo la marca.
- **`text-wrap: balance` para el h1 del acta móvil.** El titular de la hoja parte
  en dos líneas muy desiguales; balancearlas es una declaración.
- **La lista de agujas de S5 va 1+1+2 y debería ir 2×2.** Cuatro directores en
  una rejilla asimétrica se leen como si faltara uno.
- **El salto entre los dos párrafos de S2 y su tachón en móvil.** El aire entre
  párrafos y la posición del trazo de tinta no están mirados a 390.
- La tarjeta del acta en blanco durante los primeros ~30 s de la demo lee como
  rectángulo vacío — pide un tratamiento de papel pautado tenue o una
  microcaption.
- El scrub de S3 puede aparcar en el fundido entre fases — un snap por beat lo
  puliría.

## Despliegue

**Sin servicio propio y sin ajustes de Railway que tocar.** La landing se
despliega con el frontend del producto, en el mismo servicio y en el mismo
`docker build`. Los ficheros están en la carpeta de arriba porque son del
servicio, no de la página:

| Fichero | Qué hace con la landing |
|---|---|
| [`../Dockerfile`](../Dockerfile) | Instala con pnpm (`--frozen-lockfile`), corre `pnpm build` y copia `dist/` a `/usr/share/nginx/html/landing` |
| [`../nginx.conf`](../nginx.conf) · [`../nginx.conf.template`](../nginx.conf.template) | `location = /` sirve el documento; `/landing…` redirige a la raíz |
| [`../.dockerignore`](../.dockerignore) | Deja fuera `landing/node_modules` y `landing/dist` |

Dos detalles que cuestan una tarde si se descubren en el despliegue:

- **La etapa de build es `node:22-alpine`, no `node:20`.** `packageManager` fija
  pnpm 11.7.0 y su `engines.node` es `>= 22.13`. Con node 20, corepack se planta
  antes de instalar nada.
- **`pnpm-workspace.yaml` va en el `COPY` de los manifiestos.** pnpm 11 ya no lee
  la clave `"pnpm"` de `package.json` y de ahí sale `allowBuilds: esbuild`. Sin
  él, esbuild no coloca el binario de su plataforma y `vite build` muere en el
  arranque.

Cuando haya dominio propio, cambiar `APP_URL` en
[`src/config.ts`](./src/config.ts) —`LANDING_URL` es ya la raíz de `APP_URL`, así
que va detrás sola— y, con él, `../public/robots.txt` y `../public/sitemap.xml`.
[`test/seo.test.ts`](./test/seo.test.ts) falla hasta que los tres digan lo mismo,
así que no se puede olvidar. **`og.png` no hay que regenerarlo por un cambio de
dominio**: la tarjeta no lleva el dominio dibujado.

**La lección que explica por qué `nginx.conf` se ve repetitivo:** `add_header`
**no se hereda** en un `location` que declare el suyo — nginx reemplaza el juego
entero. En este mismo servicio eso dejó una vez la aplicación completa servida
sin una sola cabecera de seguridad, en silencio. El bloque nuevo de la raíz
repite las cuatro, y `../tests/lib/cabecerasDeSeguridad.test.ts` las **deduce**
del bloque `server` para que añadir una cabecera nueva no envejezca el test.

Por lo mismo, el bloque de la raíz usa `try_files /landing/index.html =404` y
nombra el fichero entero: un fallback a `/index.html` haría redirección interna
a otro bloque y las cabeceras de éste **no llegarían al documento** — que es
exactamente cómo ocurrió la primera vez.

## Verificación pendiente en máquina con navegador

Lo que este entorno no puede cerrar, con el comando exacto:

- **§8.17 · rendimiento con CPU 6×.** DevTools → Performance, throttling de CPU
  6×, grabar 10 s de scroll con el pulgar en 390×844. Criterio: p95 ≥ 55 fps y
  ningún frame > 16,6 ms por estilo o layout. Requiere el panel a mano; no hay
  API que lo sustituya.
- **§8.18 · Lighthouse móvil contra producción.** Contra el servicio desplegado
  —que ahora es el del frontend, y la landing es su raíz—, nunca contra
  `pnpm dev`:
  ```bash
  pnpm dlx lighthouse@12 https://frontendsphere-production.up.railway.app/ \
    --preset=perf --form-factor=mobile --view
  ```
- **§8.20 · diff de copy sección a sección** contra `DIRECCION.md` §2. Los diez
  titulares se comprueban solos en §8.13; el cuerpo es lectura humana.

### Lighthouse ya pasado, y por qué es sólo orientativo

Contra el **dev-server** (preset escritorio), o sea **no representativo**:
accesibilidad **100**, buenas prácticas **100**, SEO **100**, rendimiento **71**,
LCP 1,6 s, TBT 50 ms, **CLS 0,719**.

Ese CLS **es un artefacto del servidor de desarrollo**, medido y explicado, no
un problema de la página: el HTML que sirve Vite en desarrollo no lleva **ni un**
`<link rel="stylesheet">` —inyecta el CSS por JavaScript—, así que la página
pinta sin estilos y reflowa entera una vez. Es un único salto de 0,7042 a los
252 ms con origen `<body>`, antes incluso de que cargue una fuente. En
producción, `vite build` mete la hoja de estilos en el `<head>` y ese salto no
puede ocurrir. Aun así, **CLS y rendimiento hay que volver a medirlos contra el
despliegue**: son el punto 18 y siguen pendientes.

## Estructura

```
index.html                    las 12 secciones S0–S11 con el copy final de DIRECCION.md §2
vite.config.ts                base '/landing/' + inyección de los destinos de CTA en el HTML
src/config.ts                 APP_URL, LANDING_URL, BASE_LANDING, URL_OG_IMAGE
                              y CTA_REGISTRO() — fuente única de destinos y rutas
src/styles/index.css          tokens (DESIGN.md §13), materia, marca y sistema visual
src/main.ts                   punto de entrada: estilos + arrancarMotion()

src/motion/tokens.ts          curvas, físicas y duraciones fijadas (DIRECCION.md §3.0)
src/motion/registro.ts        registro único de plugins GSAP permitidos
src/motion/revelar.ts         revelarSeccion(): el reveal estándar de sección
src/motion/hero.ts            entrada del hero (devuelve cuándo acaba) + micro-parallax
src/motion/canto.ts           El Canto: cursor, segmento vivo y pulsación larga
src/motion/arranque.ts        gating de reduced-motion + fonts.ready + orden de montaje
src/motion/coreografia/*.ts   una sección, un fichero: S2, S3, S4, S5, S6, S7 y S9

src/demo/sesionDeMuestra.ts   la línea de tiempo de la demo. CONTENIDO editorial
src/demo/motor.ts             despachador por timestamps. Puro: reloj inyectable
src/demo/escena.ts            aplica cada evento al DOM, en modo animado o por corte
src/demo/montaje.ts           cuándo arranca, cuándo pausa y quién enseña el botón

src/piezas/aguja.ts           §8.2 — rotación con muelle, oxblood por clase
src/piezas/odometro.ts        §8.12 — rodillo CSS remontable, cero temporizadores
src/piezas/pluma.ts           §8.8 — avance por trozos, doce por renglón
src/piezas/filamento.ts       §8.11 — deliberación bajo la placa activa
src/piezas/sello.ts           §8.3 — el único aterrizaje `impact` de la página (D7)

scripts/generar-grano.mjs     generador one-off del tile de grano
scripts/generar-og.mjs        generador one-off de og.png y favicon-32.png
scripts/verificar-navegador.mjs  los puntos manuales de §8, medidos con Chromium
scripts/comprobar-base.mjs    en CI, tras el build: todas las URLs bajo /landing/
test/despliegue.test.ts       base + Dockerfile + nginx dicen los tres lo mismo
docs/capturas/                evidencia visual commiteada + verificacion.json
```

## Puntos de enganche `[data-*]`

El HTML es la fuente de verdad del **fotograma final**: lo que sirve `index.html`
es el estado en que la demo termina y el que ve quien no ejecuta JavaScript (D4).
El motor rebobina y vuelve a llegar al mismo sitio.

| Atributo | Dónde | Qué hace |
|---|---|---|
| `[data-demo]` | S1 | Raíz de la Sesión de Muestra |
| `[data-demo-fase]` | S1 | Rótulo de la fase viva |
| `[data-asiento]` `[data-demo-aguja]` `[data-demo-voto]` `[data-demo-filamento]` | S1 | Un asiento del Palco: aguja, voto y filamento de deliberación |
| `[data-cifra]` | S1, S5 | Odómetro del recuento (`si` · `condicional` · `no`). **El mismo nombre en las dos secciones, a propósito**: es la misma pieza, y la escena de la demo los busca acotados a `[data-demo]`. Buscarlos por otro nombre devolvía una lista vacía sin quejarse y la demo enseñaba el resultado antes de la primera fase; `test/escena.test.ts` monta el marcado real de `index.html` para que esa deriva no pueda repetirse |
| `[data-demo-turnos]` | S1 | Ventana de turnos: alto fijo, apila desde arriba y el `scrollTop` persigue al turno vivo; tres a la vista |
| `[data-demo-acta-titulo]` `[data-demo-acta-recuento]` `[data-demo-pluma]` `[data-demo-sello]` | S1 | El acta mini que se escribe y se sella |
| `[data-demo-cursor]` | S1 | Cursor de streaming: EL bucle nº 1 del presupuesto; muere al terminar |
| `[data-demo-reproducir]` | S1 | Botón. Se revela al terminar la sesión, o desde el principio con `prefers-reduced-motion` (§8.14) |
| `[data-bloque-chat]` `[data-tachon]` `[data-nota-margen]` | S2 | El tachón con `scrub: 0.5` y la nota que responde al completarse |
| `[data-procedimiento]` `[data-fase]` `[data-muesca]` `[data-rail-cursor]` `[data-fase-numero]` `[data-cierre-fases]` | S3 | La escena del pin de `lg+` y el rail con su cursor |
| `[data-placas]` `[data-filete-devil]` | S4 | Barrido de presentación de las agujas; filete de Némesis con `drawSVG` |
| `[data-recuento]` | S5 | Odómetros y las cuatro agujas escalonadas |
| `[data-hoja-acta]` `[data-sello]` `[data-casilla]` | S6 | Desenrollado de la hoja, casillas y aterrizaje del sello |
| `[data-telegrafo]` `[data-check]` `[data-contador-actuaciones]` | S7 | Entradas del telégrafo y contador |
| `[data-coste]` | S9 | Cifras de la tabla de costes |
| `[data-packs]` `[data-pack-popular]` `[data-filete-pack]` | S9 | Packs escalonados y el filete de latón que se dibuja |
| `.odometro__digito[data-saliente]` | S1, S5, S7, S9 | De qué número viene la cifra. El pseudo-elemento del saliente solo se pinta con `[data-rodando]` |

## Presupuesto de motion (DIRECCION.md §3.P)

- **1 bucle** mientras la Sesión de Muestra se reproduce: el cursor de streaming.
  Medido en navegador muestreando la demo entera.
- **0 bucles** con la página en reposo. El cursor del Canto no cuenta: es una
  animación de una sola iteración ligada al progreso del scroll.
- **1 solo `requestAnimationFrame`** en todo el proyecto (el despachador de la
  demo) y **1 solo `setTimeout`** (la pulsación larga del Canto, que mide un
  gesto). `test/presupuesto.test.ts` lo defiende por grep.

## Activos

- **Fuentes** (`public/fonts/`): `archivo-var.woff2`, `literata-var.woff2`,
  `literata-var-italic.woff2`, copiadas de `Frontend_SPHERE/frontend/public/fonts/`.
  JetBrains Mono **no se carga**: la landing no enseña código (DIRECCION.md §0.2.11).
- **Grano del paño** (`public/textures/baize-128.webp`): generado con
  `pnpm grano` (script one-off + `ffmpeg`/libwebp; ver cabecera del script).
- **`og.png` (1200×630) y `favicon-32.png`**: generados con `pnpm og` y
  commiteados. **La vía elegida fue Chromium** (`playwright-core`), no `sharp`
  ni `resvg`: la composición lleva texto en las dos fuentes variables del
  proyecto, y `sharp` compone el texto por fontconfig ignorando `@font-face`
  —se habría llevado el claim a DejaVu sin avisar— mientras que `resvg` sólo
  carga TTF/OTF y no interpola ejes variables. El navegador que ya hacía falta
  para verificar §8 pinta la tarjeta con las mismas fuentes, el mismo `oklch` y
  el mismo grano que ve el visitante. El script mide antes de escribir: aborta
  si alguna cara tipográfica no está cargada, si una línea se sale del lienzo,
  si una palabra desborda su caja o si la leyenda del sello no cabe en su
  renglón.
- **`robots.txt` y `sitemap.xml`**: **ya no están aquí**, están en
  `../public/`. Declaran el **dominio entero** —cuya raíz es esta página, pero
  cuyas otras rutas son la aplicación—, así que son del producto y los sirve
  nginx desde `/`. Servidos desde `public/` de la landing habrían acabado en
  `/landing/robots.txt`, y ahí son inertes: ningún rastreador busca el
  `robots.txt` en una subcarpeta. Siguen declarando una sola URL —las secciones
  S1–S11 son anclas del mismo documento, no rutas—, y siguen atados a
  `LANDING_URL`: lo comprueba `test/seo.test.ts` desde aquí, porque la constante
  que los ata sí es de la landing.
