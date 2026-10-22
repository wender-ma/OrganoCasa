import React, { useState, useEffect, useRef } from 'react';
import {
  ShoppingBag,
  Wifi,
  WifiOff,
  Plus,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Users,
  RefreshCw,
  Bell,
  Sun,
  Moon
} from 'lucide-react';
import { ShoppingList } from '../../types';
import { HouseholdModal } from '../collaboration/HouseholdModal';
import { InstallPwaModal } from './InstallPwaModal';
import { NotificationModal } from '../notifications/NotificationModal';
import { getNotificationPermission } from '../../services/notifications';
import {
  getCurrentSession,
  getSyncStatus,
  subscribeSyncStatus,
  triggerFullSync
} from '../../services/supabaseSync';
import { APP_VERSION } from '../../version';

const THEME_STORAGE_KEY = 'organocasa_theme';

function resolveInitialDarkMode(): boolean {
  if (typeof window === 'undefined') return false;
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'dark') return true;
  if (saved === 'light') return false;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

interface HeaderProps {
  activeList?: ShoppingList;
  lists: ShoppingList[];
  onSelectList: (id: string) => void;
  onCreateList: (title: string) => void;
  isOnline: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeList,
  lists,
  onSelectList,
  onCreateList,
  isOnline
}) => {
  const [showListMenu, setShowListMenu] = useState(false);
  const [showNewListPrompt, setShowNewListPrompt] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [isHouseholdOpen, setIsHouseholdOpen] = useState(false);
  const [isInstallPwaOpen, setIsInstallPwaOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(getNotificationPermission());
  const [syncStatus, setSyncStatus] = useState(getSyncStatus());
  const [isDark, setIsDark] = useState<boolean>(resolveInitialDarkMode);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', isDark);
      const themeColorMeta = document.querySelector('meta[name="theme-color"]');
      if (themeColorMeta) {
        themeColorMeta.setAttribute('content', isDark ? '#0f172a' : '#ffffff');
      }
    }
  }, [isDark]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (!saved) {
        setIsDark(e.matches);
      }
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  const handleToggleTheme = () => {
    setIsDark((prev) => {
      const next = !prev;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(THEME_STORAGE_KEY, next ? 'dark' : 'light');
      }
      return next;
    });
  };

  useEffect(() => {
    setNotificationPermission(getNotificationPermission());
  }, [isNotificationOpen]);

  useEffect(() => {
    return subscribeSyncStatus((status) => {
      setSyncStatus(status);
    });
  }, []);

  const session = getCurrentSession();

  const handleManualSync = async () => {
    await triggerFullSync();
  };

  // Reclinable / Pull-down Header State (v1.4.7)
  const [isReclined, setIsReclined] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const isDraggingRef = useRef(false);

  // Auto-collapse header when user scrolls down
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 20 && isReclined) {
        setIsReclined(false);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isReclined]);

  // Global touch pull-down gesture when at top of page (scrollY <= 4)
  useEffect(() => {
    let startY: number | null = null;
    let isTracking = false;

    const onGlobalTouchStart = (e: TouchEvent) => {
      if (window.scrollY <= 4) {
        startY = e.touches[0].clientY;
        isTracking = true;
        isDraggingRef.current = true;
      }
    };

    const onGlobalTouchMove = (e: TouchEvent) => {
      if (!isTracking || startY === null) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - startY;

      if (window.scrollY <= 4) {
        if (!isReclined && diff > 0) {
          // Pulling down to recline
          const damped = Math.min(60, diff * 0.65);
          setDragOffset(damped);
        } else if (isReclined && diff < 0) {
          // Pushing up to collapse
          const damped = Math.max(-60, diff * 0.65);
          setDragOffset(damped);
        }
      }
    };

    const onGlobalTouchEnd = (e: TouchEvent) => {
      if (!isTracking || startY === null) return;
      isTracking = false;
      isDraggingRef.current = false;
      const endY = e.changedTouches[0]?.clientY ?? startY;
      const diff = endY - startY;
      startY = null;

      if (!isReclined) {
        if (diff > 30) {
          setIsReclined(true);
        }
      } else {
        if (diff < -20) {
          setIsReclined(false);
        }
      }
      setDragOffset(0);
    };

    window.addEventListener('touchstart', onGlobalTouchStart, { passive: true });
    window.addEventListener('touchmove', onGlobalTouchMove, { passive: true });
    window.addEventListener('touchend', onGlobalTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onGlobalTouchStart);
      window.removeEventListener('touchmove', onGlobalTouchMove);
      window.removeEventListener('touchend', onGlobalTouchEnd);
    };
  }, [isReclined]);

  const currentTranslateY = isReclined ? 52 + dragOffset : Math.max(0, dragOffset);

  const handleCreateList = (e: React.FormEvent) => {
    e.preventDefault();
    if (newListTitle.trim()) {
      onCreateList(newListTitle.trim());
      setNewListTitle('');
      setShowNewListPrompt(false);
      setShowListMenu(false);
    }
  };

  return (
    <header
      style={{
        transform: `translateY(${currentTranslateY}px)`,
        transition: isDraggingRef.current ? 'none' : 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
      className={`sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 pt-1.5 pb-1 header-flush-top will-change-transform ${
        isReclined ? 'shadow-md ring-1 ring-emerald-500/15' : 'shadow-2xs'
      }`}
    >
      <div className="max-w-2xl mx-auto flex items-center justify-between">
        {/* Brand & List Selector */}
        <div className="relative">
          <button
            onClick={() => setShowListMenu(!showListMenu)}
            className="flex items-center space-x-2 text-left group focus:outline-none"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <h1 className="font-bold text-slate-900 dark:text-white text-base leading-tight">
                  OrganoCasa
                </h1>
                <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-950/70 border border-emerald-300/50 dark:border-emerald-800/60 px-1.5 py-0.5 rounded-md leading-none">
                  {APP_VERSION}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-transform duration-200" />
              </div>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium truncate max-w-[150px] sm:max-w-[220px]">
                {activeList?.title || 'Compras do Supermercado'}
              </p>
            </div>
          </button>

          {/* List Selector Dropdown */}
          {showListMenu && (
            <div className="absolute top-12 left-0 w-64 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Suas Listas</span>
                <span className="text-[10px] text-slate-400 lowercase font-normal">{APP_VERSION}</span>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {lists.map((list) => (
                  <button
                    key={list.id}
                    onClick={() => {
                      onSelectList(list.id);
                      setShowListMenu(false);
                    }}
                    className={`w-full px-3 py-2 text-sm text-left flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${
                      list.id === activeList?.id
                        ? 'text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50/50 dark:bg-emerald-950/30'
                        : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <span className="truncate">{list.title}</span>
                    {list.id === activeList?.id && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    )}
                  </button>
                ))}
              </div>
              <div className="border-t border-slate-100 dark:border-slate-700 mt-1 pt-1 px-2">
                <button
                  onClick={() => setShowNewListPrompt(true)}
                  className="w-full px-3 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-xl flex items-center space-x-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Criar Nova Lista</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right side: Theme Toggle + Manual Cloud Sync + Family Account + Offline badge */}
        <div className="flex items-center space-x-1.5">
          {/* Theme Toggle Button */}
          <button
            type="button"
            onClick={handleToggleTheme}
            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:text-slate-400 dark:hover:text-emerald-400 dark:hover:bg-emerald-950/50 rounded-xl transition-colors"
            title={isDark ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro'}
            aria-label={isDark ? 'Alternar para Modo Claro' : 'Alternar para Modo Escuro'}
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Manual Cloud Sync Button */}
          <button
            onClick={handleManualSync}
            disabled={syncStatus.isSyncing}
            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-xl transition-colors"
            title={syncStatus.isSyncing ? 'Sincronizando com a nuvem...' : 'Sincronizar agora'}
          >
            <RefreshCw
              className={`w-4 h-4 transition-transform duration-500 ${
                syncStatus.isSyncing ? 'animate-spin text-emerald-600 dark:text-emerald-400' : ''
              }`}
            />
          </button>

          {/* Family Account / Backup */}
          <button
            onClick={() => setIsHouseholdOpen(true)}
            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-xl transition-colors relative"
            title="Conta Familiar & Backup"
          >
            <Users className="w-4 h-4" />
            {session && (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
            )}
          </button>

          {/* Notifications on Phone */}
          <button
            onClick={() => setIsNotificationOpen(true)}
            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-xl transition-colors relative"
            title="Notificações no Celular"
          >
            <Bell className="w-4 h-4" />
            {notificationPermission === 'granted' ? (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
            ) : notificationPermission === 'default' ? (
              <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-white dark:ring-slate-900 animate-pulse" />
            ) : null}
          </button>

          {/* Offline / Online Status Badge */}
          <div
            className={`flex items-center space-x-1 px-2 py-1 rounded-full text-[11px] font-medium transition-colors ${
              isOnline
                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
            }`}
            title={isOnline ? 'Online - pronto para sincronizar' : 'Modo 100% Offline'}
          >
            {isOnline ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <Wifi className="w-3 h-3" />
                <span className="hidden sm:inline">Online</span>
              </>
            ) : (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <WifiOff className="w-3 h-3" />
                <span>Offline</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Reclinable Pull Handle & Status Indicator */}
      <button
        type="button"
        onClick={() => setIsReclined((prev) => !prev)}
        className="w-full pt-1 pb-0.5 flex flex-col items-center justify-center group focus:outline-none cursor-pointer"
        title={isReclined ? 'Toque ou role para recolher o topo' : 'Puxe para baixo ou toque para reclinar o topo'}
        aria-label={isReclined ? 'Recolher topo' : 'Reclinar topo para fácil acesso'}
      >
        <div
          className={`h-1 rounded-full transition-all duration-300 ${
            isReclined
              ? 'w-10 bg-emerald-500 dark:bg-emerald-400'
              : 'w-7 bg-slate-300/80 dark:bg-slate-700/80 group-hover:bg-slate-400 dark:group-hover:bg-slate-600'
          }`}
        />
        {isReclined && (
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-0.5 mt-0.5 animate-in fade-in">
            <ChevronUp className="w-3 h-3" />
            <span>Toque ou role para recolher</span>
          </span>
        )}
      </button>

      {/* Modals */}
      <HouseholdModal
        isOpen={isHouseholdOpen}
        onClose={() => setIsHouseholdOpen(false)}
      />

      <InstallPwaModal
        isOpen={isInstallPwaOpen}
        onClose={() => setIsInstallPwaOpen(false)}
      />

      <NotificationModal
        isOpen={isNotificationOpen}
        onClose={() => {
          setIsNotificationOpen(false);
          setNotificationPermission(getNotificationPermission());
        }}
        onOpenInstallGuide={() => setIsInstallPwaOpen(true)}
      />

      {/* New List Modal Dialog */}
      {showNewListPrompt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95">
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">
              Criar Nova Lista
            </h3>
            <form onSubmit={handleCreateList} className="space-y-3">
              <input
                type="text"
                value={newListTitle}
                onChange={(e) => setNewListTitle(e.target.value)}
                placeholder="Ex: Compras da Semana, Churrasco..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                autoFocus
              />
              <div className="flex space-x-2 pt-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowNewListPrompt(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newListTitle.trim()}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-md"
                >
                  Criar Lista
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};
