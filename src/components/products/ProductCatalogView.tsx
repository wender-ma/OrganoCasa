import React, { useState } from 'react';
import { Search, Tag, Plus, ShoppingCart, TrendingUp, Store, Calendar, Image as ImageIcon } from 'lucide-react';
import { Product, ProductCategory } from '../../types';
import { useProducts } from '../../hooks/useProducts';
import { useShoppingList } from '../../hooks/useShoppingList';
import { CategoryPills } from '../shopping/CategoryPills';
import { PriceHistoryModal } from '../shopping/PriceHistoryModal';
import { CATEGORY_ICONS } from '../../db/seed';

export const ProductCatalogView: React.FC = () => {
  const { products } = useProducts();
  const { addItem, items: currentListItems } = useShoppingList();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'Todas'>('Todas');
  const [selectedProductForHistory, setSelectedProductForHistory] = useState<Product | null>(null);
  const [addedToast, setAddedToast] = useState<string | null>(null);

  // Filter products
  const filteredProducts = products.filter((p) => {
    if (selectedCategory !== 'Todas' && p.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q));
    }
    return true;
  });

  const handleQuickAddToList = async (prod: Product) => {
    await addItem({
      name: prod.name,
      category: prod.category,
      brand: prod.brand,
      alternativeBrands: prod.alternativeBrands,
      quantity: 1,
      unit: prod.unit,
      imageUrl: prod.imageUrl,
      productId: prod.id,
      averagePrice: prod.averagePrice,
      lastPrice: prod.lastPrice
    });

    setAddedToast(`"${prod.name}" adicionado à lista!`);
    setTimeout(() => setAddedToast(null), 2500);
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Top Banner */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-5 text-white shadow-xl">
        <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
          Base de Produtos & Preços
        </span>
        <h2 className="text-2xl font-black mt-0.5">
          {products.length} {products.length === 1 ? 'produto cadastrado' : 'produtos cadastrados'}
        </h2>
        <p className="text-xs text-slate-300 mt-1">
          Acompanhe a média de preços e evolução de valores pagos nos supermercados.
        </p>

        {/* Search Input */}
        <div className="relative mt-4">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por nome ou código de barras..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800/90 border border-slate-700 rounded-2xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Added to list toast notification */}
      {addedToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-2 rounded-2xl text-xs font-bold shadow-lg animate-in fade-in slide-in-from-top-2 duration-150 flex items-center space-x-1.5">
          <ShoppingCart className="w-4 h-4" />
          <span>{addedToast}</span>
        </div>
      )}

      {/* Category Pills */}
      <CategoryPills
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
      />

      {/* Products Grid */}
      {filteredProducts.length === 0 ? (
        <div className="text-center py-12 px-4 bg-white dark:bg-slate-850 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 space-y-2">
          <Tag className="w-10 h-10 text-slate-400 mx-auto opacity-50" />
          <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
            Nenhum produto encontrado
          </h3>
          <p className="text-xs text-slate-400">
            Experimente buscar por outro termo ou mude a categoria.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredProducts.map((prod) => {
            const icon = CATEGORY_ICONS[prod.category] || '📦';
            const isInList = currentListItems.some((i) => i.productId === prod.id && !i.isChecked);

            return (
              <div
                key={prod.id}
                className="p-3.5 bg-white dark:bg-slate-850 rounded-2xl border border-slate-200/80 dark:border-slate-750 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Top row: Image & Name */}
                  <div className="flex items-start space-x-3">
                    <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shrink-0 flex items-center justify-center">
                      {prod.imageUrl ? (
                        <img
                          src={prod.imageUrl}
                          alt={prod.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-xl">{icon}</span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {prod.name}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {prod.category} • Un: {prod.unit}
                      </p>

                      {/* Brand display */}
                      {(prod.brand || (prod.alternativeBrands && prod.alternativeBrands.length > 0)) && (
                        <div className="flex items-center flex-wrap gap-1 mt-1.5">
                          {prod.brand && (
                            <span className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                              <span>⭐ {prod.brand}</span>
                            </span>
                          )}
                          {prod.alternativeBrands?.map((alt) => (
                            <span
                              key={alt}
                              className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                            >
                              Alt: {alt}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Price stats button */}
                  <button
                    onClick={() => setSelectedProductForHistory(prod)}
                    className="w-full mt-3 p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 text-left hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-medium">
                          Preço Médio
                        </span>
                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                          R$ {prod.averagePrice > 0 ? prod.averagePrice.toFixed(2) : '--'}
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block font-medium">
                          Último Pago
                        </span>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                          R$ {prod.lastPrice > 0 ? prod.lastPrice.toFixed(2) : '--'}
                        </span>
                      </div>
                    </div>

                    {prod.lastStore && (
                      <div className="mt-1.5 pt-1.5 border-t border-slate-200/50 dark:border-slate-700/50 flex items-center justify-between text-[10px] text-slate-400">
                        <span className="truncate max-w-[140px]">🏪 {prod.lastStore}</span>
                        <span className="text-emerald-600 font-semibold group-hover:underline">
                          Ver histórico →
                        </span>
                      </div>
                    )}
                  </button>
                </div>

                {/* Quick Add to List Button */}
                <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => handleQuickAddToList(prod)}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-all ${
                      isInList
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <ShoppingCart className="w-3.5 h-3.5" />
                    <span>{isInList ? 'Já está na lista (+1)' : 'Adicionar à Lista'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Price History Modal */}
      <PriceHistoryModal
        isOpen={Boolean(selectedProductForHistory)}
        product={selectedProductForHistory}
        onClose={() => setSelectedProductForHistory(null)}
      />
    </div>
  );
};

