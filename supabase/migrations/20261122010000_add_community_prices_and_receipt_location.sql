-- Adiciona dados de localização exata da loja em receipts e cria banco comunitário anônimo de preços
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS store_cnpj TEXT,
  ADD COLUMN IF NOT EXISTS store_address TEXT,
  ADD COLUMN IF NOT EXISTS store_neighborhood TEXT,
  ADD COLUMN IF NOT EXISTS store_city TEXT,
  ADD COLUMN IF NOT EXISTS store_state TEXT;

CREATE TABLE IF NOT EXISTS public.community_prices (
  id TEXT PRIMARY KEY,
  source_receipt_key TEXT,
  barcode TEXT,
  normalized_key TEXT NOT NULL,
  product_name TEXT NOT NULL,
  brand TEXT,
  category TEXT NOT NULL DEFAULT 'Outros',
  unit TEXT NOT NULL DEFAULT 'un',
  unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price > 0 AND unit_price < 50000),
  store_name TEXT NOT NULL,
  store_cnpj TEXT,
  store_address TEXT,
  store_neighborhood TEXT,
  store_city TEXT,
  store_state TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_prices_barcode
  ON public.community_prices(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_community_prices_norm_key
  ON public.community_prices(normalized_key);
CREATE INDEX IF NOT EXISTS idx_community_prices_city_state
  ON public.community_prices(store_state, store_city);
CREATE INDEX IF NOT EXISTS idx_community_prices_observed_at
  ON public.community_prices(observed_at DESC);

ALTER TABLE public.community_prices DISABLE ROW LEVEL SECURITY;
