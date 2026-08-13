import { Users, Zap, Swords } from 'lucide-react';
import { useBillingStore } from '@/store/useBillingStore';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface Props {
    open: boolean;
    loading?: boolean;
    onActivate: (devil: boolean) => void;   // activa el debate (PATCH) y crea sesión
    onRouterOnly: () => void;                // crea sesión sin debate (solo router)
    onClose: () => void;
}

/**
 * Modal de 1 clic para activar el debate de la junta al crear una Junta
 * Directiva. Muestra el coste real y el saldo, y permite activar el Abogado del
 * Diablo. Elimina la fricción de ir a Configuración a activar el servicio
 * estrella.
 *
 * Tarea 1.8: pasa a `<Modal>`. Antes era un `<div>` sin `role="dialog"`, sin
 * trampa de foco y sin `Escape`, y su botón de cierre medía ~24px — el ejemplo
 * que DESIGN §12.11 cita por nombre como violación del mínimo de 44×44.
 */
export function BoardActivationModal({ open, loading, onActivate, onRouterOnly, onClose }: Props) {
    const { pro_messages_balance, topup_messages_balance } = useBillingStore();
    const balance = pro_messages_balance + topup_messages_balance;

    return (
        <Modal
            open={open}
            onClose={onClose}
            size="sm"
            title="¿Activar el debate de la junta?"
            footer={
                <div className="flex w-full flex-col gap-2.5">
                    <Button
                        variant="primary"
                        onClick={() => onActivate(false)}
                        disabled={loading}
                        className="w-full"
                    >
                        Activar debate
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => onActivate(true)}
                        disabled={loading}
                        className="w-full"
                    >
                        <Swords className="h-4 w-4" aria-hidden="true" />
                        Activar con Abogado del Diablo
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={onRouterOnly}
                        disabled={loading}
                        className="w-full"
                    >
                        Solo router · 1 crédito por mensaje, sin debate
                    </Button>
                </div>
            }
        >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-sm border border-brass-400/40 bg-brass-600/20">
                <Users className="h-6 w-6 text-accent" aria-hidden="true" />
            </div>

            <p className="text-sm leading-relaxed text-content">
                En modo debate, tus directores{' '}
                <strong className="text-content-strong">discuten en paralelo</strong>, se rebaten,
                votan y el CEO cierra con un{' '}
                <strong className="text-content-strong">acta de decisión</strong>. Sin debate, un
                único orquestador delega al experto más adecuado.
            </p>

            {/* §P4 y §11: el coste se dice en cifras, no con un emoji de rayo. */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 rounded-sm border border-stroke-hairline bg-surface-1 p-3">
                <span className="flex items-center gap-2 text-sm text-content">
                    <Zap className="h-4 w-4 text-accent" aria-hidden="true" />
                    Cada debate cuesta hasta{' '}
                    <strong className="text-content-strong">5 créditos</strong>
                    <span className="text-content-muted">(3 si el triaje reduce la junta)</span>
                </span>
                <span className="text-xs font-mono whitespace-nowrap text-content-muted" data-numeric>
                    {`tienes ${balance} créditos`}
                </span>
            </div>
        </Modal>
    );
}
