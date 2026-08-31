import React, { useState } from 'react';
import {
  ShoppingBag,
  Wifi,
  WifiOff,
  Plus,
  ChevronDown,
  CheckCircle2,
  Users,
  Smartphone
} from 'lucide-react';
import { ShoppingList } from '../../types';
import { HouseholdModal } from '../collaboration/HouseholdModal';
import { InstallPwaModal } from './InstallPwaModal';
import { getCurrentSession } from '../../services/supabaseSync';

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

  const session = getCurrentSession();

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
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 py-3 shadow-sm">
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
              <div className="flex items-center space-x-1">
                <h1 className="font-bold text-slate-900 dark:text-white text-base leading-tight">
                  OrganoCasa
                </h1>
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
              <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Suas Listas de Compras
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

        {/* Right side: Install PWA + Family Account + Offline badge */}
        <div className="flex items-center space-x-1.5">
          {/* Install PWA Button */}
          <button
            onClick={() => setIsInstallPwaOpen(true)}
            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-xl transition-colors"
            title="Instalar App no Celular"
          >
            <Smartphone className="w-4 h-4" />
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

      {/* Modals */}
      <HouseholdModal
        isOpen={isHouseholdOpen}
        onClose={() => setIsHouseholdOpen(false)}
      />

      <InstallPwaModal
        isOpen={isInstallPwaOpen}
        onClose={() => setIsInstallPwaOpen(false)}
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
