import React, { useState } from 'react';
import { Check, Plus, Minus, Trash2, Tag, Info, Edit2, Award, Sparkles, X, Layers } from 'lucide-react';
import { ShoppingListItem, Product } from '../../types';
import { CATEGORY_ICONS } from '../../db/seed';

interface ShoppingItemCardProps {
  item: ShoppingListItem;
  product?: Product;
  onToggle: (id: string) => void;
  onUpdateQuantity: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
  onOpenPriceHistory: (product: Product) => void;
  onEdit?: (item: ShoppingListItem) => void;
  onSelectBrand?: (id: string, brand: string) => void;
}

export const ShoppingItemCard: React.FC<ShoppingItemCardProps> = ({
  item,
  product,
  onToggle,
  onUpdateQuantity,
  onRemove,
  onOpenPriceHistory,
  onEdit,
  onSelectBrand
}) => {
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);

  const displayPrice = item.averagePrice > 0 ? item.averagePrice : item.lastPrice;
  const itemTotal = displayPrice * item.quantity;
  const categoryIcon = CATEGORY_ICONS[item.category] || '📦';

  // Construct a fallback Product object if item doesn't have an explicit Product record yet
  const targetProduct: Product = product || {
    id: item.productId || item.id,
    name: item.name,
    category: item.category,
    brand: item.brand,
    alternativeBrands: item.alternativeBrands,
    imageUrl: item.imageUrl,
    unit: item.unit,
    averagePrice: item.averagePrice,
    lastPrice: item.lastPrice,
    purchaseCount: item.lastPrice > 0 ? 1 : 0,
    createdAt: item.createdAt,
    updatedAt: item.createdAt
  };

  const handleStepQuantity = (delta: number) => {
    const isWeight = item.unit === 'kg';
    const step = isWeight ? 0.5 : 1;
    const newQty = Math.max(0, Number((item.quantity + delta * step).toFixed(2)));
    onUpdateQuantity(item.id, newQty);
  };

  const primaryBrand = item.brand || product?.brand;
  const alternativeBrands = item.alternativeBrands || product?.alternativeBrands || [];
  const activeSelectedBrand = item.selectedBrand || primaryBrand;

  return (
    <>
      <div
        className={`group relative flex flex-col p-3 rounded-2xl border transition-all duration-200 gap-2.5 ${
          item.isChecked
            ? 'bg-slate-100/70 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800/70 opacity-75'
            : 'bg-white dark:bg-slate-850 border-slate-200/80 dark:border-slate-750 shadow-xs hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-700/60'
        }`}
      >
        {/* Main Row */}
        <div className="flex items-center justify-between">
          {/* Left: Checkbox & Image & Info */}
          <div className="flex items-center space-x-3 flex-1 min-w-0">
            {/* Checkbox */}
            <button
              onClick={() => onToggle(item.id)}
              className={`w-6 h-6 rounded-xl flex items-center justify-center transition-all duration-150 shrink-0 ${
                item.isChecked
                  ? 'bg-emerald-500 text-white shadow-xs scale-95'
                  : 'border-2 border-slate-300 dark:border-slate-600 hover:border-emerald-500 bg-transparent'
              }`}
              aria-label={item.isChecked ? 'Desmarcar item' : 'Marcar item'}
            >
              {item.isChecked && <Check className="w-4 h-4 stroke-[3]" />}
            </button>

            {/* Thumbnail Image with Click to Zoom */}
            <button
              type="button"
              onClick={() => setIsPhotoModalOpen(true)}
              className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shrink-0 flex items-center justify-center relative group/img hover:border-emerald-500 transition-colors"
              title="Clique para ver foto da embalagem e marcas"
            >
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-200"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <span className="text-xl">{categoryIcon}</span>
              )}
            </button>

            {/* Product Details */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-1.5">
                <h4
                  className={`text-sm font-bold truncate ${
                    item.isChecked
                      ? 'line-through text-slate-400 dark:text-slate-500'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {item.name}
                </h4>
              </div>

              <div className="flex items-center space-x-2 mt-0.5 flex-wrap gap-y-1">
                {/* Clickable Price Tag with Average / Last price */}
                {displayPrice > 0 ? (
                  <button
                    type="button"
                    onClick={() => onOpenPriceHistory(targetProduct)}
                    className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-lg text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors group/btn"
                    title="Clique para ver histórico completo de preços"
                  >
                    <Tag className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    <span>
                      {item.averagePrice > 0
                        ? `Méd: R$ ${item.averagePrice.toFixed(2)}`
                        : `Últ: R$ ${item.lastPrice.toFixed(2)}`}
                    </span>
                    <Info className="w-2.5 h-2.5 opacity-60 group-hover/btn:opacity-100" />
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-400">Sem preço cadastrado</span>
                )}

                {item.notes && (
                  <span className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded truncate max-w-[140px]">
                    {item.notes}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Quantity Stepper & Subtotal & Edit/Remove */}
          <div className="flex items-center space-x-2 pl-2 shrink-0">
            {/* Total Price for this item */}
            {itemTotal > 0 && (
              <div className="text-right hidden sm:block">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  R$ {itemTotal.toFixed(2)}
                </span>
              </div>
            )}

            {/* Quantity Controls */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-xl p-0.5 border border-slate-200/70 dark:border-slate-700">
              <button
                onClick={() => handleStepQuantity(-1)}
                className="w-7 h-7 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors"
                aria-label="Diminuir quantidade"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              
              <div className="px-2 text-xs font-bold text-slate-900 dark:text-white min-w-[28px] text-center">
                {item.quantity}
                <span className="text-[9px] text-slate-400 ml-0.5 font-normal">{item.unit}</span>
              </div>

              <button
                onClick={() => handleStepQuantity(1)}
                className="w-7 h-7 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 rounded-lg transition-colors"
                aria-label="Aumentar quantidade"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Edit Item Button */}
            {onEdit && (
              <button
                onClick={() => onEdit(item)}
                className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-xl transition-colors opacity-70 group-hover:opacity-100"
                title="Editar marcas e detalhes do item"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Delete Item Button */}
            <button
              onClick={() => onRemove(item.id)}
              className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors opacity-70 group-hover:opacity-100"
              aria-label="Remover item da lista"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Brand Prioritization & Alternatives Bar */}
        {(primaryBrand || alternativeBrands.length > 0) && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center flex-wrap gap-1.5 text-xs">
            <span className="text-[10px] font-bold text-slate-400 flex items-center space-x-1 shrink-0 mr-1">
              <Award className="w-3 h-3 text-amber-500" />
              <span>Marcas:</span>
            </span>

            {/* 1st Choice (Preferred) */}
            {primaryBrand && (
              <button
                type="button"
                onClick={() => onSelectBrand?.(item.id, primaryBrand)}
                className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold flex items-center space-x-1 border transition-all ${
                  activeSelectedBrand === primaryBrand
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800 hover:bg-emerald-100'
                }`}
                title="1ª Opção: Marca Preferida (Clique para selecionar)"
              >
                <span>⭐ 1ª {primaryBrand}</span>
                {activeSelectedBrand === primaryBrand && <Check className="w-3 h-3" />}
              </button>
            )}

            {/* 2nd & 3rd Choices (Alternatives) */}
            {alternativeBrands.map((altBrand, idx) => {
              const priorityNum = idx + 2;
              const isSelected = activeSelectedBrand === altBrand;

              return (
                <button
                  key={altBrand}
                  type="button"
                  onClick={() => onSelectBrand?.(item.id, altBrand)}
                  className={`px-2 py-0.5 rounded-lg text-[11px] font-medium flex items-center space-x-1 border transition-all ${
                    isSelected
                      ? 'bg-amber-500 text-white border-amber-500 shadow-xs font-semibold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-750'
                  }`}
                  title={`${priorityNum}ª Opção (Clique se comprou esta alternativa)`}
                >
                  <span className="text-[10px] opacity-75">{priorityNum}ª</span>
                  <span>{altBrand}</span>
                  {isSelected && <Check className="w-3 h-3" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Product Packaging & Brand Zoom Modal */}
      {isPhotoModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-slate-900 dark:text-white text-base truncate">
                  {item.name}
                </h3>
                <p className="text-xs text-slate-400">
                  {item.category} • {item.quantity} {item.unit}
                </p>
              </div>
              <button
                onClick={() => setIsPhotoModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Big Product Image */}
            <div className="w-full aspect-square bg-slate-100 dark:bg-slate-950 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex items-center justify-center">
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-full h-full object-contain p-2"
                />
              ) : (
                <div className="text-center space-y-2">
                  <span className="text-5xl">{categoryIcon}</span>
                  <p className="text-xs text-slate-400">Sem foto da embalagem cadastrada</p>
                </div>
              )}
            </div>

            {/* Brand Priority Breakdown */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center space-x-1.5">
                <Award className="w-4 h-4 text-amber-500" />
                <span>Ordem de Prioridade no Supermercado</span>
              </span>

              <div className="space-y-1.5 pt-1">
                {primaryBrand ? (
                  <div className="flex items-center justify-between p-2 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs">
                    <span className="font-bold text-emerald-800 dark:text-emerald-300">
                      🥇 1ª Opção (Preferida)
                    </span>
                    <span className="font-extrabold text-emerald-900 dark:text-emerald-100">
                      {primaryBrand}
                    </span>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic p-1">
                    Nenhuma marca preferida cadastrada.
                  </div>
                )}

                {alternativeBrands.map((alt, idx) => (
                  <div
                    key={alt}
                    className="flex items-center justify-between p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                  >
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      {idx === 0 ? '🥈 2ª Opção (Reserva)' : '🥉 3ª Opção (Reserva)'}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">{alt}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end space-x-2 pt-1">
              {onEdit && (
                <button
                  onClick={() => {
                    setIsPhotoModalOpen(false);
                    onEdit(item);
                  }}
                  className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold flex items-center space-x-1.5"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Editar Marcas/Foto</span>
                </button>
              )}
              <button
                onClick={() => setIsPhotoModalOpen(false)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
