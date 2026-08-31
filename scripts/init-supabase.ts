import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Script para inicializar e testar a conexão com o Supabase automaticamente.
 * Uso: npx tsx scripts/init-supabase.ts <SUPABASE_URL> <SUPABASE_ANON_KEY>
 */

async function main() {
  const url = process.argv[2] || process.env.VITE_SUPABASE_URL;
  const key = process.argv[3] || process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error('❌ Uso: npx tsx scripts/init-supabase.ts <SUPABASE_URL> <SUPABASE_ANON_KEY>');
    process.exit(1);
  }

  console.log(`📡 Conectando ao Supabase em: ${url}...`);

  const supabase = createClient(url, key);

  try {
    // 1. Test query
    const { data, error } = await supabase.from('shopping_lists').select('id').limit(1);

    if (error) {
      console.warn('⚠️ Aviso ao consultar shopping_lists:', error.message);
    } else {
      console.log('✅ Conexão com o Supabase estabelecida com sucesso!');
    }

    // 2. Salvar arquivo .env.local
    const envContent = `# Configurações do OrganoCasa
VITE_SUPABASE_URL=${url}
VITE_SUPABASE_ANON_KEY=${key}
`;
    const envPath = path.resolve(process.cwd(), '.env.local');
    fs.writeFileSync(envPath, envContent, 'utf-8');
    console.log(`💾 Arquivo .env.local salvo com sucesso!`);

    console.log('🎉 Supabase configurado e pronto para uso!');
  } catch (err: any) {
    console.error('❌ Erro durante a inicialização:', err.message);
    process.exit(1);
  }
}

main();

