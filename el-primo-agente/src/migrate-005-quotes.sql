-- Fase 2a: tabla de cotizaciones/borradores (Centro de Cotización)
-- Aplica con:
--   npx wrangler d1 execute elprimo-crm --remote --file=src/migrate-005-quotes.sql
CREATE TABLE IF NOT EXISTS quotes (
  id           TEXT PRIMARY KEY,
  lead_id      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'borrador',  -- borrador | enviada
  params_json  TEXT,        -- QuoteParams (tipos, metros, material, etc.)
  pricing_json TEXT,        -- ResultadoCotizacion del cotizador
  prose_json   TEXT,        -- ContenidoIA editable (titulo, entendimiento, entregables, cierre)
  render_key   TEXT,        -- clave del PNG en R2 (null si no se generó)
  plan_key     TEXT,        -- clave del SVG en R2
  docx_key     TEXT,        -- clave del DOCX final en R2
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (lead_id) REFERENCES leads(id)
);
CREATE INDEX IF NOT EXISTS idx_quotes_lead ON quotes(lead_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
