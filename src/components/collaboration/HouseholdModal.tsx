import React, { useState, useEffect } from 'react';
import {
  X,
  Users,
  Mail,
  Lock,
  Copy,
  Check,
  Download,
  Upload,
  LogOut,
  ShieldCheck,
  Sparkles,
  Share2,
  Database,
  RefreshCw,
  Wifi,
  Key,
  ExternalLink,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import {
  getCurrentSession,
  authenticateWithEmail,
  logoutUser,
  joinHouseholdByCode,
  triggerFullSync,
  subscribeSyncStatus,
  exportDatabaseToJson,
  importDatabaseFromJson,
  UserSession,
  SyncStatus
} from '../../services/supabaseSync';
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  clearSupabaseConfig,
  testSupabaseConnection
} from '../../services/supabase';

interface HouseholdModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HouseholdModal: React.FC<HouseholdModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'account' | 'supabase' | 'backup'>('account');
  const [session, setSession] = useState<UserSession | null>(getCurrentSession());
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Supabase Configuration State
  const supabaseConfig = getSupabaseConfig();
  const [supabaseUrl, setSupabaseUrl] = useState(supabaseConfig.url || '');
  const [supabaseKey, setSupabaseKey] = useState(supabaseConfig.anonKey || '');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Sync Status
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSyncedAt: null,
    errorMessage: null,
    isRealtimeActive: false
  });

  useEffect(() => {
    if (isOpen) {
      setSession(getCurrentSession());
      const config = getSupabaseConfig();
      setSupabaseUrl(config.url || '');
      setSupabaseKey(config.anonKey || '');
    }
  }, [isOpen]);

  useEffect(() => {
    const unsubscribe = subscribeSyncStatus((status) => {
      setSyncStatus(status);
    });
    return unsubscribe;
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setLoading(true);
    try {
      const userSession = await authenticateWithEmail(email, password, authMode);
      setSession(userSession);
      showToast(authMode === 'login' ? 'Login realizado com sucesso!' : 'Espaço Familiar criado!');
    } catch (err: any) {
      showToast(err.message || 'Falha na autenticação.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCodeInput.trim()) return;

    setLoading(true);
    try {
      const updated = await joinHouseholdByCode(inviteCodeInput.trim());
      setSession(updated);
      setInviteCodeInput('');
      showToast(`Conectado ao espaço "${updated.householdName}"!`);
    } catch (err: any) {
      showToast(err.message || 'Código inválido.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    setSession(null);
    showToast('Sessão encerrada.');
  };

  const handleCopyInvite = () => {
    if (session?.inviteCode) {
      navigator.clipboard.writeText(session.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast('Código de convite copiado!');
    }
  };

  const handleSaveSupabaseConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await testSupabaseConnection(supabaseUrl, supabaseKey);
      setTestResult(res);

      if (res.success) {
        saveSupabaseConfig(supabaseUrl, supabaseKey);
        showToast('Credenciais do Supabase salvas com sucesso!');
        await triggerFullSync();
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleClearSupabaseConfig = () => {
    clearSupabaseConfig();
    setSupabaseUrl('');
    setSupabaseKey('');
    setTestResult(null);
    showToast('Configuração do Supabase removida.');
  };

  const handleManualSync = async () => {
    showToast('Iniciando sincronização com a nuvem...');
    const ok = await triggerFullSync();
    if (ok) {
      showToast('Sincronização concluída com sucesso!');
    }
  };

  const handleExportBackup = async () => {
    const json = await exportDatabaseToJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `organocasa-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Backup baixado com sucesso!');
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      await importDatabaseFromJson(text);
      showToast('Backup restaurado com sucesso! Recarregando...');
      setTimeout(() => window.location.reload(), 1200);
    } catch {
      showToast('Erro ao restaurar backup. Verifique o arquivo.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Nuvem & Compartilhamento Familiar
              </h3>
              <p className="text-[11px] text-slate-400">
                Sincronização em tempo real via Supabase + Vercel
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 px-4 pt-1 bg-slate-50/50 dark:bg-slate-850/50 text-xs">
          <button
            onClick={() => setActiveTab('account')}
            className={`py-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center space-x-1.5 ${
              activeTab === 'account'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Espaço Familiar</span>
          </button>

          <button
            onClick={() => setActiveTab('supabase')}
            className={`py-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center space-x-1.5 ${
              activeTab === 'supabase'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Supabase Cloud</span>
            {supabaseConfig.enabled && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('backup')}
            className={`py-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center space-x-1.5 ${
              activeTab === 'backup'
                ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Backup Offline</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Toast Notification */}
          {toastMessage && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 animate-in fade-in">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>{toastMessage}</span>
            </div>
          )}

          {/* Sync Status Banner */}
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  syncStatus.isRealtimeActive
                    ? 'bg-emerald-500 animate-pulse'
                    : supabaseConfig.enabled
                    ? 'bg-emerald-500'
                    : 'bg-amber-400'
                }`}
              />
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  {syncStatus.isSyncing
                    ? 'Sincronizando com a Nuvem...'
                    : syncStatus.isRealtimeActive
                    ? 'Sincronização em Tempo Real Ativa'
                    : supabaseConfig.enabled
                    ? 'Conectado ao Supabase'
                    : 'Modo Local (Offline)'}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  {syncStatus.lastSyncedAt
                    ? `Última sincronização: hoje às ${syncStatus.lastSyncedAt}`
                    : 'Alterações salvas localmente'}
                </span>
              </div>
            </div>

            {supabaseConfig.enabled && (
              <button
                type="button"
                onClick={handleManualSync}
                disabled={syncStatus.isSyncing}
                className="px-3 py-1.5 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center space-x-1 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncStatus.isSyncing ? 'animate-spin text-emerald-500' : ''}`} />
                <span>Sincronizar</span>
              </button>
            )}
          </div>

          {/* TAB 1: ACCOUNT & FAMILY PAIRING */}
          {activeTab === 'account' && (
            <div className="space-y-4">
              {session ? (
                /* Logged In State */
                <div className="space-y-4">
                  {/* Account Card */}
                  <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-base shadow-xs">
                        {session.email.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-900 dark:text-white block">
                          {session.email}
                        </span>
                        <span className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1 font-medium">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>{session.householdName}</span>
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={handleLogout}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl transition-colors"
                      title="Sair da conta"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Share Invite Code with Spouse / Family */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Share2 className="w-4 h-4 text-emerald-600" />
                        <span>Código para Conectar Esposa/Marido/Família</span>
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Passe este código para a outra pessoa parear o celular dela e acessar a mesma lista em tempo real:
                    </p>
                    <div className="flex items-center space-x-2 pt-1">
                      <div className="flex-1 px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-mono font-bold text-slate-800 dark:text-slate-200 tracking-widest text-center">
                        {session.inviteCode}
                      </div>
                      <button
                        onClick={handleCopyInvite}
                        className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
                      >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        <span>{copied ? 'Copiado' : 'Copiar'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Join another Household */}
                  <form onSubmit={handleJoinHousehold} className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                      Ou entrar em outro Espaço Familiar existente:
                    </span>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={inviteCodeInput}
                        onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                        placeholder="Ex: CASA-123456"
                        className="flex-1 px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono uppercase focus:ring-2 focus:ring-emerald-500"
                      />
                      <button
                        type="submit"
                        disabled={!inviteCodeInput.trim() || loading}
                        className="px-4 py-2 bg-slate-900 dark:bg-slate-700 hover:bg-black text-white rounded-xl text-xs font-bold disabled:opacity-50"
                      >
                        {loading ? 'Conectando...' : 'Entrar na Casa'}
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                /* Login / Signup Form */
                <div className="space-y-4">
                  <div className="text-center space-y-1">
                    <h4 className="font-bold text-base text-slate-900 dark:text-white">
                      {authMode === 'login' ? 'Acessar Espaço Familiar' : 'Criar Conta Gratuita'}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Sincronize suas listas com a família em tempo real e mantenha salvamento automático.
                    </p>
                  </div>

                  <form onSubmit={handleAuthSubmit} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Seu E-mail
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="exemplo@email.com"
                          className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Senha
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500"
                          required
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all"
                    >
                      {loading
                        ? 'Conectando...'
                        : authMode === 'login'
                        ? 'Entrar na Conta'
                        : 'Criar Espaço Familiar'}
                    </button>
                  </form>

                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                      className="text-xs text-emerald-600 font-semibold hover:underline"
                    >
                      {authMode === 'login'
                        ? 'Ainda não tem conta? Criar espaço gratuito'
                        : 'Já tem conta? Fazer login'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SUPABASE CONFIGURATION */}
          {activeTab === 'supabase' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-emerald-600" />
                  <span>Configuração do Banco Supabase (Gratuito)</span>
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Insira as credenciais do seu projeto no{' '}
                  <a
                    href="https://supabase.com"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-600 font-semibold underline inline-flex items-center gap-0.5"
                  >
                    Supabase.com <ExternalLink className="w-3 h-3" />
                  </a>{' '}
                  (Project Settings &gt; API) para sincronização e salvamento em nuvem.
                </p>
              </div>

              <form onSubmit={handleSaveSupabaseConfig} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Project URL (VITE_SUPABASE_URL)
                  </label>
                  <input
                    type="url"
                    value={supabaseUrl}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                    placeholder="https://xyzproject.supabase.co"
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Anon Public API Key (VITE_SUPABASE_ANON_KEY)
                  </label>
                  <textarea
                    value={supabaseKey}
                    onChange={(e) => setSupabaseKey(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    rows={3}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>

                {/* Connection Test Result */}
                {testResult && (
                  <div
                    className={`p-3 rounded-xl border text-xs flex items-start space-x-2 ${
                      testResult.success
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                        : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  {supabaseConfig.enabled && (
                    <button
                      type="button"
                      onClick={handleClearSupabaseConfig}
                      className="text-xs text-rose-600 font-medium hover:underline"
                    >
                      Remover Conexão
                    </button>
                  )}

                  <div className="flex space-x-2 ml-auto">
                    <button
                      type="submit"
                      disabled={isTesting || !supabaseUrl.trim() || !supabaseKey.trim()}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center space-x-1.5"
                    >
                      {isTesting ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Testando...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Testar & Salvar Conexão</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>

              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-500 space-y-1">
                <span className="font-bold text-slate-700 dark:text-slate-300 block">
                  📄 Script de Banco de Dados Pronto:
                </span>
                <p>
                  O arquivo <code className="bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded font-mono">supabase/schema.sql</code> já está preparado com todas as tabelas, RLS e suporte a Realtime.
                </p>
              </div>
            </div>
          )}

          {/* TAB 3: BACKUP & PORTABILITY */}
          {activeTab === 'backup' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                  Backup Manual & Portabilidade (JSON)
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Exporte ou importe sua base completa de dados (produtos, histórico de preços, listas e lembretes) em formato JSON legível.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <button
                  onClick={handleExportBackup}
                  className="p-4 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-left transition-colors flex items-center space-x-3"
                >
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center shrink-0">
                    <Download className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate">
                      Exportar Backup
                    </span>
                    <span className="text-[11px] text-slate-400 block">Salvar arquivo .json</span>
                  </div>
                </button>

                <label className="p-4 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-left cursor-pointer transition-colors flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-950 text-teal-600 flex items-center justify-center shrink-0">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate">
                      Restaurar Backup
                    </span>
                    <span className="text-[11px] text-slate-400 block">Importar .json</span>
                  </div>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleImportBackup}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
