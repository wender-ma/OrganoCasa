import React, { useState, useEffect, useRef } from 'react';
import {
  ShoppingBag,
  Wifi,
  WifiOff,
  Plus,
  ChevronDown,
  CheckCircle2,
  Users,
  RefreshCw,
  Bell,
  Sun,
  Moon,
  SlidersHorizontal,
  X
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
const HEADER_MODEL_STORAGE_KEY = 'organocasa_header_model';

function resolveInitialDarkMode(): boolean {
  if (typeof window === 'undefined') return false;
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'dark') return true;
  if (saved === 'light') return false;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveInitialHeaderModel(): number {
  if (typeof window === 'undefined') return 1;
  const urlParam = new URLSearchParams(window.location.search).get('header_model');
  if (urlParam && ['1', '2', '3', '4', '5'].includes(urlParam)) {
    return Number(urlParam);
  }
  const saved = localStorage.getItem(HEADER_MODEL_STORAGE_KEY);
  if (saved && ['1', '2', '3', '4', '5'].includes(saved)) {
    return Number(saved);
  }
  return 1; // Padrão: Modelo 1 (Apple Native Clean)
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

  // Modelos de Cabeçalho (1 a 5)
  const [headerModel, setHeaderModel] = useState<number>(resolveInitialHeaderModel);
  const [showQuickControlMenu, setShowQuickControlMenu] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);

  const quickControlRef = useRef<HTMLDivElement>(null);
  const listMenuRef = useRef<HTMLDivElement>(null);

  // Fechar menus ao clicar fora ou ao pressionar Escape
  useEffect(() => {
    if (!showQuickControlMenu && !showListMenu) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (showQuickControlMenu) {
        const isInsideControl = quickControlRef.current && quickControlRef.current.contains(target);
        const isTrigger = target.closest('[data-quick-control-trigger]');
        if (!isInsideControl && !isTrigger) {
          setShowQuickControlMenu(false);
        }
      }

      if (showListMenu) {
        const isInsideList = listMenuRef.current && listMenuRef.current.contains(target);
        const isTrigger = target.closest('[data-list-menu-trigger]');
        if (!isInsideList && !isTrigger) {
          setShowListMenu(false);
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowQuickControlMenu(false);
        setShowListMenu(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showQuickControlMenu, showListMenu]);

  useEffect(() => {
    const checkModel = () => {
      const urlParam = new URLSearchParams(window.location.search).get('header_model');
      if (urlParam && ['1', '2', '3', '4', '5'].includes(urlParam)) {
        setHeaderModel(Number(urlParam));
      }
    };
    window.addEventListener('popstate', checkModel);
    return () => window.removeEventListener('popstate', checkModel);
  }, []);

  // Modelo 5: Auto-Hide no scroll para baixo, revela ao rolar para cima
  useEffect(() => {
    if (headerModel !== 5) {
      setIsHeaderHidden(false);
      return;
    }
    const mainEl = document.querySelector('main');
    if (!mainEl) return;

    let lastScrollTop = mainEl.scrollTop;
    const handleScroll = () => {
      const currentScrollTop = mainEl.scrollTop;
      const diff = currentScrollTop - lastScrollTop;
      if (diff > 12 && currentScrollTop > 40) {
        setIsHeaderHidden(true);
      } else if (diff < -12 || currentScrollTop <= 15) {
        setIsHeaderHidden(false);
      }
      lastScrollTop = currentScrollTop;
    };

    mainEl.addEventListener('scroll', handleScroll, { passive: true });
    return () => mainEl.removeEventListener('scroll', handleScroll);
  }, [headerModel]);

  const selectHeaderModel = (m: number) => {
    setHeaderModel(m);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(HEADER_MODEL_STORAGE_KEY, String(m));
    }
    const url = new URL(window.location.href);
    url.searchParams.set('header_model', String(m));
    window.history.replaceState({}, '', url.toString());
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', isDark);
      const themeColorMeta = document.querySelector('meta[name="theme-color"]');
      if (themeColorMeta) {
        // No Modelo 2, o tema da barra pode ser verde esmeralda para fusão perfeita
        if (headerModel === 2) {
          themeColorMeta.setAttribute('content', isDark ? '#064e3b' : '#059669');
        } else {
          themeColorMeta.setAttribute('content', isDark ? '#0f172a' : '#ffffff');
        }
      }
    }
  }, [isDark, headerModel]);

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

  const handleCreateList = (e: React.FormEvent) => {
    e.preventDefault();
    if (newListTitle.trim()) {
      onCreateList(newListTitle.trim());
      setNewListTitle('');
      setShowNewListPrompt(false);
      setShowListMenu(false);
    }
  };

  // Popover da Central de Controle (reúne ações em 1 só botão)
  const renderQuickControlMenu = () => (
    showQuickControlMenu && (
      <>
        {/* Backdrop para fechar ao clicar fora */}
        <div
          className="fixed inset-0 z-40 bg-black/25 dark:bg-black/50 backdrop-blur-[1px]"
          onClick={() => setShowQuickControlMenu(false)}
          aria-hidden="true"
        />

        <div
          ref={quickControlRef}
          className="absolute top-full mt-2 right-0 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-3 z-50 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="px-2 py-1 text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 mb-2">
            <div className="flex items-center space-x-1.5">
              <span>Central de Controle</span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">{APP_VERSION}</span>
            </div>
            <button
              type="button"
              onClick={() => setShowQuickControlMenu(false)}
              className="p-1 -mr-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Fechar Central de Controle"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Grade de Ações Rápidas */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            {/* Sincronização */}
            <button
              type="button"
              onClick={handleManualSync}
              disabled={syncStatus.isSyncing}
              className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-left flex flex-col space-y-1 transition-colors border border-slate-100 dark:border-slate-750"
            >
              <div className="flex items-center justify-between">
                <RefreshCw className={`w-4 h-4 text-emerald-600 dark:text-emerald-400 ${syncStatus.isSyncing ? 'animate-spin' : ''}`} />
                <span className="text-[9px] font-bold text-slate-400">{isOnline ? 'Online' : 'Offline'}</span>
              </div>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Sincronizar</span>
            </button>

            {/* Tema */}
            <button
              type="button"
              onClick={handleToggleTheme}
              className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-left flex flex-col space-y-1 transition-colors border border-slate-100 dark:border-slate-750"
            >
              <div className="flex items-center justify-between">
                {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-500" />}
                <span className="text-[9px] font-bold text-slate-400">{isDark ? 'Escuro' : 'Claro'}</span>
              </div>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Alternar Tema</span>
            </button>

            {/* Espaço Família */}
            <button
              type="button"
              onClick={() => { setIsHouseholdOpen(true); setShowQuickControlMenu(false); }}
              className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-left flex flex-col space-y-1 transition-colors border border-slate-100 dark:border-slate-750 relative"
            >
              <div className="flex items-center justify-between">
                <Users className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                {session && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
              </div>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Espaço Família</span>
            </button>

            {/* Notificações */}
            <button
              type="button"
              onClick={() => { setIsNotificationOpen(true); setShowQuickControlMenu(false); }}
              className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-left flex flex-col space-y-1 transition-colors border border-slate-100 dark:border-slate-750 relative"
            >
              <div className="flex items-center justify-between">
                <Bell className="w-4 h-4 text-amber-500" />
                {notificationPermission === 'granted' && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
              </div>
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Notificações</span>
            </button>
          </div>

          {/* Seletor Rápido de Modelos de Topo */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="px-1 text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 flex items-center justify-between">
              <span>Modelo do Topo</span>
              <span className="text-[10px] text-emerald-500 font-bold">M{headerModel} ativo</span>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {[1, 2, 3, 4, 5].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => selectHeaderModel(m)}
                  className={`py-1 text-xs font-bold rounded-lg transition-all ${
                    headerModel === m
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                  title={`Modelo ${m}`}
                >
                  M{m}
                </button>
              ))}
            </div>
          </div>
        </div>
      </>
    )
  );

  // Seletor Dropdown de Listas (comum a todos os modelos)
  const renderListSelectorDropdown = () => (
    showListMenu && (
      <>
        {/* Backdrop para fechar ao clicar fora */}
        <div
          className="fixed inset-0 z-40 bg-black/25 dark:bg-black/50 backdrop-blur-[1px]"
          onClick={() => setShowListMenu(false)}
          aria-hidden="true"
        />

        <div
          ref={listMenuRef}
          className="absolute top-full mt-2 left-0 w-64 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-50 animate-in fade-in zoom-in-95 duration-150"
        >
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
      </>
    )
  );

  return (
    <>
      {/* ========================================================
          MODELO 1: Apple Native Clean (Recomendado)
          Fundo 100% transparente/nativo, sem caixa escura, sem borda, 
          ações consolidadas em 1 único botão elegante de Central de Controle.
          ======================================================== */}
      {headerModel === 1 && (
        <header className="relative z-40 flex-none bg-slate-50 dark:bg-slate-950 border-none px-4 pt-1 pb-1.5 header-safe transition-colors duration-200">
          <div className="max-w-2xl mx-auto flex items-center justify-between pt-1">
            {/* Brand & List Selector */}
            <div className="relative">
              <button
                data-list-menu-trigger="true"
                onClick={() => setShowListMenu(!showListMenu)}
                className="flex items-center space-x-2 text-left group focus:outline-none"
              >
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-xs">
                  <ShoppingBag className="w-4 h-4" />
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
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium truncate max-w-[170px] sm:max-w-[240px]">
                    {activeList?.title || 'Compras do Supermercado'}
                  </p>
                </div>
              </button>

              {renderListSelectorDropdown()}
            </div>

            {/* Right side: Status Online sutil + Botão Único de Central de Controle */}
            <div className="relative flex items-center space-x-2">
              <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100/70 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                <span>{isOnline ? 'Online' : 'Offline'}</span>
              </div>

              <button
                type="button"
                data-quick-control-trigger="true"
                onClick={() => setShowQuickControlMenu(!showQuickControlMenu)}
                className="w-9 h-9 rounded-full bg-white dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs flex items-center justify-center text-slate-700 dark:text-slate-200 transition-all active:scale-95 relative"
                title="Abrir Central de Controle"
                aria-label="Central de Controle"
              >
                <SlidersHorizontal className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                {session && (
                  <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
                )}
              </button>

              {renderQuickControlMenu()}
            </div>
          </div>
        </header>
      )}

      {/* ========================================================
          MODELO 2: Hero Unificado All-in-One (Estilo Nubank / Revolut)
          O cabeçalho e o card de compras se fundem no mesmo gradiente esmeralda,
          eliminando 100% do espaço perdido entre eles.
          ======================================================== */}
      {headerModel === 2 && (
        <header className="relative z-40 flex-none bg-gradient-to-r from-emerald-600 via-emerald-650 to-teal-700 dark:from-emerald-850 dark:via-emerald-900 dark:to-teal-950 text-white border-none shadow-none px-4 pt-1.5 pb-2.5 header-safe">
          <div className="max-w-2xl mx-auto flex items-center justify-between pt-1">
            {/* Brand in translucent white */}
            <div className="relative">
              <button
                data-list-menu-trigger="true"
                onClick={() => setShowListMenu(!showListMenu)}
                className="flex items-center space-x-2 text-left group focus:outline-none"
              >
                <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-white border border-white/25 shadow-xs">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center space-x-1.5">
                    <h1 className="font-black text-white text-base leading-tight tracking-tight">
                      OrganoCasa
                    </h1>
                    <span className="text-[10px] font-bold text-white bg-white/20 border border-white/30 px-1.5 py-0.5 rounded-md leading-none">
                      {APP_VERSION}
                    </span>
                    <ChevronDown className="w-4 h-4 text-white/80" />
                  </div>
                  <p className="text-xs text-emerald-100 font-medium truncate max-w-[170px] sm:max-w-[240px]">
                    {activeList?.title || 'Compras do Supermercado'}
                  </p>
                </div>
              </button>

              {renderListSelectorDropdown()}
            </div>

            {/* Right side: Central de Controle Translúcida */}
            <div className="relative flex items-center space-x-2">
              <button
                type="button"
                data-quick-control-trigger="true"
                onClick={() => setShowQuickControlMenu(!showQuickControlMenu)}
                className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-xs border border-white/30 text-white shadow-xs flex items-center justify-center transition-all active:scale-95"
                title="Central de Controle"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>

              {renderQuickControlMenu()}
            </div>
          </div>
        </header>
      )}

      {/* ========================================================
          MODELO 3: Cápsula Flutuante / Floating Island (Estilo Arc Search / Things 3)
          Uma cápsula arredondada independente que flutua suavemente sob a Dynamic Island.
          ======================================================== */}
      {headerModel === 3 && (
        <header className="relative z-40 flex-none bg-transparent border-none px-3 pt-1 pb-1 header-safe">
          <div className="max-w-2xl mx-auto flex items-center justify-between px-3.5 py-1.5 rounded-full bg-slate-900/95 dark:bg-slate-850/95 backdrop-blur-md border border-slate-700/80 shadow-lg text-white">
            {/* Brand in Capsule */}
            <div className="relative">
              <button
                data-list-menu-trigger="true"
                onClick={() => setShowListMenu(!showListMenu)}
                className="flex items-center space-x-2 text-left focus:outline-none"
              >
                <div className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                  <ShoppingBag className="w-3.5 h-3.5" />
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="font-bold text-sm text-white leading-tight">OrganoCasa</span>
                  <span className="text-[10px] text-emerald-400 font-semibold truncate max-w-[130px]">
                    › {activeList?.title || 'Compras'}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </button>

              {renderListSelectorDropdown()}
            </div>

            {/* Right side */}
            <div className="relative flex items-center space-x-1.5">
              <button
                type="button"
                data-quick-control-trigger="true"
                onClick={() => setShowQuickControlMenu(!showQuickControlMenu)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-transform active:scale-95"
                title="Central de Controle"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
              </button>

              {renderQuickControlMenu()}
            </div>
          </div>
        </header>
      )}

      {/* ========================================================
          MODELO 4: Micro-Barra 34px Minimalista (Estilo Linear / Notion Mobile)
          Uma única linha ultra-densa com tipografia compacta e ícones de 14px.
          ======================================================== */}
      {headerModel === 4 && (
        <header className="relative z-40 flex-none bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 px-3 py-1 header-safe shadow-2xs">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            {/* Brand compact */}
            <div className="relative">
              <button
                data-list-menu-trigger="true"
                onClick={() => setShowListMenu(!showListMenu)}
                className="flex items-center space-x-1.5 text-left focus:outline-none"
              >
                <div className="w-6 h-6 rounded-md bg-emerald-600 text-white flex items-center justify-center shadow-2xs">
                  <ShoppingBag className="w-3 h-3" />
                </div>
                <span className="font-bold text-xs text-slate-900 dark:text-white leading-none">
                  OrganoCasa
                </span>
                <span className="text-[11px] text-slate-400 truncate max-w-[130px]">
                  › {activeList?.title || 'Compras'}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {renderListSelectorDropdown()}
            </div>

            {/* 4 Micro Icons */}
            <div className="relative flex items-center space-x-1">
              <button
                type="button"
                onClick={handleToggleTheme}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md transition-colors"
                title="Tema"
              >
                {isDark ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={handleManualSync}
                disabled={syncStatus.isSyncing}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md transition-colors"
                title="Sincronizar"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncStatus.isSyncing ? 'animate-spin text-emerald-500' : ''}`} />
              </button>

              <button
                type="button"
                onClick={() => setIsHouseholdOpen(true)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md transition-colors relative"
                title="Família"
              >
                <Users className="w-3.5 h-3.5" />
                {session && <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500" />}
              </button>

              <button
                type="button"
                onClick={() => setIsNotificationOpen(true)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md transition-colors"
                title="Notificações"
              >
                <Bell className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                data-quick-control-trigger="true"
                onClick={() => setShowQuickControlMenu(!showQuickControlMenu)}
                className="p-1 text-emerald-600 dark:text-emerald-400 rounded-md transition-colors"
                title="Alternar Modelo"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>

              {renderQuickControlMenu()}
            </div>
          </div>
        </header>
      )}

      {/* ========================================================
          MODELO 5: Auto-Hide no Scroll (Estilo Safari / Telegram / Instagram)
          O cabeçalho se recolhe suavemente para cima ao rolar a lista para baixo,
          e reaparece instantaneamente ao rolar para cima.
          ======================================================== */}
      {headerModel === 5 && (
        <header className={`sticky top-0 z-40 flex-none bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 px-4 py-1.5 header-safe shadow-2xs transition-all duration-300 ease-in-out ${
          isHeaderHidden ? '-translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
        }`}>
          <div className="max-w-2xl mx-auto flex items-center justify-between pt-1">
            {/* Brand & List Selector */}
            <div className="relative">
              <button
                data-list-menu-trigger="true"
                onClick={() => setShowListMenu(!showListMenu)}
                className="flex items-center space-x-2 text-left group focus:outline-none"
              >
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-xs">
                  <ShoppingBag className="w-4 h-4" />
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
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium truncate max-w-[170px] sm:max-w-[240px]">
                    {activeList?.title || 'Compras do Supermercado'}
                  </p>
                </div>
              </button>

              {renderListSelectorDropdown()}
            </div>

            {/* Right side */}
            <div className="relative flex items-center space-x-2">
              <span className="text-[10px] text-slate-400 italic hidden sm:inline">Role para recolher</span>
              <button
                type="button"
                data-quick-control-trigger="true"
                onClick={() => setShowQuickControlMenu(!showQuickControlMenu)}
                className="w-9 h-9 rounded-full bg-white dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xs flex items-center justify-center text-slate-700 dark:text-slate-200 transition-all active:scale-95"
                title="Central de Controle"
              >
                <SlidersHorizontal className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </button>

              {renderQuickControlMenu()}
            </div>
          </div>
        </header>
      )}

      {/* Modals Compartilhados */}
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

      {/* Modal de Criação de Lista */}
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
    </>
  );
};
