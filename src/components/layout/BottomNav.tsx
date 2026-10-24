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
    <nav className="relative z-30 flex-none bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 nav-safe-bottom">
      <div className="max-w-2xl mx-auto flex items-stretch justify-around px-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center pt-1.5 pb-1 px-1 relative transition-colors duration-150 ${
                isActive
                  ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
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
              <span className="text-[10px] mt-0.5 leading-tight tracking-tight truncate max-w-full">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

