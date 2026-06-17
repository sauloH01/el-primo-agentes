// src/services/hubspot.ts
// Espejo de leads de WhatsApp hacia HubSpot, reusando el MISMO esquema de campos
// que elprimo-lead-worker para que el lead del formulario y el de WhatsApp se unan
// en un solo contacto (dedupe por `telefono_whatsapp_normalizado`).
import type { Lead, Env } from "../types";

interface ContactProps {
  firstname?: string;
  phone?: string;
  telefono_whatsapp_normalizado?: string;
  zona_proyecto?: string;
  tipo_proyecto?: string;
  presupuesto_rango?: string;
  mensaje_lead?: string;
  fuente_lead?: string;
}

interface DealProps {
  dealname: string;
  amount: string;
  pipeline: string;
  dealstage: string;
  pipeline_currency_code?: string;
}

const HS = "https://api.hubapi.com";

export class HubSpotClient {
  private headers: Record<string, string>;
  constructor(
    private env: Pick<Env, "HUBSPOT_ACCESS_TOKEN" | "HUBSPOT_PIPELINE_ID" | "HUBSPOT_DEALSTAGE_ID">
  ) {
    this.headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.HUBSPOT_ACCESS_TOKEN}`,
    };
  }

  /** Busca un contacto por teléfono normalizado; devuelve su id o null. */
  async findContactByPhone(normalizedPhone: string): Promise<string | null> {
    if (!normalizedPhone) return null;
    try {
      const res = await fetch(`${HS}/crm/v3/objects/contacts/search`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                {
                  propertyName: "telefono_whatsapp_normalizado",
                  operator: "EQ",
                  value: normalizedPhone,
                },
              ],
            },
          ],
          properties: ["firstname"],
          limit: 1,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { total: number; results: { id: string }[] };
        if (data.total > 0) return data.results[0].id;
      }
    } catch (err) {
      console.warn("[HubSpot] búsqueda de contacto falló:", err);
    }
    return null;
  }

  /** Crea un contacto; maneja 409 (ya existe) devolviendo el id existente. */
  async createContact(props: ContactProps): Promise<string> {
    const res = await fetch(`${HS}/crm/v3/objects/contacts`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ properties: props }),
    });
    if (res.ok) return ((await res.json()) as { id: string }).id;

    const err = (await res.json().catch(() => ({}))) as { message?: string };
    const msg = err.message ?? res.statusText;
    if (res.status === 409) {
      const m = msg.match(/Existing ID:\s*(\d+)/);
      if (m) return m[1];
    }
    throw new Error(`HubSpot crear contacto: HTTP ${res.status} — ${msg}`);
  }

  async updateContact(id: string, props: ContactProps): Promise<void> {
    const res = await fetch(`${HS}/crm/v3/objects/contacts/${id}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify({ properties: props }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.warn(`[HubSpot] actualizar contacto ${id}: HTTP ${res.status} ${t}`);
    }
  }

  /** Busca o crea por teléfono; devuelve el contactId. */
  async upsertContactByPhone(normalizedPhone: string, props: ContactProps): Promise<string> {
    const existing = await this.findContactByPhone(normalizedPhone);
    if (existing) {
      await this.updateContact(existing, props);
      return existing;
    }
    return this.createContact(props);
  }

  /** Crea un Deal con reintento sin moneda si HubSpot la rechaza. Devuelve id o null. */
  async createDeal(props: DealProps): Promise<string | null> {
    try {
      const res = await fetch(`${HS}/crm/v3/objects/deals`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ properties: props }),
      });
      if (res.ok) return ((await res.json()) as { id: string }).id;

      // Reintento sin pipeline_currency_code
      const { pipeline_currency_code: _omit, ...rest } = props;
      const res2 = await fetch(`${HS}/crm/v3/objects/deals`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify({ properties: rest }),
      });
      if (res2.ok) return ((await res2.json()) as { id: string }).id;

      const e = await res2.text().catch(() => "");
      console.warn(`[HubSpot] crear deal: HTTP ${res2.status} ${e}`);
      return null;
    } catch (err) {
      console.error("[HubSpot] excepción creando deal:", err);
      return null;
    }
  }

  async associateDealToContact(dealId: string, contactId: string): Promise<void> {
    try {
      const res = await fetch(
        `${HS}/crm/v3/objects/deals/${dealId}/associations/contact/${contactId}/deal_to_contact`,
        { method: "PUT", headers: this.headers }
      );
      if (!res.ok) console.warn(`[HubSpot] asociar deal↔contacto: HTTP ${res.status}`);
    } catch (err) {
      console.error("[HubSpot] excepción asociando:", err);
    }
  }
}

/* ----------------------------- Mapeos ----------------------------- */

export function leadToContactProps(lead: Lead): ContactProps {
  const props: ContactProps = {
    firstname: lead.name ?? "Cliente WhatsApp",
    phone: lead.phone,
    telefono_whatsapp_normalizado: lead.phone,
    fuente_lead: "WhatsApp Agente IA",
  };
  if (lead.city) props.zona_proyecto = lead.city;
  if (lead.projectType) props.tipo_proyecto = lead.projectType;
  if (lead.budget) props.presupuesto_rango = `$${lead.budget.toLocaleString("es-CO")} COP`;
  return props;
}

export function leadToDealProps(
  lead: Lead,
  env: Pick<Env, "HUBSPOT_PIPELINE_ID" | "HUBSPOT_DEALSTAGE_ID">
): DealProps {
  const tipo = lead.projectType?.trim() || "Proyecto";
  const zona = lead.city?.trim() || "General";
  const nombre = lead.name?.trim() || "Lead WhatsApp";
  // Monto: tier Premium si existe, si no el presupuesto, si no el mínimo.
  const premium = lead.tiers.find((t) => /premium/i.test(t.tier));
  const amount = premium?.price || lead.budget || lead.tiers[0]?.price || 4_000_000;
  return {
    dealname: `${tipo} | ${zona} — ${nombre}`.substring(0, 255),
    amount: String(Math.round(amount)),
    pipeline: env.HUBSPOT_PIPELINE_ID,
    dealstage: env.HUBSPOT_DEALSTAGE_ID,
    pipeline_currency_code: "COP",
  };
}
