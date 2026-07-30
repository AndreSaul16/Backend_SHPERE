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
 */
import { Link2, Wrench } from "lucide-react";

import { IntegrationsSettings } from "@/pages/settings/IntegrationsSettings";
import { ServiceCredentialsSettings } from "@/pages/settings/ServiceCredentialsSettings";

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
      <div className="h-10 w-10 rounded-xl bg-electric-cyan/10 flex items-center justify-center text-electric-cyan shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="text-base font-semibold text-content-strong">{title}</h3>
        <p className="text-xs text-content-muted">{subtitle}</p>
      </div>
    </div>
  );
}

export function ConnectionsSettings() {
  return (
    <div className="space-y-10">
      {/* 1. Integraciones OAuth (BYO) */}
      <section className="space-y-5">
        <SectionHeader
          icon={<Link2 className="h-5 w-5" />}
          title="Integraciones (OAuth)"
          subtitle="Conecta tu cuenta de GitHub, Notion o Slack con tu propia OAuth app."
        />
        <IntegrationsSettings />
      </section>

      <div className="border-t border-surface-highlight" />

      {/* 2. Credenciales de herramientas (n8n) */}
      <section className="space-y-5">
        <SectionHeader
          icon={<Wrench className="h-5 w-5" />}
          title="Credenciales de herramientas"
          subtitle="API keys de servicios que los agentes usan al actuar en tu nombre (Calendar, WhatsApp, LinkedIn…)."
        />
        <ServiceCredentialsSettings />
      </section>
    </div>
  );
}
