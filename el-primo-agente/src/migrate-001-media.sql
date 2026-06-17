-- ============================================================
--  Migración 001: soporte de medios en mensajes
--  Aplicar contra la base EXISTENTE (no recrea tablas):
--    wrangler d1 execute elprimo-crm --file=src/migrate-001-media.sql            (remoto)
--    wrangler d1 execute elprimo-crm --local --file=src/migrate-001-media.sql    (local)
-- ============================================================

-- Nuevas columnas en messages para medios de WhatsApp:
--   media_type  → 'audio' | 'image' | 'video' | 'document' | 'location' | null
--   media_url   → URL del medio en Twilio (si aplica)
--   transcription → texto transcripto (Whisper/Vision) o descripción del medio
ALTER TABLE messages ADD COLUMN media_type    TEXT;
ALTER TABLE messages ADD COLUMN media_url     TEXT;
ALTER TABLE messages ADD COLUMN transcription TEXT;

-- Nota: el stage 'cotizado' se agrega solo en el código (Stage type).
-- D1 usa TEXT para stage, así que no requiere cambio de esquema.
