-- migrate-003-curator.sql
-- Sistema de Curación Autónoma (Self-Improving Agent)
-- Aplicar con: npx wrangler d1 execute elprimo-crm --remote --file=src/migrate-003-curator.sql

-- Traza de cada interacción (Capa de Ejecución - USA)
CREATE TABLE IF NOT EXISTS conversation_traces (
  id              TEXT PRIMARY KEY,
  lead_id         TEXT NOT NULL,
  correlation_id  TEXT NOT NULL,
  input_raw       TEXT NOT NULL,       -- Mensaje crudo del usuario
  output_raw      TEXT NOT NULL,       -- Respuesta generada
  stage_before    TEXT NOT NULL,
  stage_after     TEXT NOT NULL,
  is_qualified    INTEGER NOT NULL DEFAULT 0,  -- 0/1
  latency_ms      INTEGER NOT NULL DEFAULT 0,
  model           TEXT NOT NULL,
  tokens_used     INTEGER DEFAULT 0,
  judge_score     REAL,                -- 1.0–5.0, NULL hasta que se juzgue
  judge_feedback  TEXT,                -- JSON: { mapping, extraction, resilience, critique }
  promoted        INTEGER DEFAULT 0,   -- 1 = promovido a few_shots
  flagged_pruning INTEGER DEFAULT 0,   -- 1 = marcado para deshabilitar
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Casos perfectos para Few-Shot dinámico (Capa Consolida)
CREATE TABLE IF NOT EXISTS few_shots (
  id           TEXT PRIMARY KEY,
  trace_id     TEXT NOT NULL,
  project_type TEXT,                   -- Contexto: tipo de proyecto
  budget_tier  TEXT,                   -- 'bajo' | 'medio' | 'alto' | 'muy_alto'
  input        TEXT NOT NULL,          -- Mensaje del usuario
  ideal_output TEXT NOT NULL,          -- Respuesta perfecta del agente
  avg_score    REAL NOT NULL DEFAULT 5.0,
  use_count    INTEGER DEFAULT 0,
  is_active    INTEGER DEFAULT 1,      -- 0 = podado
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_traces_lead    ON conversation_traces(lead_id);
CREATE INDEX IF NOT EXISTS idx_traces_judged  ON conversation_traces(judge_score, created_at);
CREATE INDEX IF NOT EXISTS idx_few_project    ON few_shots(project_type, is_active);
