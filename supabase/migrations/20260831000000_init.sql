-- 1. EXTENSÕES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABELAS
CREATE TABLE IF NOT EXISTS public.households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Minha Casa',
  invite_code TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.household_members (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#10b981',
  avatar_emoji TEXT DEFAULT '👤',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  brand TEXT,
  alternative_brands TEXT[] DEFAULT '{}',
  barcode TEXT,
  image_url TEXT,
  unit TEXT NOT NULL DEFAULT 'un',
  average_price NUMERIC(10,2) DEFAULT 0,
  last_price NUMERIC(10,2) DEFAULT 0,
  last_price_date TIMESTAMPTZ,
  last_store TEXT,
  purchase_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.price_records (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  receipt_id TEXT,
  price NUMERIC(10,2) NOT NULL,
  quantity NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'un',
  store_name TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.shopping_lists (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.shopping_list_items (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  list_id TEXT NOT NULL REFERENCES public.shopping_lists(id) ON DELETE CASCADE,
  product_id TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  brand TEXT,
  alternative_brands TEXT[] DEFAULT '{}',
  selected_brand TEXT,
  image_url TEXT,
  quantity NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'un',
  average_price NUMERIC(10,2) DEFAULT 0,
  last_price NUMERIC(10,2) DEFAULT 0,
  is_checked BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.reminders (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_member_id TEXT,
  checklist JSONB DEFAULT '[]'::jsonb,
  due_date DATE,
  is_completed BOOLEAN DEFAULT FALSE,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.receipts (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  list_id TEXT,
  store_name TEXT NOT NULL,
  access_key TEXT,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  purchase_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  raw_type TEXT NOT NULL DEFAULT 'qr_code',
  items JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. RLS & PERMISSÕES
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura e escrita para membros" ON public.households FOR ALL USING (true);
CREATE POLICY "Acesso a membros" ON public.household_members FOR ALL USING (true);
CREATE POLICY "Acesso a produtos" ON public.products FOR ALL USING (true);
CREATE POLICY "Acesso a historico de precos" ON public.price_records FOR ALL USING (true);
CREATE POLICY "Acesso a listas de compras" ON public.shopping_lists FOR ALL USING (true);
CREATE POLICY "Acesso a itens da lista" ON public.shopping_list_items FOR ALL USING (true);
CREATE POLICY "Acesso a lembretes" ON public.reminders FOR ALL USING (true);
CREATE POLICY "Acesso a notas fiscais" ON public.receipts FOR ALL USING (true);

-- 4. REALTIME EM TEMPO REAL
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_lists;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_list_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reminders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.household_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.receipts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.price_records;

