import React from 'react';
import { useBillingStore } from '../../store/useBillingStore';

export const PaywallModal: React.FC = () => {
    const { paywall, closePaywall } = useBillingStore();

    if (!paywall.open) return null;

    let message = "Has agotado tus créditos. Compra un pack de recarga para continuar.";
    if (paywall.reason === 'rag_full') message = "Has alcanzado el límite de almacenamiento de documentos.";
    if (paywall.reason === 'agents_full') message = "Has alcanzado el límite de agentes personalizados.";

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-6 w-full max-w-md shadow-2xl relative">
                <h3 className="text-xl font-bold text-white mb-2">Límite Alcanzado</h3>
                <p className="text-slate-300 mb-6">{message}</p>
                <div className="flex gap-3 justify-end">
                    <button 
                        onClick={closePaywall}
                        className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={() => window.location.href = '/billing'}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors font-medium"
                    >
                        Comprar créditos
                    </button>
                </div>
            </div>
        </div>
    );
};
