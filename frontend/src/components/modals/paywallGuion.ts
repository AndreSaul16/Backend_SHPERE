/**
 * 6.3 · D23 — el guion del muro, una entrada por razón.
 *
 * Vive fuera de `PaywallModal.tsx` por `react-refresh/only-export-components`
 * (exportar una tabla junto a un componente rompe el refresco en caliente) y
 * porque los tests quieren leerla sin montar el modal.
 *
 * §11 manda en cada cadena: el título dice **qué pasó** en minúscula de frase
 * (nada de «Límite Alcanzado»), el mensaje dice **qué hacer**, y `conservado`
 * dice **qué NO se ha perdido** — que es la única frase que baja la tensión de
 * quien acaba de ver cómo el producto le dice que no a mitad de un trabajo.
 *
 * Las cifras salen del backend, no de la imaginación: `core/config.py` fija el
 * plan Free en 30 créditos al mes, 1 crédito por chat y 5 por junta, y los
 * créditos comprados no caducan.
 */
import type { PaywallReason } from '@/store/useBillingStore';

export interface GuionDelMuro {
    /** `<h2>` del diálogo. Qué ha pasado. */
    titulo: string;
    /** Qué hacer, y por qué el saldo funciona como funciona. */
    mensaje: string;
    /** Qué se conserva. Va en letra pequeña, debajo. */
    conservado: string;
    /** Texto del botón primario. Nombra el destino, no «Continuar». */
    accion: string;
    /** Adónde lleva. Ruta interna: viaja por `navigate`, sin recargar. */
    destino: string;
}

export const GUION_DEL_MURO: Record<PaywallReason, GuionDelMuro> = {
    '402': {
        titulo: 'Te has quedado sin créditos',
        mensaje:
            'El plan gratuito reparte 30 créditos al mes: un chat cuesta 1 crédito y una junta completa cuesta 5. Los tuyos se han agotado. Puedes esperar a la renovación del mes o recargar ahora; los créditos que compras no caducan.',
        conservado:
            'No se ha perdido nada: tus conversaciones, tus documentos y tus agentes siguen donde estaban.',
        accion: 'Recargar créditos',
        destino: '/billing',
    },
    upgrade_cta: {
        titulo: 'Esto pide más créditos de los que te quedan',
        mensaje:
            'Una junta completa cuesta 5 créditos porque son cinco directores deliberando. Con los que te quedan no llega. Los 30 del mes se renuevan solos; una recarga es inmediata y no caduca.',
        conservado: 'Lo que ya habías escrito sigue en la conversación, sin enviar.',
        accion: 'Ver los packs',
        destino: '/billing',
    },
    rag_full: {
        titulo: 'No queda espacio para más documentos',
        mensaje:
            'Tu almacén de documentos está lleno, así que este no se ha subido. Puedes ver cuánto ocupa cada cosa en Facturación, y borrar los documentos que ya no uses desde la ficha del agente que los tiene.',
        conservado: 'Los documentos que ya habías subido siguen intactos y los agentes los siguen usando.',
        accion: 'Ver el almacenamiento',
        destino: '/billing#almacenamiento',
    },
    agents_full: {
        titulo: 'No quedan plazas de agente',
        mensaje:
            'Has llegado al número de agentes personalizados que admite tu cuenta, así que este no se ha creado. Para hacer sitio, retira uno de los que ya no convocas.',
        conservado: 'Los agentes que ya tenías no se han tocado, y lo que escribiste en el asistente sigue ahí.',
        accion: 'Ver mis agentes',
        destino: '/settings/agent-overrides',
    },
};
