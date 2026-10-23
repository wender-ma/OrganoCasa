import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
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
  AlertCircle,
  Home,
  Crown,
  Trash2,
  Plus,
  ArrowRightLeft,
  DoorOpen
} from 'lucide-react';
import { db } from '../../db/dexie';
import { HouseholdMember } from '../../types';
import {
  getCurrentSession,
  authenticateWithEmail,
  logoutUser,
  joinHouseholdByCode,
  triggerFullSync,
  subscribeSyncStatus,
  exportDatabaseToJson,
  importDatabaseFromJson,
  getConnectedHouseholds,
  switchHousehold,
  createAdditionalHousehold,
  removeHouseholdMember,
  leaveHousehold,
  isSeedRecord,
  UserSession,
  ConnectedHousehold,
  SyncStatus
} from '../../services/supabaseSync';
import {
  getSupabaseClient,
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
  const [activeTab, setActiveTab] = useState<'family' | 'supabase' | 'backup'>('family');
  const [session, setSession] = useState<UserSession | null>(getCurrentSession());
  const [connectedHouseholds, setConnectedHouseholds] = useState<ConnectedHousehold[]>([]);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [newHouseName, setNewHouseName] = useState('');
  const [isAddingHouseOpen, setIsAddingHouseOpen] = useState(false);
  const [addHouseMode, setAddHouseMode] = useState<'join' | 'create'>('join');
  const [memberToRemove, setMemberToRemove] = useState<HouseholdMember | null>(null);
  const [isConfirmingLeave, setIsConfirmingLeave] = useState(false);
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

  // Live Query of Members in Active Household (excluding legacy mock/seed members)
  const rawMembers = useLiveQuery<HouseholdMember[]>(() => db.householdMembers.toArray(), []) || [];
  const members = rawMembers.filter(
    (m) =>
      !isSeedRecord(m.id) &&
      m.id !== 'member-1' &&
      m.id !== 'member-2' &&
      m.name !== 'Esposa / Parceiro(a)' &&
      m.name.trim().toLowerCase() !== 'eu'
  );

  // Sync Status
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    lastSyncedAt: null,
    errorMessage: null,
    isRealtimeActive: false
  });

  useEffect(() => {
    if (isOpen) {
      const current = getCurrentSession();
      setSession(current);
      getConnectedHouseholds().then(setConnectedHouseholds).catch(console.warn);
      const config = getSupabaseConfig();
      setSupabaseUrl(config.url || '');
      setSupabaseKey(config.anonKey || '');
      setErrorMessage(null);
      setIsAddingHouseOpen(false);
      setMemberToRemove(null);
      setIsConfirmingLeave(false);

      // Auto-purge any legacy seed members from local Dexie and remote Supabase
      db.householdMembers.bulkDelete(['member-1', 'member-2']).catch(console.warn);
      if (current?.householdId) {
        const client = getSupabaseClient();
        client
          ?.from('household_members')
          .delete()
          .in('id', ['member-1', 'member-2'])
          .eq('household_id', current.householdId)
          .then(() => {}, (err) => console.warn(err));
      }
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
      const list = await getConnectedHouseholds();
      setConnectedHouseholds(list);
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
      setIsAddingHouseOpen(false);
      const list = await getConnectedHouseholds();
      setConnectedHouseholds(list);
      showToast(`Conectado à casa "${updated.householdName}"!`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Código de convite inválido.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!newHouseName.trim()) return;

    setLoading(true);
    try {
      const updated = await createAdditionalHousehold(newHouseName.trim());
      setSession(updated);
      setNewHouseName('');
      setIsAddingHouseOpen(false);
      const list = await getConnectedHouseholds();
      setConnectedHouseholds(list);
      showToast(`Casa "${updated.householdName}" criada com sucesso!`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao criar nova casa.');
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchHousehold = async (targetId: string) => {
    if (session?.householdId === targetId) return;
    setLoading(true);
    try {
      const updated = await switchHousehold(targetId);
      setSession(updated);
      const list = await getConnectedHouseholds();
      setConnectedHouseholds(list);
      showToast(`Alternado para "${updated.householdName}"!`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao alternar de casa.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveMemberConfirm = async () => {
    if (!memberToRemove) return;
    setLoading(true);
    try {
      await removeHouseholdMember(memberToRemove.id);
      showToast(`${memberToRemove.name} foi removido(a) da casa.`);
      setMemberToRemove(null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao remover membro.');
    } finally {
      setLoading(false);
    }
  };

  const handleLeaveHouseholdConfirm = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const updated = await leaveHousehold(session.householdId);
      setSession(updated);
      const list = await getConnectedHouseholds();
      setConnectedHouseholds(list);
      setIsConfirmingLeave(false);
      showToast('Você se desconectou desta casa.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao sair da casa.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    setSession(null);
    setConnectedHouseholds([]);
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

  const handleShareInvite = async () => {
    if (!session?.inviteCode) return;
    const shareText = `Oi! Entre na nossa casa "${session.householdName}" no OrganoCasa usando o código de convite: ${session.inviteCode}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Convite para ${session.householdName} — OrganoCasa`,
          text: shareText,
          url: window.location.origin
        });
        showToast('Compartilhado com sucesso!');
        return;
      } catch {
        // Fallback to copy if share was dismissed or unsupported
      }
    }
    handleCopyInvite();
  };

  const handleManualSync = async () => {
    await triggerFullSync();
    showToast('Sincronização com a nuvem solicitada!');
  };

  const handleSaveSupabaseConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    saveSupabaseConfig(supabaseUrl.trim(), supabaseKey.trim());
    showToast('Configurações salvas!');
  };

  const handleClearConfig = () => {
    clearSupabaseConfig();
    setSupabaseUrl('');
    setSupabaseKey('');
    setTestResult(null);
    showToast('Configurações restauradas para o padrão.');
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testSupabaseConnection(supabaseUrl.trim(), supabaseKey.trim());
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Erro inesperado ao testar conexão.'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleExportBackup = async () => {
    try {
      const json = await exportDatabaseToJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `organocasa-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Backup exportado com sucesso!');
    } catch {
      showToast('Erro ao exportar backup.');
    }
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

  const isCurrentOwner = session?.isOwner ?? true;

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto modal-safe-top pb-[max(env(safe-area-inset-bottom),1rem)]">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm sm:max-w-md w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200 overflow-hidden my-auto shrink-0">
        
        {/* Header */}
        <div className="px-4 py-3 sm:px-5 sm:py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-slate-900">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-tight truncate">
                {session ? 'Espaço Familiar & Nuvem' : authMode === 'login' ? 'Entrar na Conta' : 'Criar Conta Gratuita'}
              </h3>
              <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                {session ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                    <span>{session.householdName}</span>
                  </>
                ) : (
                  'Sincronização em tempo real na nuvem'
                )}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full transition-colors shrink-0"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation (when logged in) */}
        {session && (
          <div className="flex border-b border-slate-100 dark:border-slate-800 px-4 bg-slate-50/50 dark:bg-slate-850/50 text-xs shrink-0">
            <button
              onClick={() => setActiveTab('family')}
              className={`py-2 px-3 font-semibold border-b-2 transition-colors flex items-center space-x-1.5 ${
                activeTab === 'family'
                  ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Família & Casas</span>
            </button>

            <button
              onClick={() => setActiveTab('supabase')}
              className={`py-2 px-3 font-semibold border-b-2 transition-colors flex items-center space-x-1.5 ${
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
              className={`py-2 px-3 font-semibold border-b-2 transition-colors flex items-center space-x-1.5 ${
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
        <div className="p-3.5 sm:p-4 overflow-y-auto space-y-3">
          {/* Toast Notification */}
          {toastMessage && (
            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 animate-in fade-in">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>{toastMessage}</span>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 rounded-xl text-xs font-medium flex items-center gap-1.5 animate-in fade-in">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* NOT LOGGED IN: COMPACT & CLEAN AUTH FORM */}
          {!session && (
            <div className="space-y-3.5">
              {/* Fast Join with Family Invite Code */}
              <form onSubmit={handleJoinHousehold} className="p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 space-y-2">
                <div className="flex items-center space-x-1.5 text-emerald-800 dark:text-emerald-300">
                  <Share2 className="w-3.5 h-3.5" />
                  <span className="text-xs font-bold">Código de Convite da Família</span>
                </div>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  Digite o código compartilhado pelo outro celular para parear instantaneamente:
                </p>
                <div className="flex space-x-2 pt-0.5">
                  <input
                    type="text"
                    value={inviteCodeInput}
                    onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                    placeholder="Ex: CASA-768225"
                    className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-xl text-xs font-mono uppercase focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!inviteCodeInput.trim() || loading}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 transition-all shadow-xs shrink-0"
                  >
                    {loading ? 'Entrando...' : 'Conectar'}
                  </button>
                </div>
              </form>

              <div className="relative flex py-0.5 items-center">
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
                <span className="shrink-0 mx-2 text-[10px] text-slate-400 uppercase font-bold tracking-wider">Ou acesse com e-mail</span>
                <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
              </div>

              {/* Email & Password Auth Form */}
              <form onSubmit={handleAuthSubmit} className="space-y-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Seu E-mail
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="exemplo@email.com"
                      className="w-full pl-8.5 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Senha
                  </label>
                  <div className="relative">
                    <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-8.5 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 bg-slate-900 dark:bg-slate-750 hover:bg-black text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center space-x-1.5 mt-1"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Conectando...</span>
                    </>
                  ) : (
                    <span>{authMode === 'login' ? 'Entrar com E-mail' : 'Criar Conta com E-mail'}</span>
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
                    ? 'Ainda não tem conta? Criar novo espaço'
                    : 'Já tem conta? Fazer login'}
                </button>
              </div>
            </div>
          )}

          {/* LOGGED IN: TAB 1 - FAMILY ACCOUNT, MEMBERS & HOUSEHOLDS HUB */}
          {session && activeTab === 'family' && (
            <div className="space-y-3">

              {/* 1. Compact User Account Bar (Sleek, minimal, space-saving) */}
              <div className="px-3 py-2 rounded-2xl bg-slate-50 dark:bg-slate-850/80 border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center space-x-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                    {session.email.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block truncate">
                      {session.email}
                    </span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                      <span>Online na Nuvem</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-1 shrink-0">
                  <button
                    onClick={handleManualSync}
                    disabled={syncStatus.isSyncing}
                    className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg transition-colors"
                    title="Sincronizar agora"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncStatus.isSyncing ? 'animate-spin text-emerald-600' : ''}`} />
                  </button>
                  <button
                    onClick={handleLogout}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors"
                    title="Sair da conta"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* 2. Active Household Card with Compact Invite Code */}
              <div className="p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/90 dark:border-emerald-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 min-w-0">
                    <Home className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {session.householdName}
                    </span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 shrink-0 ${
                    isCurrentOwner
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                  }`}>
                    {isCurrentOwner ? <Crown className="w-3 h-3 text-amber-600 dark:text-amber-400" /> : <Users className="w-3 h-3" />}
                    <span>{isCurrentOwner ? 'Você é o Dono' : 'Convidado'}</span>
                  </span>
                </div>

                {/* Compact In-Line Invite Code Bar */}
                {session.inviteCode && (
                  <div className="pt-1 border-t border-emerald-200/60 dark:border-emerald-800/60">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center space-x-1.5 min-w-0">
                        <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300 shrink-0">
                          Código:
                        </span>
                        <span className="font-mono text-xs font-bold bg-white dark:bg-slate-900 px-2 py-0.5 rounded-lg border border-emerald-300 dark:border-emerald-700 text-slate-800 dark:text-slate-200 tracking-wider">
                          {session.inviteCode}
                        </span>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        <button
                          onClick={handleCopyInvite}
                          className="px-2.5 py-1 bg-white dark:bg-slate-900 hover:bg-emerald-100/50 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 rounded-lg text-[11px] font-semibold flex items-center gap-1 shadow-2xs"
                        >
                          {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          <span>{copied ? 'Copiado!' : 'Copiar'}</span>
                        </button>

                        <button
                          onClick={handleShareInvite}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-2xs"
                          title="Compartilhar no WhatsApp ou SMS"
                        >
                          <Share2 className="w-3 h-3" />
                          <span className="hidden sm:inline">Compartilhar</span>
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] text-emerald-700/90 dark:text-emerald-400 mt-1 leading-tight">
                      Envie este código para quem mora com você para sincronizar tudo em tempo real.
                    </p>
                  </div>
                )}
              </div>

              {/* 3. Connected Members in Current Household (with Owner Permissions) */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-850/80 border border-slate-200/80 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Membros Conectados nesta Casa ({members.length})</span>
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Sincronizados via nuvem
                  </span>
                </div>

                <div className="space-y-1.5 pt-0.5">
                  {members.length === 0 ? (
                    <div className="text-center py-2 text-[11px] text-slate-400">
                      Nenhum membro listado ainda.
                    </div>
                  ) : (
                    members.map((m: HouseholdMember) => {
                      const isSelf = Boolean(
                        session && (
                          (m.userId && m.userId === session.id) ||
                          (m.name && m.name.toLowerCase() === session.email.split('@')[0].toLowerCase())
                        )
                      );
                      const isOwnerMember = m.role === 'owner' || (Boolean(session?.isOwner) && isSelf);

                      return (
                        <div
                          key={m.id}
                          className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between"
                        >
                          <div className="flex items-center space-x-2 min-w-0">
                            <span
                              className="w-6 h-6 rounded-full flex items-center justify-center text-xs text-white shrink-0 font-bold"
                              style={{ backgroundColor: m.color || '#10b981' }}
                            >
                              {m.avatarEmoji || m.name.charAt(0).toUpperCase()}
                            </span>
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate block">
                                {m.name} {isSelf && <span className="text-[10px] font-normal text-emerald-600 dark:text-emerald-400">(Você)</span>}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center space-x-1.5 shrink-0">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 ${
                              isOwnerMember
                                ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}>
                              {isOwnerMember ? <Crown className="w-2.5 h-2.5" /> : null}
                              <span>{isOwnerMember ? 'Dono(a)' : 'Familiar'}</span>
                            </span>

                            {/* Owner Permission: Remove other members */}
                            {isCurrentOwner && !isSelf && (
                              <button
                                type="button"
                                onClick={() => setMemberToRemove(m)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors"
                                title={`Remover ${m.name} da casa`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Non-owner option: Leave this household */}
                {!isCurrentOwner && (
                  <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-800/60 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setIsConfirmingLeave(true)}
                      className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1"
                    >
                      <DoorOpen className="w-3.5 h-3.5" />
                      <span>Sair desta Casa</span>
                    </button>
                  </div>
                )}
              </div>

              {/* 4. Multi-Household Hub (Hub de Casas Conectadas & Transição Rápida) */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-850/80 border border-slate-200/80 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>Hub de Casas Conectadas</span>
                    </span>
                    <p className="text-[10px] text-slate-400">
                      Alterne entre suas casas sem perder nenhum dado
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsAddingHouseOpen(!isAddingHouseOpen)}
                    className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] font-semibold flex items-center gap-1 hover:border-emerald-500 transition-colors shadow-2xs"
                  >
                    <Plus className="w-3 h-3 text-emerald-600" />
                    <span>Nova / Conectar</span>
                  </button>
                </div>

                {/* List of Connected Households */}
                <div className="space-y-1.5 pt-0.5">
                  {connectedHouseholds.map((h) => {
                    const isCurrent = h.id === session.householdId;

                    return (
                      <div
                        key={h.id}
                        className={`p-2.5 rounded-xl border transition-all flex items-center justify-between ${
                          isCurrent
                            ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 shadow-2xs'
                            : 'bg-white dark:bg-slate-900 border-slate-200/70 dark:border-slate-800 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center space-x-2 min-w-0">
                          <Home className={`w-4 h-4 shrink-0 ${isCurrent ? 'text-emerald-600' : 'text-slate-400'}`} />
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-900 dark:text-white block truncate">
                              {h.name}
                            </span>
                            <span className="text-[10px] text-slate-400 block truncate">
                              {h.isOwner ? '👑 Criada por você' : '👤 Conectado via código'}
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0">
                          {isCurrent ? (
                            <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-md text-[10px] font-bold flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              <span>Ativa</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() => handleSwitchHousehold(h.id)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-md text-[11px] font-semibold transition-colors disabled:opacity-50"
                            >
                              Alternar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Expandable Add / Connect House Form */}
                {isAddingHouseOpen && (
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2 animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="flex border-b border-slate-100 dark:border-slate-800 pb-1.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setAddHouseMode('join')}
                        className={`flex-1 text-center py-1 font-semibold border-b-2 transition-colors ${
                          addHouseMode === 'join'
                            ? 'border-emerald-500 text-emerald-600'
                            : 'border-transparent text-slate-400'
                        }`}
                      >
                        Entrar com Código
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddHouseMode('create')}
                        className={`flex-1 text-center py-1 font-semibold border-b-2 transition-colors ${
                          addHouseMode === 'create'
                            ? 'border-emerald-500 text-emerald-600'
                            : 'border-transparent text-slate-400'
                        }`}
                      >
                        Criar Nova Casa
                      </button>
                    </div>

                    {addHouseMode === 'join' ? (
                      <form onSubmit={handleJoinHousehold} className="space-y-1.5 pt-1">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                          Digite o código da casa que você quer adicionar ao seu Hub:
                        </span>
                        <div className="flex space-x-1.5">
                          <input
                            type="text"
                            value={inviteCodeInput}
                            onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                            placeholder="Ex: CASA-123456"
                            className="flex-1 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono uppercase focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={!inviteCodeInput.trim() || loading}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold disabled:opacity-50"
                          >
                            Adicionar
                          </button>
                        </div>
                      </form>
                    ) : (
                      <form onSubmit={handleCreateHousehold} className="space-y-1.5 pt-1">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                          Dê um nome para o seu novo espaço familiar:
                        </span>
                        <div className="flex space-x-1.5">
                          <input
                            type="text"
                            value={newHouseName}
                            onChange={(e) => setNewHouseName(e.target.value)}
                            placeholder="Ex: Casa de Praia, Sítio..."
                            className="flex-1 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={!newHouseName.trim() || loading}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold disabled:opacity-50"
                          >
                            Criar
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* LOGGED IN: TAB 2 - SUPABASE STATUS & SQL SCRIPT */}
          {session && activeTab === 'supabase' && (
            <div className="space-y-3">
              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 space-y-2">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                    Sincronização em Tempo Real (Supabase)
                  </span>
                </div>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                  Suas compras, listas e lembretes são sincronizados via WebSocket para todos os celulares da família conectados à mesma casa.
                </p>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const sqlScript = `-- SCHEMA SQL PARA O SUPABASE - ORGANOCASA
CREATE TABLE IF NOT EXISTS public.households (id TEXT PRIMARY KEY, name TEXT NOT NULL, invite_code TEXT UNIQUE NOT NULL, created_by UUID, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.household_members (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, user_id UUID, name TEXT NOT NULL, color TEXT DEFAULT '#10b981', avatar_emoji TEXT DEFAULT '👤', is_default BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.shopping_lists (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, title TEXT NOT NULL, is_default BOOLEAN DEFAULT FALSE, status TEXT DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.shopping_list_items (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, list_id TEXT NOT NULL, product_id TEXT, name TEXT NOT NULL, category TEXT NOT NULL, brand TEXT, alternative_brands JSONB DEFAULT '[]'::jsonb, selected_brand TEXT, image_url TEXT, quantity NUMERIC NOT NULL DEFAULT 1, unit TEXT NOT NULL DEFAULT 'un', average_price NUMERIC DEFAULT 0, last_price NUMERIC DEFAULT 0, is_checked BOOLEAN DEFAULT FALSE, notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.products (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL, brand TEXT, alternative_brands JSONB DEFAULT '[]'::jsonb, barcode TEXT, image_url TEXT, unit TEXT NOT NULL DEFAULT 'un', average_price NUMERIC DEFAULT 0, last_price NUMERIC DEFAULT 0, last_price_date TIMESTAMPTZ, last_store TEXT, purchase_count INT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.reminders (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, assigned_member_id TEXT, checklist JSONB DEFAULT '[]'::jsonb, due_date TEXT, is_completed BOOLEAN DEFAULT FALSE, category TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.receipts (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, list_id TEXT, store_name TEXT NOT NULL, access_key TEXT, total_amount NUMERIC NOT NULL DEFAULT 0, purchase_date TIMESTAMPTZ DEFAULT NOW(), raw_type TEXT DEFAULT 'qr_code', items JSONB DEFAULT '[]'::jsonb, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.price_records (id TEXT PRIMARY KEY, household_id TEXT NOT NULL, product_id TEXT NOT NULL, receipt_id TEXT, price NUMERIC NOT NULL DEFAULT 0, quantity NUMERIC NOT NULL DEFAULT 1, unit TEXT NOT NULL DEFAULT 'un', store_name TEXT NOT NULL, date TIMESTAMPTZ DEFAULT NOW(), created_at TIMESTAMPTZ DEFAULT NOW());
ALTER TABLE public.households DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_lists DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_list_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_records DISABLE ROW LEVEL SECURITY;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_lists, public.shopping_list_items, public.products, public.reminders, public.receipts, public.price_records, public.household_members;`;
                      navigator.clipboard.writeText(sqlScript);
                      showToast('Script SQL copiado! Cole no SQL Editor do Supabase.');
                    }}
                    className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-semibold hover:bg-emerald-100/50 transition-colors flex items-center space-x-1"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar Script SQL do Banco</span>
                  </button>
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

        {/* Member Removal Confirmation Dialog */}
        {memberToRemove && (
          <div className="p-3.5 bg-rose-50 dark:bg-rose-950/80 border-t border-rose-200 dark:border-rose-900 animate-in fade-in slide-in-from-bottom-2 shrink-0">
            <span className="text-xs font-bold text-rose-900 dark:text-rose-200 block">
              Remover {memberToRemove.name} da casa?
            </span>
            <p className="text-[11px] text-rose-700 dark:text-rose-300 mt-0.5 leading-tight">
              Esta pessoa perderá o acesso a esta lista e não receberá mais notificações compartilhadas.
            </p>
            <div className="flex justify-end space-x-2 mt-2">
              <button
                type="button"
                onClick={() => setMemberToRemove(null)}
                className="px-3 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleRemoveMemberConfirm}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-2xs"
              >
                {loading ? 'Removendo...' : 'Sim, Remover'}
              </button>
            </div>
          </div>
        )}

        {/* Leave House Confirmation Dialog */}
        {isConfirmingLeave && (
          <div className="p-3.5 bg-amber-50 dark:bg-amber-950/80 border-t border-amber-200 dark:border-amber-900 animate-in fade-in slide-in-from-bottom-2 shrink-0">
            <span className="text-xs font-bold text-amber-900 dark:text-amber-200 block">
              Deseja se desconectar de "{session?.householdName}"?
            </span>
            <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5 leading-tight">
              Você deixará de receber atualizações desta casa. Se tiver outras casas no seu Hub, você alternará para elas.
            </p>
            <div className="flex justify-end space-x-2 mt-2">
              <button
                type="button"
                onClick={() => setIsConfirmingLeave(false)}
                className="px-3 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleLeaveHouseholdConfirm}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg shadow-2xs"
              >
                {loading ? 'Saindo...' : 'Sim, Sair da Casa'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>,
    document.body
  );
};
