-- Fase 1: columna source para distinguir leads del formulario landing vs WhatsApp orgánico
-- Aplica con:
--   npx wrangler d1 execute elprimo-crm --remote --file=src/migrate-004-source.sql
ALTER TABLE leads ADD COLUMN source TEXT NOT NULL DEFAULT 'organico';
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
