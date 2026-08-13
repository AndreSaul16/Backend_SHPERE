/**
 * La junta como una sola página HTML autocontenida — PLAN §6 Q14 (tarea 5.13).
 *
 * El export existente es markdown plano y pierde todo lo que hace reconocible al
 * producto: los votos, las confianzas, el recuento, el sello. Para el usuario
 * una junta archivada **es un documento de facto** —se adjunta a un correo, se
 * guarda con el resto del expediente— y un `.md` no lo parece.
 *
 * Reglas duras de este fichero:
 *
 * 1. **Ni una petición de red al abrirlo.** Los estilos van incrustados, las
 *    agujas son SVG en línea y no hay una sola fuente externa: la pila
 *    tipográfica es de sistema. Un documento archivado que necesita internet
 *    para verse bien no está archivado.
 * 2. **Todo lo que viene de fuera se escapa.** El acta y los turnos los escribe
 *    un modelo, y aquí se están construyendo etiquetas a mano. Se escapa
 *    PRIMERO y se aplica el markdown DESPUÉS, sobre texto ya seguro, así que
 *    ningún `<script>` del contenido sobrevive al viaje.
 * 3. **Sin dependencias.** `react-markdown` no sirve fuera de React y meter un
 *    segundo motor de markdown por un export sería duplicar el más pesado del
 *    proyecto. El subconjunto de aquí es el que un acta usa: encabezados,
 *    listas, citas, filetes, negrita, cursiva, código y enlaces.
 */
import type { Agent, BoardVote, Message } from '@/types';

export interface JuntaExportable {
    titulo: string;
    fecha: Date;
    /** Markdown del acta, si la junta llegó a cerrarla. */
    acta: string | null;
    mensajes: Message[];
    agentes: Agent[];
    votos: Record<string, BoardVote>;
    /** Créditos que costó el debate. */
    coste: number | null;
}

/* ─────────────────────────────── Escapado ──────────────────────────────── */

const ESCAPES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

export function escapar(texto: string): string {
    return texto.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/* ──────────────────────────── Markdown mínimo ──────────────────────────── */

/** En línea: negrita, cursiva, código y enlaces. Sobre texto YA escapado. */
function enLinea(texto: string): string {
    return texto
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
        // El destino se filtra: sólo http(s) y mailto. Un `javascript:` en un
        // enlace del acta se ejecutaría al pulsarlo en el fichero archivado.
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (todo, texto_, url) =>
            /^(https?:|mailto:)/i.test(url)
                ? `<a href="${url}" rel="noreferrer">${texto_}</a>`
                : todo,
        );
}

/**
 * Markdown → HTML, el subconjunto de un acta.
 * `markdown` entra CRUDO y se escapa aquí: es el único punto de entrada.
 */
export function markdownAHtml(markdown: string): string {
    const lineas = escapar(markdown ?? '').split(/\r?\n/);
    const salida: string[] = [];
    let enLista: 'ul' | 'ol' | null = null;
    let parrafo: string[] = [];

    const cerrarParrafo = () => {
        if (parrafo.length) {
            salida.push(`<p>${enLinea(parrafo.join(' '))}</p>`);
            parrafo = [];
        }
    };
    const cerrarLista = () => {
        if (enLista) {
            salida.push(`</${enLista}>`);
            enLista = null;
        }
    };

    for (const linea of lineas) {
        const t = linea.trim();

        if (!t) { cerrarParrafo(); cerrarLista(); continue; }

        const encabezado = t.match(/^(#{1,6})\s+(.*)$/);
        if (encabezado) {
            cerrarParrafo(); cerrarLista();
            const n = encabezado[1].length;
            salida.push(`<h${n}>${enLinea(encabezado[2])}</h${n}>`);
            continue;
        }

        if (/^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$/.test(t)) {
            cerrarParrafo(); cerrarLista();
            salida.push('<hr>');
            continue;
        }

        const cita = t.match(/^&gt;\s?(.*)$/);
        if (cita) {
            cerrarParrafo(); cerrarLista();
            salida.push(`<blockquote>${enLinea(cita[1])}</blockquote>`);
            continue;
        }

        const vineta = t.match(/^[-*+]\s+(.*)$/);
        if (vineta) {
            cerrarParrafo();
            if (enLista !== 'ul') { cerrarLista(); salida.push('<ul>'); enLista = 'ul'; }
            salida.push(`<li>${enLinea(vineta[1])}</li>`);
            continue;
        }

        const numerada = t.match(/^\d+[.)]\s+(.*)$/);
        if (numerada) {
            cerrarParrafo();
            if (enLista !== 'ol') { cerrarLista(); salida.push('<ol>'); enLista = 'ol'; }
            salida.push(`<li>${enLinea(numerada[1])}</li>`);
            continue;
        }

        cerrarLista();
        parrafo.push(t);
    }
    cerrarParrafo();
    cerrarLista();

    return salida.join('\n');
}

/* ───────────────────────────── La aguja en SVG ─────────────────────────── */

/** §8.2: pasado el 70 el arco se tiñe. Aquí en colores literales, no tokens. */
const UMBRAL = 70;

export function agujaSvg(valor: number): string {
    const v = Math.max(0, Math.min(100, Math.round(valor)));
    const r = 16;
    const cx = 20;
    const cy = 21;
    const angulo = ((v / 100) * 180 - 90) * (Math.PI / 180);
    const largo = Math.PI * r;
    const rojo = largo * (1 - UMBRAL / 100);
    const inicio = largo * (UMBRAL / 100);
    const x2 = cx + Math.sin(angulo) * 13;
    const y2 = cy - Math.cos(angulo) * 13;
    const arco = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
    const color = v > UMBRAL ? '#B4322C' : '#C79A45';
    return [
        `<svg width="40" height="24" viewBox="0 0 40 24" role="img" aria-label="Confianza ${v} de 100">`,
        `<path d="${arco}" fill="none" stroke="#4A5A52" stroke-width="2"/>`,
        `<path d="${arco}" fill="none" stroke="#B4322C" stroke-width="2" stroke-dasharray="${rojo.toFixed(2)} ${largo.toFixed(2)}" stroke-dashoffset="${(-inicio).toFixed(2)}"/>`,
        `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/>`,
        `<circle cx="${cx}" cy="${cy}" r="1.75" fill="${color}"/>`,
        '</svg>',
    ].join('');
}

/* ─────────────────────────────── El documento ──────────────────────────── */

const DECISION: Record<string, string> = {
    SI: 'A favor',
    NO: 'En contra',
    CONDICIONAL: 'Condicional',
};

/**
 * Los estilos, incrustados. Pila tipográfica del sistema a propósito: la
 * Literata del producto es un `.woff2` servido por la aplicación, y un fichero
 * archivado no puede depender de que la aplicación siga en pie.
 */
const ESTILOS = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;background:#F4F1E8;color:#2A332E;
  font:16px/1.6 ui-serif,Georgia,"Times New Roman",serif}
main{max-width:60ch;margin:0 auto;padding:48px 24px 96px}
header{border-bottom:2px solid #B99B4F;padding-bottom:16px;margin-bottom:32px}
h1{font-size:1.9rem;line-height:1.25;margin:0 0 8px}
h2{font-size:1.35rem;margin:40px 0 12px;border-bottom:1px solid #D9D2BE;padding-bottom:6px}
h3{font-size:1.1rem;margin:28px 0 8px}
p{margin:0 0 14px}
ul,ol{margin:0 0 14px 1.2em;padding:0}
li{margin:0 0 6px}
blockquote{margin:0 0 14px;padding:4px 0 4px 14px;border-left:3px solid #B99B4F;color:#4C554F}
hr{border:0;border-top:1px solid #D9D2BE;margin:24px 0}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9em;
  background:#E8E3D2;padding:1px 4px;border-radius:3px}
a{color:#836323}
.meta{font:400 .8rem/1.5 ui-sans-serif,system-ui,sans-serif;
  text-transform:uppercase;letter-spacing:.06em;color:#5A635C}
.recuento{display:grid;gap:8px;margin:0 0 24px;padding:0;list-style:none}
.director{display:flex;align-items:center;gap:12px;
  border:1px solid #D9D2BE;border-radius:4px;padding:8px 12px;background:#FBF8EF}
.director .nombre{flex:1;min-width:0;font-weight:600}
.voto{font:600 .75rem/1 ui-sans-serif,system-ui,sans-serif;text-transform:uppercase;
  letter-spacing:.05em;border:1px solid;border-radius:3px;padding:4px 6px;white-space:nowrap}
.voto.no{color:#8E2823;border-color:#8E2823;background:#F6E6E4}
.voto.si{color:#4C554F;border-color:#C9C2AE;background:#EFEBDD}
.voto.condicional{color:#7A5A12;border-color:#7A5A12;background:#F6EEDA}
.veredicto{font:600 .95rem/1.4 ui-sans-serif,system-ui,sans-serif;margin:0 0 12px}
.turno{border-top:1px solid #D9D2BE;padding:18px 0}
.turno .quien{font:600 .82rem/1.4 ui-sans-serif,system-ui,sans-serif;
  text-transform:uppercase;letter-spacing:.05em;color:#4C554F;margin:0 0 8px}
.turno.usuario .quien{color:#836323}
footer{margin-top:56px;border-top:1px solid #D9D2BE;padding-top:12px;
  font:400 .75rem/1.5 ui-sans-serif,system-ui,sans-serif;color:#5A635C}
@media print{body{background:#fff}main{padding:0}}
`.trim();

function nombreDe(rol: string, agentes: Agent[]): string {
    if (rol === 'user') return 'Tú';
    const agente = agentes.find((a) => a.role === rol || a.id === rol);
    return agente?.name ?? rol;
}

const FECHA = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const HORA = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

/** El veredicto en una línea, con el mismo criterio que la barra de Q8. */
function veredicto(votos: Record<string, BoardVote>): string {
    const lista = Object.values(votos);
    if (lista.length < 2) return '';
    const decisiones = new Set(lista.map((v) => v.decision));
    if (decisiones.size === 1) return 'Unanimidad';
    const mayor = Math.max(
        ...[...decisiones].map((d) => lista.filter((v) => v.decision === d).length),
    );
    const disenso = lista.filter(
        (v) => lista.filter((x) => x.decision === v.decision).length < mayor,
    );
    const conCerteza = disenso.some((v) => (v.confidence ?? 0) >= UMBRAL);
    return mayor * 2 <= lista.length || conCerteza ? 'Junta dividida' : 'Mayoría con reserva';
}

export function construirHtmlDeJunta(junta: JuntaExportable): string {
    const { titulo, fecha, acta, mensajes, agentes, votos, coste } = junta;

    const roles = Object.keys(votos);
    const recuento = roles
        .map((rol) => {
            const voto = votos[rol];
            const clase = voto.decision === 'NO' ? 'no' : voto.decision === 'SI' ? 'si' : 'condicional';
            return [
                '<li class="director">',
                agujaSvg(voto.confidence ?? 0),
                `<span class="nombre">${escapar(nombreDe(rol, agentes))}</span>`,
                `<span class="voto ${clase}">${DECISION[voto.decision] ?? escapar(voto.decision)} · ${Math.round(voto.confidence ?? 0)}%</span>`,
                '</li>',
            ].join('');
        })
        .join('\n');

    const turnos = mensajes
        .filter((m) => m.role !== 'system' && m.content?.trim())
        .map((m) => {
            const esUsuario = m.role === 'user';
            const hora = HORA.format(new Date(m.timestamp));
            return [
                `<article class="turno${esUsuario ? ' usuario' : ''}">`,
                `<p class="quien">${escapar(nombreDe(m.role, agentes))} · ${hora}</p>`,
                markdownAHtml(m.content),
                '</article>',
            ].join('\n');
        })
        .join('\n');

    const dictamen = veredicto(votos);

    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapar(titulo)}</title>
<style>${ESTILOS}</style>
</head>
<body>
<main>
<header>
<h1>${escapar(titulo)}</h1>
<p class="meta">Junta del ${FECHA.format(fecha)}${coste !== null ? ` · ${coste} créditos` : ''}</p>
</header>

${roles.length > 0 ? `<h2>Recuento</h2>
${dictamen ? `<p class="veredicto">${dictamen}</p>` : ''}
<ul class="recuento">
${recuento}
</ul>` : ''}

${acta ? `<h2>Acta</h2>
${markdownAHtml(acta)}` : ''}

<h2>Debate</h2>
${turnos || '<p>Esta junta no dejó turnos registrados.</p>'}

<footer>
Documento generado por SPHERE. Se abre sin conexión y se conserva tal cual.
</footer>
</main>
</body>
</html>`;
}
