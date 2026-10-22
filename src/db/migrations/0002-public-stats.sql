-- Página de estadísticas pública opcional por enlace (/_/stats/<alias>)
ALTER TABLE links ADD COLUMN public_stats INTEGER NOT NULL DEFAULT 0;
