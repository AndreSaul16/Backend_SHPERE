/**
 * El nombre que el usuario lee cuando un agente usa una herramienta.
 *
 * ── Por qué vive en su propio fichero ──────────────────────────────────────
 * Esto estaba dentro de `ToolExecutionCard.tsx`, y la consecuencia no era
 * estética: 7 herramientas OAuth (GitHub, Slack, Notion) se registraron sin
 * pasar por aquí, así que la tarjeta caía al identificador técnico y en el hilo
 * se leía literalmente «slack_post_message — falló». Nadie lo notó porque
 * ningún test podía cruzar las dos listas: una vive en Python y otra en TS.
 *
 * Ahora `backend/tests/test_tool_catalog.py` lee ESTE fichero y lo cruza contra
 * el registry real, en los dos sentidos: una herramienta registrada sin
 * etiqueta rompe la suite, y una etiqueta sin herramienta también.
 *
 * ── Contrato de formato ────────────────────────────────────────────────────
 * Una clave por línea, `nombre_de_tool: 'Texto legible',`. El test extrae las
 * claves con un regex; si esto se reescribe como objeto calculado o se mueve de
 * sitio, el test falla y hay que arreglar el regex. Ese es el precio de no
 * tener un paso de sincronización que alguien pueda olvidar.
 *
 * El texto va en gerundio porque describe algo que está ocurriendo mientras se
 * lee: «Consultando calendario», no «Consultar calendario».
 */
export const TOOL_LABELS: Record<string, string> = {
    // Compartidas — Google Calendar
    calendar_list_events: 'Consultando calendario',
    calendar_create_event: 'Creando evento',
    calendar_update_event: 'Actualizando evento',
    calendar_delete_event: 'Eliminando evento',
    calendar_check_availability: 'Verificando disponibilidad',
    // Compartidas — WhatsApp
    whatsapp_send_message: 'Enviando WhatsApp',
    whatsapp_send_notification: 'Enviando notificación',
    // Compartidas — Slack y Notion (OAuth)
    slack_post_message: 'Publicando en Slack',
    slack_list_channels: 'Consultando canales de Slack',
    notion_create_page: 'Creando página en Notion',
    notion_update_page: 'Actualizando página de Notion',
    // CEO
    delegate_task: 'Delegando tarea',
    check_task_status: 'Consultando estado de tarea',
    list_active_tasks: 'Listando tareas activas',
    // CTO — GitHub (OAuth)
    github_create_repo: 'Creando repositorio',
    github_create_issue: 'Creando issue',
    github_comment_pr: 'Comentando en la pull request',
    // CFO
    get_financial_news: 'Buscando noticias financieras',
    get_stock_data: 'Consultando datos de bolsa',
    // CMO
    post_to_linkedin: 'Publicando en LinkedIn',
    post_to_instagram: 'Publicando en Instagram',
    get_social_analytics: 'Consultando analytics',
    schedule_post: 'Programando publicación',
};
