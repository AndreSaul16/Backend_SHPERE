/**
 * Sección Conexiones: unifica en una sola página las dos formas de conectar
 * SPHERE con servicios externos, que para el usuario son "lo mismo":
 *
 *  1. Integraciones OAuth (BYO): el usuario registra su propia OAuth app de
 *     GitHub/Notion/Slack y conecta su cuenta. → <IntegrationsSettings />
 *  2. Credenciales de herramientas: API keys de servicios que los agentes usan
 *     vía n8n (Google Calendar, WhatsApp, LinkedIn, Instagram, Jules).
 *     → <ServiceCredentialsSettings />
 *
 * Antes vivían en dos pestañas separadas ("Integraciones" y "API Keys"). Se
 * fusionaron aquí para una única superficie de "conexiones".
 *
 * **6.8 — por qué esto es un acordeón y no una pila.** Fusionar las dos
 * pestañas resolvió el problema conceptual y creó uno físico: diez servicios,
 * cada uno con su formulario abierto, unas seis pantallas de scroll. Para tocar
 * la clave de Instagram había que pasar por delante de las otras nueve, y con
 * todo desplegado la pregunta que la gente trae aquí —«¿qué tengo puesto?»— no
 * tenía respuesta de un vistazo.
 *
 * Ahora cada servicio es una fila plegada que dice su estado con texto, hay un
 * buscador que filtra las dos mitades a la vez, y **sólo hay un servicio
 * abierto en toda la página**: por eso el estado de apertura vive aquí y no en
 * cada mitad. Con las diez filas plegadas caben todas en una pantalla, y el
 * buscador recorta a una: eso es «ir a uno concreto sin scroll» sin tener que
 * inventar un índice aparte.
 */
import { useState } from "react";
import { Link2, Search, Wrench, X } from "lucide-react";

import { IntegrationsSettings } from "@/pages/settings/IntegrationsSettings";
import { ServiceCredentialsSettings } from "@/pages/settings/ServiceCredentialsSettings";
import { normalizar, type ControlDeAcordeon } from "@/pages/settings/conexionesAcordeon";

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-9 w-9 rounded-sm border border-stroke-edge bg-accent/12 flex items-center justify-center text-accent shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-content-strong">{title}</h3>
        <p className="text-xs text-content-muted">{subtitle}</p>
      </div>
    </div>
  );
}

export function ConnectionsSettings() {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");

  const control: ControlDeAcordeon = {
    abierto,
    // Volver a pulsar la cabecera abierta la cierra: es la salida obvia y
    // evita que el usuario tenga que abrir otra cosa para cerrar esta.
    alternar: (id) => setAbierto((actual) => (actual === id ? null : id)),
    filtro: normalizar(busqueda.trim()),
  };

  return (
    <div className="space-y-8">
      {/* El buscador filtra las DOS mitades: para el usuario «Calendar» es un
          servicio, no dos categorías de implementación. */}
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-quiet"
        />
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar un servicio…"
          aria-label="Buscar un servicio"
          className="h-11 w-full rounded-sm border border-stroke-control bg-surface-inset ps-9 pe-9 text-sm text-content placeholder:text-content-quiet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
        />
        {busqueda && (
          <button
            type="button"
            onClick={() => setBusqueda("")}
            aria-label="Borrar la búsqueda"
            className="absolute end-2 top-1/2 -translate-y-1/2 rounded-xs p-1.5 text-content-quiet hover:text-content-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* 1. Integraciones OAuth (BYO) */}
      <section className="space-y-4">
        <SectionHeader
          icon={<Link2 className="h-5 w-5" />}
          title="Integraciones (OAuth)"
          subtitle="Conecta tu cuenta de GitHub, Notion o Slack con tu propia OAuth app."
        />
        <IntegrationsSettings control={control} />
      </section>

      <div className="border-t border-stroke-hairline" />

      {/* 2. Credenciales de herramientas (n8n) */}
      <section className="space-y-4">
        <SectionHeader
          icon={<Wrench className="h-5 w-5" />}
          title="Credenciales de herramientas"
          subtitle="API keys de servicios que los agentes usan al actuar en tu nombre (Calendar, WhatsApp, LinkedIn…)."
        />
        <ServiceCredentialsSettings control={control} />
      </section>
    </div>
  );
}
