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
  Sparkles,
  Edit2,
  Trash2,
  Plus,
  Save
} from 'lucide-react';
import { ReconciliationItem, ProductCategory, ProductUnit } from '../../types';
import { ParsedReceiptData, guessCategoryFromName } from '../../services/receiptParser';
import { PostPurchaseAlertModal } from '../shopping/PostPurchaseAlertModal';
import { sendLocalNotification } from '../../services/notifications';
import { useReminders } from '../../hooks/useReminders';

const CATEGORIES: ProductCategory[] = [
  'Hortifrúti',
  'Carnes e Aves',
  'Laticínios e Frios',
  'Padaria e Sobremesas',
  'Bebidas',
  'Mercearia',
  'Congelados',
  'Limpeza',
  'Higiene e Beleza',
  'Pet Shop',
  'Outros'
];

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

  // Item Add / Edit Modal state
  const [itemToEdit, setItemToEdit] = useState<ReconciliationItem | null>(null);
  const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editQty, setEditQty] = useState('1');
  const [editUnit, setEditUnit] = useState<string>('un');
  const [editPrice, setEditPrice] = useState('');
  const [editCategory, setEditCategory] = useState<ProductCategory>('Mercearia');

  const { addReminder } = useReminders();

  // Reset items only when modal is opened with new receipt data
  React.useEffect(() => {
    if (isOpen) {
      setItems(initialItems);
    }
  }, [isOpen, receiptData?.accessKey, receiptData?.purchaseDate]);

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

  // Remove Item
  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  // Open Edit Modal
  const handleOpenEdit = (item: ReconciliationItem) => {
    setItemToEdit(item);
    setEditName(item.name);
    setEditQty(String(item.quantity || 1));
    setEditUnit(item.unit || 'un');
    const price = item.unitPrice || item.lastPrice || 0;
    setEditPrice(price > 0 ? String(price) : '');
    setEditCategory((item.category as ProductCategory) || guessCategoryFromName(item.name));
  };

  // Open Add New Item Modal
  const handleOpenAdd = () => {
    setItemToEdit(null);
    setEditName('');
    setEditQty('1');
    setEditUnit('un');
    setEditPrice('');
    setEditCategory('Mercearia');
    setIsNewItemModalOpen(true);
  };

  // Save Edit / New Item
  const handleSaveItemForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;

    const unitPrice = parseFloat(editPrice.replace(',', '.')) || 0;
    const qty = parseFloat(editQty.replace(',', '.')) || 1;
    const totalPrice = Number((qty * unitPrice).toFixed(2));

    if (itemToEdit) {
      // Update existing item
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemToEdit.id
            ? {
                ...it,
                name: editName.trim().toUpperCase(),
                quantity: qty,
                unit: editUnit as ProductUnit,
                unitPrice,
                lastPrice: unitPrice,
                totalPrice,
                category: editCategory
              }
            : it
        )
      );
      setItemToEdit(null);
    } else {
      // Add new item to unplanned / compras extras
      const newItem: ReconciliationItem = {
        id: `rec-manual-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        status: 'unplanned',
        name: editName.trim().toUpperCase(),
        category: editCategory,
        quantity: qty,
        unit: editUnit as ProductUnit,
        unitPrice,
        lastPrice: unitPrice,
        totalPrice,
        selectedAction: 'add_to_catalog'
      };
      setItems((prev) => [newItem, ...prev]);
      setIsNewItemModalOpen(false);
    }
  };

  const handleFinalConfirm = async () => {
    setIsApplying(true);
    try {
      const updatedReceiptData: ParsedReceiptData = {
        ...receiptData,
        totalAmount: totalCalculated > 0 ? Number(totalCalculated.toFixed(2)) : receiptData.totalAmount
      };
      await onConfirm(updatedReceiptData, items);

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

  const totalCalculated = items
    .filter((it) => it.status === 'matched' || (it.status === 'unplanned' && it.selectedAction !== 'ignore'))
    .reduce((sum, it) => sum + (it.totalPrice || (it.unitPrice || 0) * (it.quantity || 1)), 0);

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
                  Edite, adicione ou remova itens antes de salvar
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
          <div className="p-3.5 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 grid grid-cols-3 gap-2 text-center text-xs">
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
              <span className="text-slate-400 block text-[10px]">Total Calculado</span>
              <strong className="text-emerald-600 dark:text-emerald-400 block">
                R$ {totalCalculated > 0 ? totalCalculated.toFixed(2) : receiptData.totalAmount.toFixed(2)}
              </strong>
            </div>
          </div>

          {/* Reconciliation Sections */}
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-6">
            {/* Quick Add Button */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleOpenAdd}
                className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Acrescentar Item Manualmente</span>
              </button>
            </div>

            {/* 1. Matched Items (Comprados) */}
            <div className="space-y-2">
              <div className="flex items-center space-x-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  1. Itens Comprados com Sucesso ({matchedItems.length})
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Estavam na sua lista e foram encontrados no cupom. Marcam a lista e atualizam os preços médios.
              </p>

              <div className="space-y-1.5 pt-1">
                {matchedItems.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Nenhum item correspondente</p>
                ) : (
                  matchedItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2.5 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/60 rounded-xl text-xs group"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <strong className="text-slate-800 dark:text-slate-200 block truncate">
                          {item.name}
                        </strong>
                        <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                          {item.quantity} {item.unit} • Pago: R$ {(item.unitPrice || item.lastPrice || 0).toFixed(2)}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          R$ {(item.totalPrice || (item.unitPrice || 0) * (item.quantity || 1)).toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(item)}
                          className="p-1 text-slate-400 hover:text-emerald-600 rounded-lg transition-colors"
                          title="Editar Item"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                          title="Remover Item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
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
                      <div className="flex items-center space-x-2">
                        <span className="text-[11px] text-amber-700 dark:text-amber-400 font-bold">
                          Não encontrado
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                          title="Remover da Conciliação"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 3. Extra Purchases (Compras Extras) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">
                  <PlusCircle className="w-4 h-4" />
                  <span>
                    3. Compras Extras / Fora da Lista ({unplannedItems.length})
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-500">
                Itens na nota fiscal que você não havia planejado. Você pode editar, incluir no catálogo ou remover:
              </p>

              <div className="space-y-1.5 pt-1">
                {unplannedItems.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Nenhum item extra comprado</p>
                ) : (
                  unplannedItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2.5 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/60 rounded-xl text-xs transition-colors"
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
                            {item.quantity} {item.unit} • Pago: R$ {(item.unitPrice || 0).toFixed(2)} • {item.category}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          R$ {(item.totalPrice || (item.unitPrice || 0) * (item.quantity || 1)).toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(item)}
                          className="p-1 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors"
                          title="Editar Item"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                          title="Remover Item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
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

      {/* Item Edit / Add Modal Dialog */}
      {(itemToEdit || isNewItemModalOpen) && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                {itemToEdit ? 'Editar Item da Nota' : 'Acrescentar Novo Item'}
              </h4>
              <button
                type="button"
                onClick={() => {
                  setItemToEdit(null);
                  setIsNewItemModalOpen(false);
                }}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveItemForm} className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Nome do Produto
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Ex: ARROZ TIO JOAO 5KG"
                  required
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs uppercase focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Quantidade
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    placeholder="1"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Unidade
                  </label>
                  <select
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="un">un (Unidade)</option>
                    <option value="kg">kg (Quilo)</option>
                    <option value="g">g (Grama)</option>
                    <option value="l">l (Litro)</option>
                    <option value="pct">pct (Pacote)</option>
                    <option value="cx">cx (Caixa)</option>
                    <option value="dz">dz (Dúzia)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Preço Unitário (R$)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Categoria
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as ProductCategory)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs flex justify-between items-center font-bold">
                <span className="text-slate-500">Valor Total do Item:</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  R$ {((parseFloat(editQty.replace(',', '.')) || 1) * (parseFloat(editPrice.replace(',', '.')) || 0)).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setItemToEdit(null);
                    setIsNewItemModalOpen(false);
                  }}
                  className="px-3.5 py-2 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center space-x-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Salvar Item</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
