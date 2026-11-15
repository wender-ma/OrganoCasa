-- Adiciona autoria de quem adicionou o item na lista de compras
ALTER TABLE public.shopping_list_items
  ADD COLUMN IF NOT EXISTS added_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS added_by_member_id TEXT,
  ADD COLUMN IF NOT EXISTS added_by_name TEXT;
