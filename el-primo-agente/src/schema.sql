-- ============================================================
--  Esquema de la base de datos D1  (CRM centralizado EL PRIMO)
--  Fuente única de verdad para TODOS los agentes.
--  Aplicar con:
--    wrangler d1 execute elprimo-crm --file=src/schema.sql            (remoto)
--    wrangler d1 execute elprimo-crm --local --file=src/schema.sql    (local)
-- ============================================================

-- Registro de agentes (permite gestionar varios desde el dashboard)
CREATE TABLE IF NOT EXISTS agents (
  id            TEXT PRIMARY KEY,            -- ej. "el-primo-agente"
  name          TEXT NOT NULL,              -- nombre legible para el panel
  twilio_number TEXT,                       -- número remitente de WhatsApp
  active        INTEGER NOT NULL DEFAULT 1, -- 1 = activo, 0 = pausado
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Prospectos / clientes
CREATE TABLE IF NOT EXISTS leads (
  id            TEXT PRIMARY KEY,            -- uuid
  agent_id      TEXT NOT NULL DEFAULT 'el-primo-agente',
  name          TEXT,
  phone         TEXT NOT NULL UNIQUE,        -- E.164 normalizado, ej. +573001234567
  city          TEXT,
  budget        INTEGER NOT NULL DEFAULT 0,  -- COP
  project_type  TEXT,                        -- tipo de mueble/proyecto (cocina, closet...)
  stage         TEXT NOT NULL DEFAULT 'nuevo',         -- nuevo|en_proceso|calificado|rechazado
  qualification TEXT NOT NULL DEFAULT 'en_proceso',    -- en_proceso|calificado
  tiers_json    TEXT,                        -- JSON con los tiers estimados
  hubspot_contact_id TEXT,                    -- id del contacto espejado en HubSpot
  hubspot_deal_id    TEXT,                    -- id del deal espejado en HubSpot
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_agent  ON leads(agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_stage  ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_phone  ON leads(phone);

-- Historial de conversación (memoria del agente + hilo para el dashboard)
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id    TEXT NOT NULL,
  direction  TEXT NOT NULL,                  -- 'in' (cliente) | 'out' (agente/humano)
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);

CREATE INDEX IF NOT EXISTS idx_messages_lead ON messages(lead_id, id);

-- Auditoría / analítica (calificaciones, avisos al dueño, errores, etc.)
CREATE TABLE IF NOT EXISTS events (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id      TEXT,
  type         TEXT NOT NULL,                -- ej. qualified|owner_notified|stage_change|error
  payload_json TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_lead ON events(lead_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);

-- Semilla del agente principal (idempotente)
INSERT OR IGNORE INTO agents (id, name, twilio_number)
VALUES ('el-primo-agente', 'EL PRIMO · Ventas WhatsApp', NULL);
