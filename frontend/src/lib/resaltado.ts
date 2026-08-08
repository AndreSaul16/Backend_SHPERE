/**
 * El resaltado de código de SPHERE: UNO, y ligero (tareas 4.3 y 4.4).
 *
 * De qué se viene:
 *
 * - `CodeBlock.tsx` importaba `{ Prism }` del índice de `react-syntax-highlighter`,
 *   que arrastra `refractor` COMPLETO — las ~300 gramáticas del directorio
 *   `languages/prism/`, casi 1 MB de JS parseado en arranque para enseñar un
 *   `json`.
 * - `MessageBubble.tsx` resaltaba con `rehype-highlight` + el tema
 *   `highlight.js/styles/atom-one-dark.css`. O sea DOS motores de resaltado
 *   distintos, cada uno con su set de gramáticas y su paleta, en la misma
 *   pantalla: el bloque de código de un turno y el del panel de artefactos no
 *   se parecían.
 *
 * A dónde se va: `prism-light`, que no registra NADA por su cuenta, más las
 * ocho gramáticas que la junta escribe de verdad. Lo que llegue en otro
 * lenguaje sale sin colorear, que es exactamente lo que pasaba ya con los
 * lenguajes que ninguno de los dos motores traía.
 *
 * Las ocho, y por qué estas: los directores producen `bash` (comandos),
 * `javascript`/`typescript` (el producto), `json` (respuestas de API y
 * configuración), `markdown` (el acta), `python` (el backend), `sql`
 * (consultas) y `yaml` (despliegue). Los alias cubren cómo los escriben los
 * modelos: `js`, `ts`, `py`, `sh`, `yml`, `md`…
 *
 * Importante: los import son a la RUTA del fichero de cada gramática, nunca al
 * índice `languages/prism`. Importar del índice vuelve a traer las 300 y anula
 * la tarea entera sin que nada falle.
 */
/// <reference types="react-syntax-highlighter" />
// La referencia explícita hace falta: `@types/react-syntax-highlighter` declara
// los submódulos (`.../prism-light`, `.../languages/prism/*`, `.../styles/*`) con
// `declare module` dentro de su `index.d.ts`, y TypeScript sólo carga ese fichero
// si alguien importa el paquete POR SU NOMBRE. Este módulo ya no lo hace —ese es
// justo el punto de la tarea— así que sin esta línea los diez import salen
// implicitly any y `tsc -b` cae con diez TS7016.
import PrismLight from 'react-syntax-highlighter/dist/esm/prism-light';

import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';

/** Las ocho gramáticas registradas, en el nombre canónico de Prism. */
export const LENGUAJES_RESALTADOS = [
    'bash',
    'javascript',
    'json',
    'markdown',
    'python',
    'sql',
    'typescript',
    'yaml',
] as const;

PrismLight.registerLanguage('bash', bash);
PrismLight.registerLanguage('javascript', javascript);
PrismLight.registerLanguage('json', json);
PrismLight.registerLanguage('markdown', markdown);
PrismLight.registerLanguage('python', python);
PrismLight.registerLanguage('sql', sql);
PrismLight.registerLanguage('typescript', typescript);
PrismLight.registerLanguage('yaml', yaml);

/**
 * Cómo escriben los modelos el nombre del lenguaje en la valla del bloque.
 * `refractor` ya trae algunos alias dentro de cada gramática (`ts` viene con
 * `typescript`), pero no todos, y un alias que ya exista se re-registra sin
 * consecuencia.
 */
const ALIAS: Record<string, string[]> = {
    bash: ['sh', 'shell', 'zsh', 'console'],
    javascript: ['js', 'jsx', 'mjs', 'cjs', 'node'],
    typescript: ['ts', 'tsx'],
    python: ['py'],
    markdown: ['md'],
    yaml: ['yml'],
    json: ['jsonc', 'json5'],
};

PrismLight.alias(ALIAS);

/**
 * El censo se lleva aquí y no se le pregunta a la librería: `prism-light` no
 * publica `supportedLanguages` (sólo lo hace el `prism` completo, que es
 * justamente el que esta tarea saca del bundle). Leerlo daría `undefined` y
 * `undefined.includes` tumbaría el turno entero.
 */
const CONOCIDOS = new Set<string>([
    ...LENGUAJES_RESALTADOS,
    ...Object.values(ALIAS).flat(),
]);

/** ¿Sabemos colorear esto? Si no, se pinta sin colorear en vez de romper. */
export function lenguajeSoportado(lenguaje: string | undefined | null): boolean {
    if (!lenguaje) return false;
    return CONOCIDOS.has(lenguaje.toLowerCase());
}

export { PrismLight };
export { default as temaCodigo } from 'react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus';
