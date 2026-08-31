import React, { useState } from 'react';
import {
  Plus,
  ReceiptText,
  Trash2,
  RotateCcw,
  Sparkles
} from 'lucide-react';
import { ProductCategory, Product, ShoppingListItem } from '../../types';
import { useShoppingList } from '../../hooks/useShoppingList';
import { useProducts } from '../../hooks/useProducts';
import { CategoryPills } from './CategoryPills';
import { ShoppingItemCard } from './ShoppingItemCard';
import { AddItemModal } from './AddItemModal';
import { EditItemModal } from './EditItemModal';
import { PriceHistoryModal } from './PriceHistoryModal';
import { CATEGORY_ICONS } from '../../db/seed';

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

  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'Todas'>('Todas');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ShoppingListItem | null>(null);
  const [selectedProductForHistory, setSelectedProductForHistory] = useState<Product | null>(null);

  // Filter items by category
  const filteredItems = selectedCategory === 'Todas'
    ? items
    : items.filter((item) => item.category === selectedCategory);

  // Group filtered items by category
  const categoriesPresent = Array.from(new Set(filteredItems.map((i) => i.category)));

  const handleSelectBrand = async (itemId: string, brand: string) => {
    await updateItem(itemId, { selectedBrand: brand });
  };

  return (
    <div className="space-y-4 pb-36 sm:pb-32">
      {/* Overview Progress & Budget Card */}
      <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-3xl p-5 text-white shadow-xl shadow-emerald-900/10 relative overflow-hidden">
        {/* Subtle decorative circles */}
        <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
        <div className="absolute left-1/2 -top-10 w-24 h-24 bg-white/10 rounded-full blur-lg pointer-events-none" />

        <div className="relative z-10 space-y-3">
          {/* Header row */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-emerald-100 uppercase tracking-wider">
                Progresso das Compras
              </span>
              <h2 className="text-2xl font-black mt-0.5">
                {checkedItemsCount} de {totalItemsCount} itens
              </h2>
            </div>

            <div className="flex items-center space-x-2">
              {/* Quick Add Button */}
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="p-2 bg-white text-emerald-800 hover:bg-emerald-50 active:scale-95 rounded-2xl text-xs font-bold flex items-center justify-center shadow-md transition-all"
                title="Adicionar Item"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
              </button>

              {/* Quick NF Scan Button */}
              <button
                onClick={onOpenReceiptUpload}
                className="px-3.5 py-2 bg-white/20 hover:bg-white/30 active:scale-95 backdrop-blur-md rounded-2xl text-xs font-bold text-white flex items-center space-x-1.5 border border-white/30 transition-all shadow-xs"
              >
                <ReceiptText className="w-4 h-4" />
                <span className="hidden sm:inline">Ler Nota</span>
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-1">
            <div className="w-full h-2.5 bg-black/20 rounded-full overflow-hidden p-0.5">
              <div
                className="h-full bg-white rounded-full transition-all duration-300 shadow-xs"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] font-medium text-emerald-100">
              <span>{progressPercentage}% concluído</span>
              {checkedItemsCount === totalItemsCount && totalItemsCount > 0 && (
                <span className="flex items-center space-x-1 text-emerald-200 font-bold">
                  <Sparkles className="w-3 h-3" />
                  <span>Carrinho completo!</span>
                </span>
              )}
            </div>
          </div>

          {/* Budget & Spend row */}
          <div className="pt-2 border-t border-white/15 flex items-center justify-between text-xs">
            <div>
              <span className="text-emerald-100/80 block text-[10px]">No Carrinho</span>
              <span className="font-extrabold text-base text-white">
                R$ {currentCartTotal.toFixed(2)}
              </span>
            </div>

            <div className="text-right">
              <span className="text-emerald-100/80 block text-[10px]">Total Estimado</span>
              <span className="font-bold text-sm text-emerald-100">
                R$ {estimatedTotal.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Category Pills Filter */}
      <CategoryPills
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
      />

      {/* Action Toolbar: Add Item, Clear Checked, Uncheck All */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Itens da Lista ({filteredItems.length})
        </span>

        <div className="flex items-center space-x-1.5">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-xl transition-colors flex items-center space-x-1"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Adicionar</span>
          </button>

          {checkedItemsCount > 0 && (
            <button
              onClick={clearCompletedItems}
              className="px-2.5 py-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors flex items-center space-x-1"
              title="Limpar itens marcados"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpar</span>
            </button>
          )}

          {checkedItemsCount > 0 && (
            <button
              onClick={uncheckAllItems}
              className="px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors flex items-center space-x-1"
              title="Desmarcar todos"
            >
              <RotateCcw className="w-3 h-3" />
              <span className="hidden sm:inline">Desmarcar</span>
            </button>
          )}
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
        <div className="space-y-5">
          {categoriesPresent.map((cat) => {
            const categoryItems = filteredItems.filter((i) => i.category === cat);
            const icon = CATEGORY_ICONS[cat] || '📦';

            return (
              <div key={cat} className="space-y-2">
                {/* Category Subheader */}
                <div className="flex items-center space-x-2 px-1">
                  <span className="text-sm">{icon}</span>
                  <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 tracking-wide uppercase">
                    {cat} ({categoryItems.length})
                  </h3>
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
                        onToggle={toggleItem}
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

      {/* Floating Action Button (FAB) safely positioned above mobile navigation */}
      <div className="fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] right-4 sm:right-6 z-40 pointer-events-auto">
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
