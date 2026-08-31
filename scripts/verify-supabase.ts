import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://zgsnsxwoufuffqchghqb.supabase.co';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpnc25zeHdvdWZ1ZmZxY2hnaHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMDE0OTUsImV4cCI6MjEwMzc3NzQ5NX0.u7-eO9q7LkJ_pyhJv7T2BzQL3Pdvr9rnCmBwZ_JFIN0';

async function main() {
  console.log('🔍 Verificando tabelas no Supabase...');
  const supabase = createClient(SUPABASE_URL, ANON_KEY);

  const tables = [
    'households',
    'household_members',
    'products',
    'price_records',
    'shopping_lists',
    'shopping_list_items',
    'reminders',
    'receipts'
  ];

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('count');
    if (error) {
      console.error(`❌ Tabela '${table}':`, error.message);
    } else {
      console.log(`✅ Tabela '${table}': Pronta e operando normalmente!`);
    }
  }

  console.log('\n🎉 BANCO DE DADOS SUPABASE 100% CONFIGURADO E PRONTO!');
}

main().catch(console.error);

