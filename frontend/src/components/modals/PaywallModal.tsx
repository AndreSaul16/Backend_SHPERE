import React from 'react';
import { useBillingStore } from '../../store/useBillingStore';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

/**
 * Tarea 1.8: pasa a `<Modal>`. Antes era un `<div>` sin `role="dialog"`, sin
 * trampa de foco y sin `Escape`: el paywall aparecía en medio de la pantalla y
 * el foco se quedaba en el botón de la página de detrás, que además seguía
 * siendo tabulable.
 */
export const PaywallModal: React.FC = () => {
    const { paywall, closePaywall } = useBillingStore();

    let message = 'Has agotado tus créditos. Compra un pack de recarga para continuar.';
    if (paywall.reason === 'rag_full')
        message = 'Has alcanzado el límite de almacenamiento de documentos.';
    if (paywall.reason === 'agents_full')
        message = 'Has alcanzado el límite de agentes personalizados.';

    return (
        <Modal
            open={paywall.open}
            onClose={closePaywall}
            size="sm"
            title="Límite Alcanzado"
            footer={
                <div className="flex w-full items-center justify-end gap-3">
                    <Button variant="ghost" onClick={closePaywall}>
                        Cancelar
                    </Button>
                    <Button
                        variant="primary"
                        onClick={() => {
                            window.location.href = '/billing';
                        }}
                    >
                        Comprar créditos
                    </Button>
                </div>
            }
        >
            <p className="text-sm text-content">{message}</p>
        </Modal>
    );
};
