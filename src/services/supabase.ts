import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client configuration for cloud synchronization & authentication.
 * OrganoCasa works 100% Local-First via IndexedDB even without Supabase.
 */

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  enabled: boolean;
}

export const DEFAULT_SUPABASE_URL = 'https://zgsnsxwoufuffqchghqb.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpnc25zeHdvdWZ1ZmZxY2hnaHFiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgyMDE0OTUsImV4cCI6MjEwMzc3NzQ5NX0.u7-eO9q7LkJ_pyhJv7T2BzQL3Pdvr9rnCmBwZ_JFIN0';

let cachedClient: SupabaseClient | null = null;
let lastClientKey: string = '';

export function getSupabaseConfig(): SupabaseConfig {
  const url = (
    localStorage.getItem('organocasa_supabase_url') ||
    import.meta.env.VITE_SUPABASE_URL ||
    DEFAULT_SUPABASE_URL
  ).trim();

  const anonKey = (
    localStorage.getItem('organocasa_supabase_key') ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    DEFAULT_SUPABASE_ANON_KEY
  ).trim();

  return {
    url,
    anonKey,
    enabled: Boolean(url && anonKey)
  };
}

export function saveSupabaseConfig(url: string, anonKey: string): void {
  localStorage.setItem('organocasa_supabase_url', url.trim());
  localStorage.setItem('organocasa_supabase_key', anonKey.trim());
  cachedClient = null; // Reset cached client instance
}

export function clearSupabaseConfig(): void {
  localStorage.removeItem('organocasa_supabase_url');
  localStorage.removeItem('organocasa_supabase_key');
  cachedClient = null;
}

export function getSupabaseClient(): SupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config.enabled) return null;

  const currentKey = `${config.url}-${config.anonKey}`;
  if (cachedClient && lastClientKey === currentKey) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
    lastClientKey = currentKey;
    return cachedClient;
  } catch (error) {
    console.error('Erro ao inicializar cliente Supabase:', error);
    return null;
  }
}

/**
 * Tests connection with Supabase by checking basic connectivity
 */
export async function testSupabaseConnection(
  urlInput?: string,
  keyInput?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const url = urlInput?.trim() || getSupabaseConfig().url;
    const key = keyInput?.trim() || getSupabaseConfig().anonKey;

    if (!url || !key) {
      return { success: false, message: 'URL e Chave Anônima do Supabase são obrigatórios.' };
    }

    if (!url.startsWith('https://')) {
      return { success: false, message: 'A URL do Supabase deve começar com https://' };
    }

    const testClient = createClient(url, key);
    
    // Quick test query
    const { error } = await testClient.from('shopping_lists').select('id').limit(1);

    if (error && error.code !== 'PGRST116') {
      // If table doesn't exist yet or connection problem
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        return {
          success: true,
          message: 'Conectado ao Supabase com sucesso! (Lembre-se de rodar o script schema.sql no SQL Editor)'
        };
      }
      return { success: false, message: `Erro do Supabase: ${error.message}` };
    }

    return { success: true, message: 'Conexão com o Supabase estabelecida com sucesso!' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Falha ao conectar ao Supabase.' };
  }
}
