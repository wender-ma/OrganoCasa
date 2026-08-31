import { execSync } from 'child_process';
import { createClient } from '@supabase/supabase-js';

/**
 * Script para rodar a migration automaticamente usando o Supabase CLI.
 * Uso: npx tsx scripts/auto-migrate.ts <DB_PASSWORD>
 */

const projectRef = 'zgsnsxwoufuffqchghqb';
const password = process.argv[2] || process.env.SUPABASE_DB_PASSWORD;

if (!password) {
  console.error('❌ Informe a senha do banco de dados: npx tsx scripts/auto-migrate.ts <SENHA>');
  process.exit(1);
}

try {
  console.log(`🚀 Executando migração no Supabase (projeto ${projectRef})...`);
  
  const cmd = `npx supabase db push --project-ref ${projectRef} --password "${password}" --yes`;
  const output = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
  console.log(output);
  console.log('✅ Migração aplicada com sucesso!');
} catch (err: any) {
  console.error('❌ Erro na migração:', err.stderr || err.message);
  process.exit(1);
}

