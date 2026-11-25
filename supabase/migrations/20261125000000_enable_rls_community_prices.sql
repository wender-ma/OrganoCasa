-- Habilita Row-Level Security (RLS) em community_prices mantendo leitura pública e inserção validada sem permitir UPDATE/DELETE público
ALTER TABLE public.community_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura pública de preços comunitários" ON public.community_prices;
CREATE POLICY "Leitura pública de preços comunitários"
  ON public.community_prices
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Contribuição anônima de preços válidos" ON public.community_prices;
CREATE POLICY "Contribuição anônima de preços válidos"
  ON public.community_prices
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    unit_price > 0
    AND unit_price < 50000
    AND char_length(trim(product_name)) >= 2
    AND char_length(trim(store_name)) >= 2
  );
