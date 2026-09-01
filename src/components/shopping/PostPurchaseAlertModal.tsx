import React from 'react';
import { AlertTriangle, Check, ArrowRight, X, Clock, Calendar } from 'lucide-react';
import { ReconciliationItem } from '../../types';
import { CATEGORY_ICONS } from '../../db/seed';

interface PostPurchaseAlertModalProps {
  isOpen: boolean;
  unboughtItems: ReconciliationItem[];
  onClose: () => void;
  onKeepForNextTrip: () => void;
  onCreateReminder: (items: ReconciliationItem[]) => void;
}

export const PostPurchaseAlertModal: React.FC<PostPurchaseAlertModalProps> = ({
  isOpen,
  unboughtItems,
  onClose,
  onKeepForNextTrip,
  onCreateReminder
}) => {
  if (!isOpen || unboughtItems.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom duration-200 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white leading-tight">
                Você deixou de comprar!
              </h3>
              <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
                {unboughtItems.length} {unboughtItems.length === 1 ? 'item pendente' : 'itens pendentes'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          Os seguintes produtos estavam planejados na sua lista de compras mas não constam na Nota Fiscal processada:
        </p>

        {/* List of unbought items */}
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {unboughtItems.map((item) => {
            const icon = CATEGORY_ICONS[item.category] || '📦';
            return (
              <div
                key={item.id}
                className="flex items-center justify-between p-2.5 bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 rounded-xl text-xs"
              >
                <div className="flex items-center space-x-2 min-w-0 flex-1">
                  <span className="text-base">{icon}</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {item.name}
                  </span>
                </div>
                <span className="text-slate-400 font-medium shrink-0 ml-2">
                  {item.quantity} {item.unit}
                </span>
              </div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="pt-2 space-y-2">
          <button
            onClick={onKeepForNextTrip}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center space-x-2 transition-all"
          >
            <Check className="w-4 h-4" />
            <span>Manter na Lista para a Próxima Compra</span>
          </button>

          <button
            onClick={() => onCreateReminder(unboughtItems)}
            className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-xl flex items-center justify-center space-x-2 transition-colors"
          >
            <Clock className="w-4 h-4 text-teal-600" />
            <span>Criar Lembrete da Casa com Estes Itens</span>
          </button>
        </div>
      </div>
    </div>
  );
};

