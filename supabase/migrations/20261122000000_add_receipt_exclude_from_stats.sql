-- Marca notas fiscais cadastradas apenas para histórico de preços (excluídas do custo e comparativo mensal)
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS exclude_from_stats BOOLEAN NOT NULL DEFAULT FALSE;
