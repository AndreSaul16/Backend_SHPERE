// Knowledge Base Panel — Agent document management
import { useState, useEffect, useRef, useCallback } from 'react';
import {
    FileText,
    Upload,
    Trash2,
    CheckCircle,
    XCircle,
    Loader2,
    Database,
    Layers,
    HardDrive,
    AlertCircle,
    FilePlus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { chatService, authHeaders } from '@/services/api';
import { reasonOf, toast } from '@/lib/toastBus';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KnowledgeBasePanelProps {
    agentId: string;
    readOnly?: boolean;
}

interface AgentDocument {
    id: string;
    filename: string;
    file_size: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    chunks_count: number;
    created_at: string;
}

interface UploadingFile {
    id: string;
    file: File;
    progress: number;
    error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE =
    (import.meta.env.VITE_API_URL as string | undefined) ??
    'http://localhost:8000/api/v1';

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const POLL_INTERVAL_MS = 3000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(name: string): string {
    const idx = name.lastIndexOf('.');
    return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

function generateId(): string {
    return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Status Badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: AgentDocument['status'] }) {
    switch (status) {
        case 'pending':
            return (
                <span className="relative flex h-2.5 w-2.5" title="Pendiente">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-yellow-400" />
                </span>
            );
        case 'processing':
            return <Loader2 className="h-4 w-4 text-electric-cyan animate-spin" />;
        case 'completed':
            return <CheckCircle className="h-4 w-4 text-emerald-400" />;
        case 'failed':
            return <XCircle className="h-4 w-4 text-red-400" />;
    }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KnowledgeBasePanel({ agentId, readOnly = false }: KnowledgeBasePanelProps) {
    const [documents, setDocuments] = useState<AgentDocument[]>([]);
    const [uploading, setUploading] = useState<UploadingFile[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const xhrMapRef = useRef<Map<string, XMLHttpRequest>>(new Map());

    // ---- Fetch documents ----
    const fetchDocuments = useCallback(async () => {
        try {
            // El endpoint exige Depends(get_current_user) y responde
            // DocumentListResponse ({documents, total_count}), no un array.
            const data = await chatService.getAgentDocuments(agentId);
            setDocuments(Array.isArray(data?.documents) ? data.documents : []);
            setFetchError(null);
        } catch (err) {
            setFetchError((err as Error).message);
        } finally {
            setIsLoading(false);
        }
    }, [agentId]);

    // ---- Initial fetch ----
    useEffect(() => {
        setIsLoading(true);
        fetchDocuments();
    }, [fetchDocuments]);

    // ---- Polling while pending/processing ----
    useEffect(() => {
        const hasPending = documents.some(
            (d) => d.status === 'pending' || d.status === 'processing',
        );

        if (hasPending) {
            if (!pollRef.current) {
                pollRef.current = setInterval(fetchDocuments, POLL_INTERVAL_MS);
            }
        } else {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
        }

        return () => {
            if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
            }
        };
    }, [documents, fetchDocuments]);

    // ---- Cleanup XHRs on unmount ----
    useEffect(() => {
        return () => {
            xhrMapRef.current.forEach((xhr) => xhr.abort());
            xhrMapRef.current.clear();
        };
    }, []);

    // ---- Upload a single file via XHR ----
    // Se mantiene XHR propio (y no chatService.uploadAgentDocument) porque este
    // registra el xhr en xhrMapRef y el efecto de desmontaje lo aborta; el del
    // servicio no es abortable y dejaria subidas huerfanas llamando a setState.
    const uploadFile = useCallback(
        async (file: File) => {
            const ext = getFileExtension(file.name);
            if (!ALLOWED_EXTENSIONS.includes(ext)) {
                return;
            }
            if (file.size > MAX_FILE_SIZE) {
                return;
            }

            const id = generateId();

            setUploading((prev) => [...prev, { id, file, progress: 0 }]);

            const xhr = new XMLHttpRequest();
            xhrMapRef.current.set(id, xhr);

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const progress = Math.round((e.loaded / e.total) * 100);
                    setUploading((prev) =>
                        prev.map((u) => (u.id === id ? { ...u, progress } : u)),
                    );
                }
            });

            xhr.addEventListener('load', () => {
                xhrMapRef.current.delete(id);
                if (xhr.status >= 200 && xhr.status < 300) {
                    setUploading((prev) => prev.filter((u) => u.id !== id));
                    fetchDocuments();
                } else {
                    setUploading((prev) =>
                        prev.map((u) =>
                            u.id === id ? { ...u, error: `Error ${xhr.status}` } : u,
                        ),
                    );
                }
            });

            xhr.addEventListener('error', () => {
                xhrMapRef.current.delete(id);
                setUploading((prev) =>
                    prev.map((u) =>
                        u.id === id ? { ...u, error: 'Error de red' } : u,
                    ),
                );
            });

            xhr.addEventListener('abort', () => {
                xhrMapRef.current.delete(id);
                setUploading((prev) => prev.filter((u) => u.id !== id));
            });

            const formData = new FormData();
            formData.append('file', file);

            // El endpoint exige Depends(get_current_user). Solo se propaga
            // Authorization: el Content-Type lo pone el navegador con el
            // boundary de multipart, y fijarlo a mano rompe la subida.
            const auth = (await authHeaders())['Authorization'];

            // El await de arriba cede el hilo: si el componente se desmonto
            // mientras tanto, el efecto de limpieza ya saco este xhr del mapa.
            // Abrir y enviar entonces seria una peticion huerfana.
            if (xhrMapRef.current.get(id) !== xhr) return;

            xhr.open('POST', `${API_BASE}/agents/${agentId}/documents`);
            if (auth) xhr.setRequestHeader('Authorization', auth);
            xhr.send(formData);
        },
        [agentId, fetchDocuments],
    );

    // ---- Handle file selection ----
    const handleFiles = useCallback(
        (files: FileList | null) => {
            if (!files || readOnly) return;
            Array.from(files).forEach(uploadFile);
        },
        [uploadFile, readOnly],
    );

    // ---- Delete document ----
    const deleteDocument = useCallback(
        async (fileId: string) => {
            try {
                // El endpoint exige Depends(get_current_user).
                await chatService.deleteAgentDocument(agentId, fileId);
                setDocuments((prev) => prev.filter((d) => d.id !== fileId));
            } catch (err) {
                // El borrado no es optimista: la fila sigue en la lista. Sin
                // aviso, «he pulsado borrar y no ha pasado nada» era
                // indistinguible de un botón que no responde.
                toast.error(
                    'No se pudo eliminar el documento',
                    reasonOf(err) ?? 'Sigue en la base de conocimiento del agente.',
                );
            }
        },
        [agentId],
    );

    // ---- Drag & drop handlers ----
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragOver(false);
            handleFiles(e.dataTransfer.files);
        },
        [handleFiles],
    );

    // ---- Summary calculations ----
    const totalFiles = documents.length;
    const totalChunks = documents.reduce((acc, d) => acc + (d.chunks_count ?? 0), 0);
    const totalSize = documents.reduce((acc, d) => acc + (d.file_size ?? 0), 0);

    // ---- Render ----
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="flex flex-col h-full bg-transparent overflow-hidden"
        >
            {/* Header */}
            <div className="px-6 py-5 border-b border-white/5 bg-white/[0.02] backdrop-blur-md flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-luxury-purple/10 rounded-xl">
                        <Database className="h-5 w-5 text-luxury-purple" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-white uppercase tracking-widest">
                            Knowledge Base
                        </h3>
                        <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                            {totalFiles} {totalFiles === 1 ? 'DOCUMENTO' : 'DOCUMENTOS'} INDEXADOS
                        </p>
                    </div>
                </div>
            </div>

            {/* Summary Stats */}
            {totalFiles > 0 && (
                <div className="grid grid-cols-3 gap-3 px-6 py-4 border-b border-white/5">
                    {[
                        { icon: FileText, label: 'Archivos', value: totalFiles },
                        { icon: Layers, label: 'Chunks', value: totalChunks.toLocaleString() },
                        { icon: HardDrive, label: 'Tamaño', value: formatFileSize(totalSize) },
                    ].map(({ icon: Icon, label, value }) => (
                        <div
                            key={label}
                            className="flex items-center gap-2.5 p-3 rounded-2xl bg-white/[0.03] border border-white/5"
                        >
                            <Icon className="h-4 w-4 text-electric-cyan shrink-0" />
                            <div className="min-w-0">
                                <p className="text-xs font-bold text-white truncate">{value}</p>
                                <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                                    {label}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 px-6 py-4 space-y-3">
                {/* Loading state */}
                {isLoading && (
                    <div className="flex flex-col items-center justify-center py-16 gap-4">
                        <Loader2 className="h-8 w-8 text-electric-cyan animate-spin" />
                        <p className="text-sm text-gray-500 font-mono">CARGANDO DOCUMENTOS...</p>
                    </div>
                )}

                {/* Error state */}
                {!isLoading && fetchError && (
                    <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
                        <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
                        <p className="text-sm text-red-300">{fetchError}</p>
                    </div>
                )}

                {/* Empty state */}
                {!isLoading && !fetchError && documents.length === 0 && uploading.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 gap-6 text-center">
                        <div className="relative">
                            <div className="absolute inset-0 bg-luxury-purple/20 blur-3xl rounded-full" />
                            <div className="relative h-24 w-24 rounded-[32px] bg-white/[0.03] border border-white/10 flex items-center justify-center shadow-2xl">
                                <FilePlus className="h-10 w-10 text-gray-600" />
                            </div>
                        </div>
                        <div className="space-y-2 max-w-xs">
                            <h4 className="text-white font-bold text-lg">Sin documentos</h4>
                            <p className="text-gray-500 text-sm leading-relaxed">
                                {readOnly
                                    ? 'Este agente no tiene documentos en su base de conocimiento.'
                                    : 'Sube archivos para que el agente pueda aprender de ellos y responder con contexto propio.'}
                            </p>
                        </div>
                    </div>
                )}

                {/* Uploading files */}
                <AnimatePresence>
                    {uploading.map((item) => (
                        <motion.div
                            key={item.id}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="p-4 rounded-2xl bg-white/[0.03] border border-electric-cyan/20">
                                <div className="flex items-center gap-3 mb-3">
                                    <Upload className="h-4 w-4 text-electric-cyan animate-pulse shrink-0" />
                                    <span className="text-sm text-white font-medium truncate flex-1">
                                        {item.file.name}
                                    </span>
                                    <span className="text-xs text-electric-cyan font-mono shrink-0">
                                        {item.error ?? `${item.progress}%`}
                                    </span>
                                </div>
                                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                    <motion.div
                                        className={cn(
                                            'h-full rounded-full',
                                            item.error
                                                ? 'bg-red-500'
                                                : 'bg-gradient-to-r from-electric-cyan to-luxury-purple',
                                        )}
                                        initial={{ width: 0 }}
                                        animate={{ width: `${item.progress}%` }}
                                        transition={{ ease: 'easeOut' }}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {/* Document list */}
                <AnimatePresence>
                    {documents.map((doc) => (
                        <motion.div
                            key={doc.id}
                            layout
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            data-row
                            className="group flex items-center gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:border-white/10 transition-all"
                        >
                            {/* Status indicator */}
                            <div className="h-10 w-10 rounded-xl bg-white/[0.05] border border-white/5 flex items-center justify-center shrink-0">
                                <StatusBadge status={doc.status} />
                            </div>

                            {/* File info */}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-white truncate">
                                    {doc.filename}
                                </p>
                                <div className="flex items-center gap-3 mt-1">
                                    <span className="text-[10px] text-gray-500 font-mono uppercase">
                                        {formatFileSize(doc.file_size)}
                                    </span>
                                    {doc.status === 'completed' && doc.chunks_count > 0 && (
                                        <span className="text-[10px] text-electric-cyan/70 font-mono">
                                            {doc.chunks_count} chunks
                                        </span>
                                    )}
                                    {doc.status === 'failed' && (
                                        <span className="text-[10px] text-red-400 font-mono uppercase">
                                            Error al procesar
                                        </span>
                                    )}
                                    {doc.status === 'processing' && (
                                        <span className="text-[10px] text-electric-cyan font-mono uppercase">
                                            Procesando...
                                        </span>
                                    )}
                                    {doc.status === 'pending' && (
                                        <span className="text-[10px] text-yellow-400/80 font-mono uppercase">
                                            En cola
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Delete button */}
                            {!readOnly && (
                                /* D16 (1.11): era `opacity-0 group-hover:opacity-100`,
                                   o sea borrar un documento no se podía ni con
                                   teclado ni en táctil. El contrato está en
                                   `index.css` (`[data-row]`/`[data-row-actions]`):
                                   visible por defecto, y sólo se esconde donde
                                   hay hover fino. El `title` deja de ser la
                                   única etiqueta (§9.6). */
                                <button
                                    type="button"
                                    onClick={() => deleteDocument(doc.id)}
                                    data-row-actions
                                    aria-label={`Eliminar el documento ${doc.filename}`}
                                    className="flex h-11 w-11 items-center justify-center rounded-xl bg-dissent/10 text-dissent hover:bg-dissent/20 transition-all active-scale shrink-0"
                                >
                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                </button>
                            )}
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>

            {/* Upload Zone */}
            {!readOnly && (
                <div className="px-6 py-5 border-t border-white/5 bg-white/[0.02]">
                    {/* D14 (1.10): esto era un <div onClick> con el <input
                        type="file"> en `hidden`. Con teclado NO se podía subir un
                        documento: el div no recibe foco y el input oculto tampoco.
                        Ahora el disparador es un <button> real — foco, Enter y
                        Espacio gratis — y el input va `sr-only` en vez de `hidden`,
                        porque `display:none` lo saca del árbol de accesibilidad y
                        además algunos navegadores se niegan a abrir el selector de
                        un input que no está pintado.

                        El arrastrar y soltar se queda donde estaba: es un ATAJO de
                        ratón sobre el mismo contenedor, no el único camino. Los
                        tres manejadores de arrastre viven en el propio <button>
                        —que lo llena entero— y no en el <div> de alrededor: un
                        elemento estático con manejadores de puntero es
                        exactamente lo que prohíbe la regla de jsx-a11y sobre
                        interacciones en elementos estáticos, y el botón ya es un
                        elemento interactivo nativo. */}
                    <div
                        className={cn(
                            'relative rounded-2xl border-2 border-dashed transition-all duration-300',
                            isDragOver
                                ? 'border-accent/60 bg-accent/5'
                                : 'border-stroke-edge hover:border-brass-600',
                        )}
                    >
                        <button
                            type="button"
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className="flex w-full flex-col items-center justify-center gap-3 p-6 rounded-2xl cursor-pointer"
                        >
                            {/* <span>, no <div>: el modelo de contenido de
                                <button> es contenido de frase, y un <div>
                                dentro es HTML inválido (§12.8). */}
                            <span
                                className={cn(
                                    'p-3 rounded-2xl transition-colors',
                                    isDragOver ? 'bg-accent/10' : 'bg-surface-3',
                                )}
                            >
                                <Upload
                                    className={cn(
                                        'h-6 w-6 transition-colors',
                                        isDragOver ? 'text-accent' : 'text-content-muted',
                                    )}
                                    aria-hidden="true"
                                />
                            </span>
                            <span className="text-center">
                                <span
                                    className={cn(
                                        'block text-sm font-medium transition-colors',
                                        isDragOver ? 'text-accent' : 'text-content-muted',
                                    )}
                                >
                                    {isDragOver
                                        ? 'Suelta los archivos aquí'
                                        : 'Subir documentos'}
                                </span>
                                <span className="block text-micro text-content-muted mt-1.5 font-mono uppercase">
                                    {ALLOWED_EXTENSIONS.join(' · ')} — Máx {formatFileSize(MAX_FILE_SIZE)}
                                </span>
                                <span className="block text-micro text-content-muted mt-1">
                                    También puedes arrastrarlos aquí.
                                </span>
                            </span>
                        </button>

                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept={ALLOWED_EXTENSIONS.join(',')}
                            aria-label="Subir documentos a la base de conocimiento"
                            onChange={(e) => {
                                handleFiles(e.target.files);
                                e.target.value = '';
                            }}
                            className="sr-only"
                        />
                    </div>
                </div>
            )}
        </motion.div>
    );
}
