import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  X,
  Store,
  Calendar,
  DollarSign,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { ReconciliationItem } from '../../types';
import { ParsedReceiptData } from '../../services/receiptParser';
import { PostPurchaseAlertModal } from '../shopping/PostPurchaseAlertModal';
import { sendLocalNotification } from '../../services/notifications';
import { useReminders } from '../../hooks/useReminders';

interface ReconciliationModalProps {
  isOpen: boolean;
  receiptData: ParsedReceiptData | null;
  items: ReconciliationItem[];
  onClose: () => void;
  onConfirm: (
    receiptData: ParsedReceiptData,
    finalItems: ReconciliationItem[]
  ) => Promise<void>;
}

export const ReconciliationModal: React.FC<ReconciliationModalProps> = ({
  isOpen,
  receiptData,
  items: initialItems,
  onClose,
  onConfirm
}) => {
  const [items, setItems] = useState<ReconciliationItem[]>(initialItems);
  const [isApplying, setIsApplying] = useState(false);
  const [showPostAlert, setShowPostAlert] = useState(false);
  const [unboughtForAlert, setUnboughtForAlert] = useState<ReconciliationItem[]>([]);

  const { addReminder } = useReminders();

  React.useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  if (!isOpen || !receiptData) return null;

  const matchedItems = items.filter((i) => i.status === 'matched');
  const unboughtItems = items.filter((i) => i.status === 'unbought');
  const unplannedItems = items.filter((i) => i.status === 'unplanned');

  const handleToggleIncludeExtra = (id: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              selectedAction: it.selectedAction === 'ignore' ? 'add_to_catalog' : 'ignore'
            }
          : it
      )
    );
  };

  const handleFinalConfirm = async () => {
    setIsApplying(true);
    try {
      await onConfirm(receiptData, items);

      if (unboughtItems.length > 0) {
        sendLocalNotification('OrganoCasa: Itens pendentes', {
          body: `Você deixou de comprar ${unboughtItems.length} itens planejados da sua lista.`
        });
        setUnboughtForAlert(unboughtItems);
        setShowPostAlert(true);
      } else {
        onClose();
      }
    } finally {
      setIsApplying(false);
    }
  };

  const handleCreateReminderFromUnbought = async (unbought: ReconciliationItem[]) => {
    await addReminder({
      title: 'Comprar itens esquecidos no mercado',
      description: 'Itens que ficaram faltando na última compra',
      checklist: unbought.map((it) => `${it.name} (${it.quantity} ${it.unit})`)
    });
    setShowPostAlert(false);
    onClose();
  };

  const formattedDate = new Date(receiptData.purchaseDate).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom duration-200">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Conciliação da Nota Fiscal
                </h3>
                <span className="text-xs text-slate-500">
                  Cruzamento inteligente da lista com a nota
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Receipt Info Card */}
          <div className="p-4 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2 bg-white dark:bg-slate-800 rounded-xl">
              <span className="text-slate-400 block text-[10px]">Supermercado</span>
              <strong className="text-slate-900 dark:text-slate-100 truncate block">
                {receiptData.storeName || 'Mercado'}
              </strong>
            </div>
            <div className="p-2 bg-white dark:bg-slate-800 rounded-xl">
              <span className="text-slate-400 block text-[10px]">Data</span>
              <strong className="text-slate-900 dark:text-slate-100 block">
                {formattedDate}
              </strong>
            </div>
            <div className="p-2 bg-white dark:bg-slate-800 rounded-xl">
              <span className="text-slate-400 block text-[10px]">Total Nota</span>
              <strong className="text-emerald-600 dark:text-emerald-400 block">
                R$ {receiptData.totalAmount.toFixed(2)}
              </strong>
            </div>
          </div>

          {/* Three Reconciliation Sections */}
          <div className="p-5 overflow-y-auto flex-1 space-y-6">
            {/* 1. Matched Items (Comprados) */}
            <div className="space-y-2">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  1. Itens Comprados com Sucesso ({matchedItems.length})
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Estavam na sua lista e foram encontrados no cupom. Serão marcados como concluídos e seus preços médios serão atualizados.
              </p>

              <div className="space-y-1.5 pt-1">
                {matchedItems.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Nenhum item correspondente</p>
                ) : (
                  matchedItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2.5 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/60 rounded-xl text-xs"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <strong className="text-slate-800 dark:text-slate-200 block truncate">
                          {item.name}
                        </strong>
                        <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                          {item.quantity} {item.unit} • Pago: R$ {(item.unitPrice || item.lastPrice || 0).toFixed(2)}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        R$ {(item.totalPrice || (item.unitPrice || 0) * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 2. Unbought Items (Deixou de Comprar) */}
            <div className="space-y-2">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                <AlertTriangle className="w-4 h-4" />
                <span>
                  2. Deixou de Comprar / Faltando ({unboughtItems.length})
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Você planejou comprar mas não constam no cupom fiscal.
              </p>

              <div className="space-y-1.5 pt-1">
                {unboughtItems.length === 0 ? (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    ✨ Parabéns! Você comprou todos os itens planejados!
                  </p>
                ) : (
                  unboughtItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2.5 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 rounded-xl text-xs"
                    >
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {item.name} ({item.quantity} {item.unit})
                      </span>
                      <span className="text-[11px] text-amber-700 dark:text-amber-400 font-bold">
                        Não encontrado
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 3. Extra Purchases (Compras Extras) */}
            <div className="space-y-2">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">
                <PlusCircle className="w-4 h-4" />
                <span>
                  3. Compras Extras / Fora da Lista ({unplannedItems.length})
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Itens na nota fiscal que você não havia planejado. Marque os que deseja salvar no histórico de preços:
              </p>

              <div className="space-y-1.5 pt-1">
                {unplannedItems.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Nenhum item extra comprado</p>
                ) : (
                  unplannedItems.map((item) => (
                    <label
                      key={item.id}
                      className="flex items-center justify-between p-2.5 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/60 rounded-xl text-xs cursor-pointer hover:bg-indigo-100/60 transition-colors"
                    >
                      <div className="flex items-center space-x-2 min-w-0 flex-1 pr-2">
                        <input
                          type="checkbox"
                          checked={item.selectedAction !== 'ignore'}
                          onChange={() => handleToggleIncludeExtra(item.id)}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <div className="truncate">
                          <strong className="text-slate-800 dark:text-slate-200 block truncate">
                            {item.name}
                          </strong>
                          <span className="text-[11px] text-indigo-700 dark:text-indigo-400">
                            {item.quantity} {item.unit} • Pago: R$ {(item.unitPrice || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-slate-900 dark:text-white shrink-0">
                        R$ {(item.totalPrice || (item.unitPrice || 0) * item.quantity).toFixed(2)}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Footer Action */}
          <div className="p-4 sm:p-5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
            >
              Cancelar
            </button>

            <button
              onClick={handleFinalConfirm}
              disabled={isApplying}
              className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md flex items-center justify-center space-x-2 transition-all"
            >
              <span>{isApplying ? 'Atualizando Compras...' : 'Confirmar & Atualizar Preços'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Post-Purchase Alert Modal */}
      <PostPurchaseAlertModal
        isOpen={showPostAlert}
        unboughtItems={unboughtForAlert}
        onClose={() => {
          setShowPostAlert(false);
          onClose();
        }}
        onKeepForNextTrip={() => {
          setShowPostAlert(false);
          onClose();
        }}
        onCreateReminder={handleCreateReminderFromUnbought}
      />
    </>
  );
};
