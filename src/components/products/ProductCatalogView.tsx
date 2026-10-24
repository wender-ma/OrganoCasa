import React, { useState } from 'react';
import { Search, Tag, Plus, ShoppingCart, Edit2, Trash2, X, Save, Camera, Image as ImageIcon } from 'lucide-react';
import { Product, ProductCategory, ProductUnit } from '../../types';
import { useProducts } from '../../hooks/useProducts';
import { useShoppingList } from '../../hooks/useShoppingList';
import { CategoryPills } from '../shopping/CategoryPills';
import { PriceHistoryModal } from '../shopping/PriceHistoryModal';
import { CATEGORY_ICONS, INITIAL_CATEGORIES } from '../../db/seed';
import { compressImageFile } from '../../utils/imageCompressor';

export const ProductCatalogView: React.FC = () => {
  const { products, updateProduct, deleteProduct } = useProducts();
  const { addItem, updateItemQuantity, items: currentListItems } = useShoppingList();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'Todas'>('Todas');
  const [selectedProductForHistory, setSelectedProductForHistory] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [addedToast, setAddedToast] = useState<string | null>(null);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<ProductCategory>('Mercearia');
  const [editUnit, setEditUnit] = useState<ProductUnit>('un');
  const [editBrand, setEditBrand] = useState('');
  const [editAltBrand1, setEditAltBrand1] = useState('');
  const [editAltBrand2, setEditAltBrand2] = useState('');
  const [editBarcode, setEditBarcode] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');

  // Filter products
  const filteredProducts = products.filter((p) => {
    if (selectedCategory !== 'Todas' && p.category !== selectedCategory) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q));
    }
    return true;
  });

  const handleOpenEditModal = (prod: Product) => {
    setEditingProduct(prod);
    setEditName(prod.name);
    setEditCategory(prod.category);
    setEditUnit(prod.unit);
    setEditBrand(prod.brand || '');
    setEditAltBrand1(prod.alternativeBrands?.[0] || '');
    setEditAltBrand2(prod.alternativeBrands?.[1] || '');
    setEditBarcode(prod.barcode || '');
    setEditImageUrl(prod.imageUrl || '');
  };

  const handleSaveEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !editName.trim()) return;

    const alternativeBrands = [editAltBrand1.trim(), editAltBrand2.trim()].filter(Boolean);
    await updateProduct(editingProduct.id, {
      name: editName.trim(),
      category: editCategory,
      unit: editUnit,
      brand: editBrand.trim() || undefined,
      alternativeBrands: alternativeBrands.length > 0 ? alternativeBrands : undefined,
      barcode: editBarcode.trim() || undefined,
      imageUrl: editImageUrl.trim() || undefined
    });

    setEditingProduct(null);
    setAddedToast(`Produto "${editName.trim()}" atualizado!`);
    setTimeout(() => setAddedToast(null), 2500);
  };

  const handleDeleteProduct = async (prod: Product) => {
    await deleteProduct(prod.id);
    setAddedToast(`Produto "${prod.name}" removido do catálogo.`);
    setTimeout(() => setAddedToast(null), 2500);
  };

  const handleEditImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImageFile(file, 400, 0.75);
        setEditImageUrl(compressed);
      } catch (err) {
        console.warn('Falha ao comprimir imagem:', err);
      }
    }
  };

  const handleQuickAddToList = async (prod: Product) => {
    const existingItem = currentListItems.find(
      (i) => i.productId === prod.id && !i.isChecked
    );

    if (existingItem) {
      await updateItemQuantity(existingItem.id, Number((existingItem.quantity + 1).toFixed(2)));
      setAddedToast(`Quantidade de "${prod.name}" aumentada (+1)!`);
      setTimeout(() => setAddedToast(null), 2500);
      return;
    }

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
    <div className="space-y-4 pb-6">
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
                  {/* Top row: Image, Name & Actions */}
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
                      <div className="flex items-start justify-between gap-1">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {prod.name}
                        </h4>
                        <div className="flex items-center space-x-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(prod)}
                            className="p-1 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Editar produto"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(prod)}
                            className="p-1 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Excluir produto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
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

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150">
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Editar Produto do Catálogo
              </h3>
              <button
                onClick={() => setEditingProduct(null)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditProduct} className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nome do Produto *
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Categoria
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as ProductCategory)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {INITIAL_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {CATEGORY_ICONS[cat]} {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Unidade
                  </label>
                  <select
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value as ProductUnit)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="un">un (Unidade)</option>
                    <option value="kg">kg (Quilo)</option>
                    <option value="g">g (Grama)</option>
                    <option value="l">l (Litro)</option>
                    <option value="ml">ml (Mililitro)</option>
                    <option value="pct">pct (Pacote)</option>
                    <option value="cx">cx (Caixa)</option>
                    <option value="dz">dz (Dúzia)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                    ⭐ Marca Preferida
                  </label>
                  <input
                    type="text"
                    value={editBrand}
                    onChange={(e) => setEditBrand(e.target.value)}
                    placeholder="1ª Opção"
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Alternativa 1
                  </label>
                  <input
                    type="text"
                    value={editAltBrand1}
                    onChange={(e) => setEditAltBrand1(e.target.value)}
                    placeholder="2ª Opção"
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Alternativa 2
                  </label>
                  <input
                    type="text"
                    value={editAltBrand2}
                    onChange={(e) => setEditAltBrand2(e.target.value)}
                    placeholder="3ª Opção"
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Código de Barras (EAN)
                </label>
                <input
                  type="text"
                  value={editBarcode}
                  onChange={(e) => setEditBarcode(e.target.value)}
                  placeholder="Ex: 7891000100103"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Foto do Produto
                </label>
                <div className="flex items-center space-x-2">
                  {editImageUrl ? (
                    <div className="relative w-11 h-11 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0">
                      <img src={editImageUrl} alt="Preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setEditImageUrl('')}
                        className="absolute inset-0 bg-black/40 text-white flex items-center justify-center text-xs opacity-0 hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                  )}

                  <label className="flex-1 cursor-pointer px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-center space-x-1.5 transition-colors">
                    <Camera className="w-3.5 h-3.5" />
                    <span>Alterar Foto</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleEditImageUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!editName.trim()}
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-md flex items-center space-x-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>Salvar</span>
                </button>
              </div>
            </form>
          </div>
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

