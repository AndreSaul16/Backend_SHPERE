import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useBillingStore } from '../../store/useBillingStore';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { GUION_DEL_MURO } from './paywallGuion';

/**
 * El muro: lo que se dice cuando el producto tiene que decir que no.
 *
 * Tarea 1.8: pasó a `<Modal>`. Antes era un `<div>` sin `role="dialog"`, sin
 * trampa de foco y sin `Escape`: el paywall aparecía en medio de la pantalla y
 * el foco se quedaba en el botón de la página de detrás, que además seguía
 * siendo tabulable.
 *
 * **6.3 · D23.** Lo que quedaba después de eso era peor que un fallo de
 * accesibilidad: era un fallo de honradez. Las cuatro razones por las que el
 * backend levanta el muro (`402`, `upgrade_cta`, `rag_full`, `agents_full`)
 * compartían un único título —«Límite Alcanzado», en Versalitas De Título, que
 * §11 prohíbe— y tres de ellas llevaban al mismo sitio con el mismo botón
 * («Comprar créditos»), aunque comprar créditos no arregla que te hayas quedado
 * sin espacio de documentos ni sin plazas de agente. Y el viaje era
 * `window.location.href`, o sea una recarga completa del SPA: se perdía el
 * estado de la conversación que el usuario acababa de intentar continuar.
 *
 * Ahora cada razón dice **qué pasó**, **qué se conserva** y **qué hacer**, y
 * cada una lleva a donde de verdad se arregla:
 *
 *   - `402` y `upgrade_cta` → `/billing`, que es donde se recarga.
 *   - `rag_full` → `/billing#almacenamiento`, el panel que cuenta los
 *     documentos y el espacio (no hay gestor global de documentos: se borran
 *     dentro de cada agente, y eso lo dice el texto).
 *   - `agents_full` → `/settings/agent-overrides`, la lista de agentes.
 *
 * El guion vive en `paywallGuion.ts` y no aquí: `react-refresh/only-export-
 * components` muerde si un fichero de componente exporta también su tabla, y la
 * tabla la quieren leer los tests sin montar el modal.
 */
export const PaywallModal: React.FC = () => {
    const { paywall, closePaywall } = useBillingStore();
    const navigate = useNavigate();

    // Sin razón conocida se usa la de créditos, que es el 90% de los casos.
    const guion = GUION_DEL_MURO[paywall.reason ?? '402'];

    const irYCerrar = () => {
        closePaywall();
        // `navigate`, no `window.location`: §7 y el sentido común. Una recarga
        // completa aquí tira la sesión de chat que el usuario quería continuar.
        navigate(guion.destino);
    };

    return (
        <Modal
            open={paywall.open}
            onClose={closePaywall}
            size="sm"
            title={guion.titulo}
            footer={
                <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                    <Button variant="ghost" className="w-full sm:w-auto" onClick={closePaywall}>
                        Seguir aquí
                    </Button>
                    <Button variant="primary" className="w-full sm:w-auto" onClick={irYCerrar}>
                        {guion.accion}
                    </Button>
                </div>
            }
        >
            <p className="text-sm text-content">{guion.mensaje}</p>
            <p className="mt-3 text-xs text-content-muted">{guion.conservado}</p>
        </Modal>
    );
};
