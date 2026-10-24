import React, { useState } from 'react';
import {
  Plus,
  ReceiptText,
  Trash2,
  RotateCcw,
  Sparkles,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Calendar
} from 'lucide-react';
import { ProductCategory, Product, ShoppingListItem } from '../../types';
import { useShoppingList } from '../../hooks/useShoppingList';
import { useProducts } from '../../hooks/useProducts';
import { ShoppingItemCard } from './ShoppingItemCard';
import { AddItemModal } from './AddItemModal';
import { EditItemModal } from './EditItemModal';
import { PriceHistoryModal } from './PriceHistoryModal';
import { CATEGORY_ICONS, INITIAL_CATEGORIES } from '../../db/seed';

function getItemMonthKey(item: ShoppingListItem): string {
  const dateStr = item.updatedAt || item.createdAt;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'outros';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function formatMonthLabel(monthKey: string): string {
  if (monthKey === 'outros') return 'Outros Períodos';
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return 'Histórico';
  const d = new Date(y, m - 1, 1);
  const monthName = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return monthName.charAt(0).toUpperCase() + monthName.slice(1);
}

interface ShoppingListProps {
  onOpenReceiptUpload: () => void;
}

export const ShoppingList: React.FC<ShoppingListProps> = ({ onOpenReceiptUpload }) => {
  const {
    items,
    totalItemsCount,
    checkedItemsCount,
    progressPercentage,
    estimatedTotal,
    currentCartTotal,
    addItem,
    toggleItem,
    updateItemQuantity,
    updateItem,
    removeItem,
    clearCompletedItems,
    uncheckAllItems
  } = useShoppingList();

  const { products } = useProducts();

  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ShoppingListItem | null>(null);
  const [selectedProductForHistory, setSelectedProductForHistory] = useState<Product | null>(null);
  const [isCompletedExpanded, setIsCompletedExpanded] = useState(false);
  const [isPastMonthsExpanded, setIsPastMonthsExpanded] = useState(false);
  const [completingItemIds, setCompletingItemIds] = useState<Set<string>>(new Set());
  const completingTimeoutsRef = React.useRef<Map<string, NodeJS.Timeout>>(new Map());

  React.useEffect(() => {
    return () => {
      completingTimeoutsRef.current.forEach((t) => clearTimeout(t));
      completingTimeoutsRef.current.clear();
    };
  }, []);

  const handleToggleItem = (id: string) => {
    const targetItem = items.find((i) => i.id === id);
    if (!targetItem) return;

    // If item is pending, trigger gentle completion animation before moving to completed aggregator
    if (!targetItem.isChecked) {
      if (completingItemIds.has(id)) return; // Already animating

      // 1. Mark as completing immediately for instant visual feedback
      setCompletingItemIds((prev) => new Set(prev).add(id));

      // 2. Delay the actual state move so the user sees the check animation & strike-through comfortably
      const timeout = setTimeout(() => {
        toggleItem(id);
        setCompletingItemIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        completingTimeoutsRef.current.delete(id);
      }, 750);

      completingTimeoutsRef.current.set(id, timeout);
    } else {
      // If unchecking from the completed aggregator, toggle immediately
      toggleItem(id);
    }
  };

  // Categorias ativas no momento (apenas categorias que possuem itens pendentes na lista)
  const activeCategories = React.useMemo<ProductCategory[]>(() => {
    const allPending = items.filter((item) => !item.isChecked);
    const presentSet = new Set(allPending.map((item) => item.category));
    return [
      ...INITIAL_CATEGORIES.filter((cat) => presentSet.has(cat)),
      ...Array.from(presentSet).filter((cat) => !INITIAL_CATEGORIES.includes(cat))
    ];
  }, [items]);

  // Se a categoria selecionada não tiver mais itens ativos, volta automaticamente para null (ver todas)
  React.useEffect(() => {
    if (selectedCategory && !activeCategories.includes(selectedCategory)) {
      setSelectedCategory(null);
    }
  }, [activeCategories, selectedCategory]);

  // Filter items by category (se nenhuma selecionada, exibe todas)
  const filteredItems = selectedCategory
    ? items.filter((item) => item.category === selectedCategory)
    : items;

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentMonthName = now.toLocaleDateString('pt-BR', { month: 'long' });
  const currentMonthTitle = currentMonthName.charAt(0).toUpperCase() + currentMonthName.slice(1);

  // Separate pending items (top of page) from checked items (bottom aggregator)
  const pendingItems = filteredItems.filter((item) => !item.isChecked);
  const allCompletedItems = filteredItems.filter((item) => item.isChecked);

  // Itens finalizados do mês atual (ordem mais antigo primeiro na tela)
  const currentMonthCompletedItems = [...allCompletedItems.filter(
    (item) => getItemMonthKey(item) === currentMonthKey
  )].reverse();

  // Itens finalizados de meses anteriores (histórico arquivado)
  const pastMonthsCompletedItems = allCompletedItems.filter(
    (item) => getItemMonthKey(item) !== currentMonthKey
  );

  // Agrupamento de meses passados por chave AAAA-MM
  const pastMonthsGroups = pastMonthsCompletedItems.reduce<Record<string, ShoppingListItem[]>>((acc, item) => {
    const mKey = getItemMonthKey(item);
    if (!acc[mKey]) acc[mKey] = [];
    acc[mKey].push(item);
    return acc;
  }, {});

  const sortedPastMonthKeys = Object.keys(pastMonthsGroups).sort().reverse();

  // Group pending items by category
  const pendingCategoriesPresent = Array.from(new Set(pendingItems.map((i) => i.category)));

  const handleSelectBrand = async (itemId: string, brand: string) => {
    await updateItem(itemId, { selectedBrand: brand });
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Overview Progress & Budget Card — Compact & Space-Saving (v1.4.9) */}
      <div className="bg-gradient-to-r from-emerald-600 via-emerald-650 to-teal-700 dark:from-emerald-750 dark:to-teal-900 rounded-2xl p-3 sm:p-3.5 text-white shadow-md shadow-emerald-950/10 relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/10 rounded-full blur-lg pointer-events-none" />

        <div className="relative z-10 space-y-2">
          {/* Main Row: Progress stats & Quick action buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-baseline space-x-1.5 min-w-0">
              <span className="text-lg sm:text-xl font-black tracking-tight">
                {checkedItemsCount}/{totalItemsCount}
              </span>
              <span className="text-xs font-semibold text-emerald-100 truncate">
                itens comprados
              </span>
              <span className="text-[11px] font-bold bg-white/20 px-1.5 py-0.5 rounded-md leading-none shrink-0">
                {progressPercentage}%
              </span>
              {checkedItemsCount === totalItemsCount && totalItemsCount > 0 && (
                <span className="hidden sm:inline-flex items-center space-x-0.5 text-[10px] font-bold bg-emerald-400/30 text-emerald-100 px-1.5 py-0.5 rounded-md shrink-0">
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>Completo!</span>
                </span>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center space-x-1.5 shrink-0">
              <button
                type="button"
                onClick={onOpenReceiptUpload}
                className="px-2.5 py-1 bg-white/15 hover:bg-white/25 active:scale-95 backdrop-blur-md rounded-xl text-xs font-bold text-white flex items-center space-x-1 border border-white/20 transition-all shadow-2xs"
                title="Escanear ou ler Nota Fiscal"
              >
                <ReceiptText className="w-3.5 h-3.5" />
                <span className="text-[11px]">Ler Nota</span>
              </button>

              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="p-1.5 bg-white text-emerald-800 hover:bg-emerald-50 active:scale-95 rounded-xl shadow-xs transition-all flex items-center justify-center"
                title="Adicionar Item"
                aria-label="Adicionar Item"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
              </button>
            </div>
          </div>

          {/* Slim Progress Bar */}
          <div className="w-full h-1.5 bg-black/25 rounded-full overflow-hidden p-[1px]">
            <div
              className="h-full bg-white rounded-full transition-all duration-300 shadow-xs"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>

          {/* Compact Financial Summary Row */}
          <div className="flex items-center justify-between text-[11px] text-emerald-100/90 font-medium pt-0.5">
            <div className="flex items-center space-x-1.5">
              <span className="text-emerald-200/80 text-[10px]">No Carrinho:</span>
              <span className="font-extrabold text-white text-xs sm:text-sm">
                R$ {currentCartTotal.toFixed(2)}
              </span>
            </div>

            <div className="flex items-center space-x-1.5">
              <span className="text-emerald-200/80 text-[10px]">Total Estimado:</span>
              <span className="font-bold text-emerald-100 text-xs sm:text-sm">
                R$ {estimatedTotal.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Shopping List Items Container */}
      {filteredItems.length === 0 ? (
        <div className="text-center py-12 px-4 bg-white dark:bg-slate-850 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-500 flex items-center justify-center mx-auto text-2xl shadow-xs">
            🛒
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
              Sua lista de compras está vazia
            </h3>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Adicione itens manualmente ou escaneie o cupom fiscal para alimentar suas compras!
            </p>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 inline-flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Primeiro Item</span>
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top Section: Pending Items */}
          {pendingItems.length === 0 && allCompletedItems.length > 0 ? (
            <div className="p-5 bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-3xl text-center space-y-2 animate-in fade-in duration-200">
              <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/60 rounded-full flex items-center justify-center mx-auto text-emerald-600 dark:text-emerald-300">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-sm text-emerald-900 dark:text-emerald-200">
                Tudo comprado! 🎉
              </h4>
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                Você já marcou todos os itens da lista. Eles estão organizados no bloco de finalizados abaixo.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {pendingCategoriesPresent.map((cat, idx) => {
                const categoryItems = pendingItems.filter((i) => i.category === cat);
                const icon = CATEGORY_ICONS[cat] || '📦';

                return (
                  <div key={cat} className="space-y-2">
                    {/* Category Subheader com pílulas de filtro ao lado */}
                    <div className="flex items-center justify-between px-1 gap-2">
                      <div className="flex items-center space-x-2 shrink-0">
                        <span className="text-sm">{icon}</span>
                        <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 tracking-wide uppercase">
                          {cat} ({categoryItems.length})
                        </h3>
                      </div>

                      {/* Pílulas de categorias ativas (posicionadas ao lado no cabeçalho do primeiro grupo) */}
                      {idx === 0 && activeCategories.length > 0 && (
                        <div className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-0.5">
                          {activeCategories.map((c) => {
                            const isSelected = selectedCategory === c;
                            return (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setSelectedCategory(isSelected ? null : c)}
                                className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-150 flex items-center space-x-1 shadow-2xs ${
                                  isSelected
                                    ? 'bg-emerald-600 text-white shadow-emerald-500/20'
                                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
                                }`}
                                title={isSelected ? `Remover filtro de ${c} (ver todas)` : `Filtrar apenas ${c}`}
                              >
                                <span>{CATEGORY_ICONS[c] || '📦'}</span>
                                <span>{c}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Items under this category */}
                    <div className="space-y-2">
                      {categoryItems.map((item) => {
                        const matchedProduct = products.find((p) => p.id === item.productId);
                        return (
                          <ShoppingItemCard
                            key={item.id}
                            item={item}
                            product={matchedProduct}
                            isCompleting={completingItemIds.has(item.id)}
                            onToggle={handleToggleItem}
                            onUpdateQuantity={updateItemQuantity}
                            onRemove={removeItem}
                            onOpenPriceHistory={(prod) => setSelectedProductForHistory(prod)}
                            onEdit={(it) => setEditingItem(it)}
                            onSelectBrand={handleSelectBrand}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom Section: Compras Finalizadas no Mês Atual */}
          {currentMonthCompletedItems.length > 0 && (
            <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-3">
              <button
                type="button"
                onClick={() => setIsCompletedExpanded((prev) => !prev)}
                className="w-full flex items-center justify-between p-3.5 bg-slate-100/80 dark:bg-slate-800/80 hover:bg-slate-200/80 dark:hover:bg-slate-800 rounded-2xl transition-all text-left group shadow-xs"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-7 h-7 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                    <Check className="w-4 h-4 stroke-[3]" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                      Comprados em {currentMonthTitle} ({currentMonthCompletedItems.length})
                    </h4>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      Itens marcados no carrinho este mês (clique para {isCompletedExpanded ? 'ocultar' : 'ver'})
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200">
                  <span className="text-[11px] font-semibold hidden sm:inline">
                    {isCompletedExpanded ? 'Recolher' : 'Expandir'}
                  </span>
                  {isCompletedExpanded ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </button>

              {isCompletedExpanded && (
                <div className="space-y-2 animate-in slide-in-from-top-2 duration-150">
                  {/* Ações dos comprados (movidas da antiga barra "Pendentes • No Mês" — v1.4.11) */}
                  <div className="flex items-center justify-end space-x-1.5 px-1">
                    <button
                      type="button"
                      onClick={uncheckAllItems}
                      className="px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors flex items-center space-x-1"
                      title="Desmarcar todos (voltam para pendentes)"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Desmarcar todos</span>
                    </button>
                    <button
                      type="button"
                      onClick={clearCompletedItems}
                      className="px-2.5 py-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors flex items-center space-x-1"
                      title="Limpar itens marcados"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Limpar comprados</span>
                    </button>
                  </div>
                  {currentMonthCompletedItems.map((item) => {
                    const matchedProduct = products.find((p) => p.id === item.productId);
                    return (
                      <ShoppingItemCard
                        key={item.id}
                        item={item}
                        product={matchedProduct}
                        onToggle={handleToggleItem}
                        onUpdateQuantity={updateItemQuantity}
                        onRemove={removeItem}
                        onOpenPriceHistory={(prod) => setSelectedProductForHistory(prod)}
                        onEdit={(it) => setEditingItem(it)}
                        onSelectBrand={handleSelectBrand}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Histórico de Compras de Meses Anteriores */}
          {pastMonthsCompletedItems.length > 0 && (
            <div className="pt-2 border-t border-dashed border-slate-200 dark:border-slate-800 space-y-3">
              <button
                type="button"
                onClick={() => setIsPastMonthsExpanded((prev) => !prev)}
                className="w-full flex items-center justify-between p-3.5 bg-indigo-50/70 dark:bg-indigo-950/30 hover:bg-indigo-100/70 dark:hover:bg-indigo-950/50 border border-indigo-200/70 dark:border-indigo-900/50 rounded-2xl transition-all text-left group shadow-xs"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-indigo-950 dark:text-indigo-200 uppercase tracking-wide">
                      Histórico de Meses Anteriores ({pastMonthsCompletedItems.length})
                    </h4>
                    <span className="text-[11px] text-indigo-700/80 dark:text-indigo-400">
                      Compras finalizadas em meses passados (clique para {isPastMonthsExpanded ? 'ocultar' : 'ver'})
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2 text-indigo-500 dark:text-indigo-400">
                  <span className="text-[11px] font-semibold hidden sm:inline">
                    {isPastMonthsExpanded ? 'Recolher' : 'Expandir'}
                  </span>
                  {isPastMonthsExpanded ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </button>

              {isPastMonthsExpanded && (
                <div className="space-y-4 pt-1 animate-in slide-in-from-top-2 duration-150">
                  {sortedPastMonthKeys.map((mKey) => {
                    const monthItems = pastMonthsGroups[mKey] || [];
                    const monthLabel = formatMonthLabel(mKey);
                    const monthTotal = monthItems.reduce((acc, it) => {
                      const price = it.averagePrice > 0 ? it.averagePrice : it.lastPrice;
                      return acc + price * it.quantity;
                    }, 0);

                    return (
                      <div key={mKey} className="space-y-2 p-3 bg-slate-50 dark:bg-slate-850/60 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                        <div className="flex items-center justify-between px-1">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                              {monthLabel}
                            </span>
                            <span className="text-[10px] text-slate-500 bg-slate-200/80 dark:bg-slate-800 px-1.5 py-0.5 rounded-md font-medium">
                              {monthItems.length} {monthItems.length === 1 ? 'item' : 'itens'}
                            </span>
                          </div>
                          {monthTotal > 0 && (
                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                              R$ {monthTotal.toFixed(2)}
                            </span>
                          )}
                        </div>

                        <div className="space-y-2">
                          {monthItems.map((item) => {
                            const matchedProduct = products.find((p) => p.id === item.productId);
                            return (
                              <ShoppingItemCard
                                key={item.id}
                                item={item}
                                product={matchedProduct}
                                onToggle={handleToggleItem}
                                onUpdateQuantity={updateItemQuantity}
                                onRemove={removeItem}
                                onOpenPriceHistory={(prod) => setSelectedProductForHistory(prod)}
                                onEdit={(it) => setEditingItem(it)}
                                onSelectBrand={handleSelectBrand}
                              />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Floating Action Button (FAB) safely positioned above mobile navigation */}
      <div className="fixed fab-above-nav right-4 sm:right-6 z-40 pointer-events-auto">
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="w-14 h-14 sm:w-auto sm:px-5 sm:py-3.5 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-sm shadow-2xl shadow-emerald-950/50 border-2 border-white/20 flex items-center justify-center sm:space-x-2 transition-all"
          title="Adicionar Item"
          aria-label="Adicionar Item"
        >
          <Plus className="w-6 h-6 stroke-[2.5]" />
          <span className="hidden sm:inline">Adicionar Item</span>
        </button>
      </div>

      {/* Modals */}
      <AddItemModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddItem={addItem}
      />

      <EditItemModal
        isOpen={Boolean(editingItem)}
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSave={async (id, changes) => {
          await updateItem(id, changes);
        }}
      />

      <PriceHistoryModal
        isOpen={Boolean(selectedProductForHistory)}
        product={selectedProductForHistory}
        onClose={() => setSelectedProductForHistory(null)}
      />
    </div>
  );
};
