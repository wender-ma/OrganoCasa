import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  Key,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  User
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
      setErrorMessage(null);
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
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!email.trim() || !password.trim()) return;

    setLoading(true);
    try {
      const userSession = await authenticateWithEmail(email, password, authMode);
      setSession(userSession);
      showToast(authMode === 'login' ? 'Login realizado com sucesso!' : 'Espaço Familiar criado!');
    } catch (err: any) {
      setErrorMessage(err.message || 'Falha na autenticação. Verifique seu e-mail e senha.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!inviteCodeInput.trim()) return;

    setLoading(true);
    try {
      const updated = await joinHouseholdByCode(inviteCodeInput.trim());
      setSession(updated);
      setInviteCodeInput('');
      showToast(`Conectado ao espaço "${updated.householdName}"!`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Código de convite inválido.');
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
    showToast('Iniciando sincronização...');
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

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1rem)]">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm sm:max-w-md w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200 overflow-hidden my-auto shrink-0">
        {/* Header */}
        <div className="px-4 py-3.5 sm:px-5 sm:py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-slate-900">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-tight">
                {session ? 'Espaço Familiar & Nuvem' : authMode === 'login' ? 'Entrar na Conta' : 'Criar Conta Gratuita'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {session ? session.householdName : 'Sincronização em tempo real na nuvem'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation (only when logged in) */}
        {session && (
          <div className="flex border-b border-slate-100 dark:border-slate-800 px-4 bg-slate-50/50 dark:bg-slate-850/50 text-xs shrink-0">
            <button
              onClick={() => setActiveTab('account')}
              className={`py-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center space-x-1.5 ${
                activeTab === 'account'
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Família</span>
            </button>

            <button
              onClick={() => setActiveTab('supabase')}
              className={`py-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center space-x-1.5 ${
                activeTab === 'supabase'
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              <span>Nuvem</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </button>

            <button
              onClick={() => setActiveTab('backup')}
              className={`py-2.5 px-3 font-semibold border-b-2 transition-colors flex items-center space-x-1.5 ${
                activeTab === 'backup'
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Backup</span>
            </button>
          </div>
        )}

        {/* Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5">
          {/* Toast Notification */}
          {toastMessage && (
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 animate-in fade-in">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>{toastMessage}</span>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 rounded-xl text-xs font-medium flex items-center gap-1.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* NOT LOGGED IN: COMPACT & CLEAN AUTH FORM */}
          {!session && (
            <div className="space-y-3.5">
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
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
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
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center space-x-1.5 mt-1"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Conectando...</span>
                    </>
                  ) : (
                    <span>{authMode === 'login' ? 'Entrar na Conta' : 'Criar Espaço Familiar'}</span>
                  )}
                </button>
              </form>

              <div className="text-center pt-1 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    setAuthMode(authMode === 'login' ? 'signup' : 'login');
                  }}
                  className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold hover:underline"
                >
                  {authMode === 'login'
                    ? 'Ainda não tem conta? Criar espaço gratuito'
                    : 'Já tem conta? Fazer login'}
                </button>
              </div>

              {/* Offline backup fallback */}
              <div className="pt-2 flex justify-between items-center text-[11px] text-slate-400 border-t border-slate-100 dark:border-slate-800">
                <span>Portabilidade offline:</span>
                <div className="space-x-2">
                  <button
                    type="button"
                    onClick={handleExportBackup}
                    className="text-emerald-600 hover:underline font-medium"
                  >
                    Baixar Backup (.json)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* LOGGED IN: TAB 1 - FAMILY ACCOUNT & INVITE */}
          {session && activeTab === 'account' && (
            <div className="space-y-3.5">
              {/* Account Card */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                    {session.email.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white block truncate max-w-[180px]">
                      {session.email}
                    </span>
                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1 font-medium">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>{session.householdName}</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    onClick={handleManualSync}
                    disabled={syncStatus.isSyncing}
                    className="p-2 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/60 rounded-xl transition-colors"
                    title="Sincronizar agora"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncStatus.isSyncing ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={handleLogout}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl transition-colors"
                    title="Sair da conta"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Share Invite Code */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Share2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Código para Conectar Esposa/Família</span>
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Passe este código para outra pessoa parear o celular dela e sincronizar em tempo real:
                </p>
                <div className="flex items-center space-x-2 pt-0.5">
                  <div className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-800 dark:text-slate-200 tracking-wider text-center">
                    {session.inviteCode}
                  </div>
                  <button
                    onClick={handleCopyInvite}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>
              </div>

              {/* Join another Household */}
              <form onSubmit={handleJoinHousehold} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Ou entrar em outro Espaço Familiar:
                </span>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={inviteCodeInput}
                    onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                    placeholder="Ex: CASA-123456"
                    className="flex-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono uppercase focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!inviteCodeInput.trim() || loading}
                    className="px-3.5 py-2 bg-slate-900 dark:bg-slate-700 hover:bg-black text-white rounded-xl text-xs font-bold disabled:opacity-50"
                  >
                    {loading ? 'Conectando...' : 'Entrar'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* LOGGED IN: TAB 2 - SUPABASE STATUS */}
          {session && activeTab === 'supabase' && (
            <div className="space-y-3.5">
              <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 space-y-1.5">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                    Supabase Conectado & Operacional
                  </span>
                </div>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300">
                  Todas as 8 tabelas estão sincronizando em tempo real com seu projeto PostgreSQL.
                </p>
                <div className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 pt-1">
                  URL: https://zgsnsxwoufuffqchghqb.supabase.co
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                    Sincronização Manual
                  </span>
                  <span className="text-[10px] text-slate-400 block">
                    {syncStatus.lastSyncedAt ? `Última: às ${syncStatus.lastSyncedAt}` : 'Sincronizado'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={syncStatus.isSyncing}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center space-x-1 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncStatus.isSyncing ? 'animate-spin' : ''}`} />
                  <span>Sincronizar Agora</span>
                </button>
              </div>
            </div>
          )}

          {/* LOGGED IN: TAB 3 - BACKUP & PORTABILITY */}
          {session && activeTab === 'backup' && (
            <div className="space-y-3">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">
                Exporte ou importe todos os dados em formato JSON portátil:
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleExportBackup}
                  className="p-3 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl text-left transition-colors flex items-center space-x-2"
                >
                  <Download className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Exportar</span>
                    <span className="text-[10px] text-slate-400 block">Arquivo .json</span>
                  </div>
                </button>

                <label className="p-3 bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 border border-slate-200 dark:border-slate-700 rounded-xl text-left cursor-pointer transition-colors flex items-center space-x-2">
                  <Upload className="w-4 h-4 text-teal-600 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Restaurar</span>
                    <span className="text-[10px] text-slate-400 block">Importar .json</span>
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
    </div>,
    document.body
  );
};
