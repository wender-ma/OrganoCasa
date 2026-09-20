import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Bell,
  BellRing,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  Share,
  PlusSquare,
  Volume2,
  Check
} from 'lucide-react';
import {
  getNotificationPermission,
  requestNotificationPermission,
  sendTestNotification,
  isIOS,
  isStandalonePWA,
  getNotificationPreferences,
  saveNotificationPreferences,
  NotificationPreferences
} from '../../services/notifications';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenInstallGuide?: () => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  onOpenInstallGuide
}) => {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [isTestSending, setIsTestSending] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>(getNotificationPreferences());

  const onIOS = isIOS();
  const isStandalone = isStandalonePWA();

  useEffect(() => {
    if (isOpen) {
      setPermission(getNotificationPermission());
      setPreferences(getNotificationPreferences());
      setTestSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRequestPermission = async () => {
    const granted = await requestNotificationPermission();
    setPermission(getNotificationPermission());
    if (granted) {
      await handleSendTest();
    }
  };

  const handleSendTest = async () => {
    setIsTestSending(true);
    setTestSuccess(false);
    try {
      const ok = await sendTestNotification();
      if (ok) {
        setTestSuccess(true);
        setTimeout(() => setTestSuccess(false), 4000);
      }
    } finally {
      setIsTestSending(false);
    }
  };

  const handleTogglePref = (key: keyof NotificationPreferences) => {
    const updated = { ...preferences, [key]: !preferences[key] };
    setPreferences(updated);
    saveNotificationPreferences(updated);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1rem)] animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 my-auto shrink-0">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-xs">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Notificações no Celular
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Alertas de compras e lembretes no seu iPhone
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

        {/* Status Card */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Status das Notificações:</span>
            {permission === 'granted' ? (
              <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100/70 dark:bg-emerald-950/70 px-2 py-0.5 rounded-lg text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Ativadas</span>
              </span>
            ) : permission === 'denied' ? (
              <span className="inline-flex items-center gap-1 font-bold text-rose-600 dark:text-rose-400 bg-rose-100/70 dark:bg-rose-950/70 px-2 py-0.5 rounded-lg text-[11px]">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Bloqueadas no iOS</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400 bg-amber-100/70 dark:bg-amber-950/70 px-2 py-0.5 rounded-lg text-[11px]">
                <Bell className="w-3.5 h-3.5" />
                <span>Desativadas</span>
              </span>
            )}
          </div>

          {permission === 'denied' && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400 leading-relaxed">
              As notificações foram desativadas nos Ajustes do iPhone. Para reativar: acesse <strong>Ajustes &gt; Notificações &gt; OrganoCasa</strong> e marque <em>"Permitir Notificações"</em>.
            </p>
          )}
        </div>

        {/* iOS Notice if not added to Home Screen */}
        {onIOS && !isStandalone && (
          <div className="p-3.5 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-2xl text-xs space-y-2">
            <div className="flex items-start space-x-2">
              <Smartphone className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold text-indigo-900 dark:text-indigo-200 block text-xs">
                  Requisito da Apple para iPhone:
                </span>
                <p className="text-[11px] text-indigo-700 dark:text-indigo-300 leading-relaxed">
                  No iPhone, a Apple exige que o aplicativo seja <strong>adicionado à Tela de Início</strong> para permitir notificações:
                </p>
                <div className="text-[11px] text-slate-700 dark:text-slate-300 space-y-1 pt-1">
                  <div className="flex items-center gap-1.5">
                    <span>1. Toque em <strong>Compartilhar</strong> (<Share className="w-3 h-3 inline" />) no Safari</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span>2. Escolha <strong>"Adicionar à Tela de Início"</strong> (<PlusSquare className="w-3 h-3 inline" />)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span>3. Abra pelo ícone na tela de início para ativar!</span>
                  </div>
                </div>
              </div>
            </div>

            {onOpenInstallGuide && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenInstallGuide();
                }}
                className="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs text-center"
              >
                Ver Instruções com Imagens
              </button>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          {permission !== 'granted' ? (
            <button
              type="button"
              onClick={handleRequestPermission}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center space-x-2 transition-all"
            >
              <BellRing className="w-4 h-4" />
              <span>Ativar Notificações no iPhone</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSendTest}
              disabled={isTestSending}
              className="w-full py-2.5 px-4 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 font-bold text-xs rounded-xl flex items-center justify-center space-x-2 transition-all shadow-xs"
            >
              <Volume2 className="w-4 h-4 text-emerald-600" />
              <span>{isTestSending ? 'Enviando Alerta...' : '🔔 Enviar Notificação de Teste'}</span>
            </button>
          )}

          {testSuccess && (
            <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5 animate-in slide-in-from-top-1 duration-150">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Notificação enviada! Verifique o topo da tela do seu celular.</span>
            </div>
          )}
        </div>

        {/* Preferences Toggles */}
        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Tipos de Notificações
          </span>

          <label className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl cursor-pointer">
            <div className="pr-2">
              <strong className="text-xs text-slate-800 dark:text-slate-200 block">
                Itens Esquecidos na Compra
              </strong>
              <span className="text-[10px] text-slate-400">
                Avisa ao ler a nota se você deixou de comprar algum item planejado
              </span>
            </div>
            <input
              type="checkbox"
              checked={preferences.unboughtAlerts}
              onChange={() => handleTogglePref('unboughtAlerts')}
              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
            />
          </label>

          <label className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl cursor-pointer">
            <div className="pr-2">
              <strong className="text-xs text-slate-800 dark:text-slate-200 block">
                Lembretes & Tarefas
              </strong>
              <span className="text-[10px] text-slate-400">
                Avisos no dia e horário das pendências da casa
              </span>
            </div>
            <input
              type="checkbox"
              checked={preferences.reminderAlerts}
              onChange={() => handleTogglePref('reminderAlerts')}
              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
            />
          </label>

          <label className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-xl cursor-pointer">
            <div className="pr-2">
              <strong className="text-xs text-slate-800 dark:text-slate-200 block">
                Lista Compartilhada
              </strong>
              <span className="text-[10px] text-slate-400">
                Quando outro membro da família adiciona produtos à lista
              </span>
            </div>
            <input
              type="checkbox"
              checked={preferences.listSharedAlerts}
              onChange={() => handleTogglePref('listSharedAlerts')}
              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
            />
          </label>
        </div>
      </div>
    </div>,
    document.body
  );
};
