-- ==============================================================================
-- SCHEMA SQL PARA O SUPABASE - ORGANOCASA
-- Copie e cole este script no "SQL Editor" do seu painel do Supabase e clique em "Run"
-- ==============================================================================

-- 1. Tabela de Espaços Familiares (Households)
CREATE TABLE IF NOT EXISTS public.households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela de Membros da Família
CREATE TABLE IF NOT EXISTS public.household_members (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#10b981',
  avatar_emoji TEXT DEFAULT '👤',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabela de Listas de Compras
CREATE TABLE IF NOT EXISTS public.shopping_lists (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabela de Itens da Lista de Compras
CREATE TABLE IF NOT EXISTS public.shopping_list_items (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  list_id TEXT NOT NULL,
  product_id TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  brand TEXT,
  alternative_brands JSONB DEFAULT '[]'::jsonb,
  selected_brand TEXT,
  image_url TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'un',
  average_price NUMERIC DEFAULT 0,
  last_price NUMERIC DEFAULT 0,
  is_checked BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabela de Produtos do Catálogo & Preço Médio
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  brand TEXT,
  alternative_brands JSONB DEFAULT '[]'::jsonb,
  barcode TEXT,
  image_url TEXT,
  unit TEXT NOT NULL DEFAULT 'un',
  average_price NUMERIC DEFAULT 0,
  last_price NUMERIC DEFAULT 0,
  last_price_date TIMESTAMPTZ,
  last_store TEXT,
  purchase_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Tabela de Lembretes da Casa (com Checklists)
CREATE TABLE IF NOT EXISTS public.reminders (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_member_id TEXT,
  checklist JSONB DEFAULT '[]'::jsonb,
  due_date TEXT,
  is_completed BOOLEAN DEFAULT FALSE,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Tabela de Notas Fiscais Registradas
CREATE TABLE IF NOT EXISTS public.receipts (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  list_id TEXT,
  store_name TEXT NOT NULL,
  access_key TEXT,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  purchase_date TIMESTAMPTZ DEFAULT NOW(),
  raw_type TEXT DEFAULT 'qr_code',
  items JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Tabela de Histórico Individual de Preços
CREATE TABLE IF NOT EXISTS public.price_records (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  receipt_id TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT NOT NULL DEFAULT 'un',
  store_name TEXT NOT NULL,
  date TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices de performance para busca por household
CREATE INDEX IF NOT EXISTS idx_shopping_items_household ON public.shopping_list_items(household_id);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_household ON public.shopping_lists(household_id);
CREATE INDEX IF NOT EXISTS idx_products_household ON public.products(household_id);
CREATE INDEX IF NOT EXISTS idx_reminders_household ON public.reminders(household_id);
CREATE INDEX IF NOT EXISTS idx_receipts_household ON public.receipts(household_id);
CREATE INDEX IF NOT EXISTS idx_price_records_household ON public.price_records(household_id);

-- Desabilitar RLS ou permitir acesso para chave pública anônima
ALTER TABLE public.households DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_lists DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_list_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_records DISABLE ROW LEVEL SECURITY;

-- Ativar Publicação Realtime para todas as tabelas (Sincronização instantânea entre celulares)
ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_lists;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_list_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reminders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.receipts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.price_records;

