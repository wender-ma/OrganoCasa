import React from 'react';
import { ShoppingCart, CheckSquare, Tag, ReceiptText } from 'lucide-react';

export type NavTab = 'shopping' | 'reminders' | 'products' | 'receipts';

interface BottomNavProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  pendingRemindersCount: number;
  shoppingItemsCount: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  pendingRemindersCount,
  shoppingItemsCount
}) => {
  const tabs = [
    {
      id: 'shopping' as NavTab,
      label: 'Lista',
      icon: ShoppingCart,
      badge: shoppingItemsCount > 0 ? shoppingItemsCount : undefined
    },
    {
      id: 'reminders' as NavTab,
      label: 'Lembretes',
      icon: CheckSquare,
      badge: pendingRemindersCount > 0 ? pendingRemindersCount : undefined,
      badgeColor: 'bg-rose-500'
    },
    {
      id: 'products' as NavTab,
      label: 'Preços & Catálogo',
      icon: Tag
    },
    {
      id: 'receipts' as NavTab,
      label: 'Notas Fiscais',
      icon: ReceiptText
    }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 pb-safe shadow-lg">
      <div className="max-w-2xl mx-auto flex items-center justify-around px-2 py-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl relative transition-all duration-150 ${
                isActive
                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform duration-150 ${
                    isActive ? 'scale-110' : ''
                  }`}
                />
                {tab.badge !== undefined && (
                  <span
                    className={`absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white flex items-center justify-center rounded-full shadow-xs ${
                      tab.badgeColor || 'bg-emerald-600'
                    }`}
                  >
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-1 tracking-tight truncate max-w-full">
                {tab.label}
              </span>
              {isActive && (
                <span className="w-1 h-1 bg-emerald-500 rounded-full mt-0.5 animate-pulse"></span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

