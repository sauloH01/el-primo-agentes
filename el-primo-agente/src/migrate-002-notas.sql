-- Migración 002: columna notas en leads para que Audenar anote contexto por cliente.
ALTER TABLE leads ADD COLUMN notas TEXT;
