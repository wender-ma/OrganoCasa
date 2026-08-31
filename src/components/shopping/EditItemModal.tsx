import React, { useState, useEffect } from 'react';
import { X, Save, Image as ImageIcon, Camera, Award, Check } from 'lucide-react';
import { ProductCategory, ProductUnit, ShoppingListItem } from '../../types';
import { INITIAL_CATEGORIES, CATEGORY_ICONS } from '../../db/seed';

interface EditItemModalProps {
  isOpen: boolean;
  item: ShoppingListItem | null;
  onClose: () => void;
  onSave: (id: string, changes: Partial<ShoppingListItem>) => Promise<void>;
}

export const EditItemModal: React.FC<EditItemModalProps> = ({
  isOpen,
  item,
  onClose,
  onSave
}) => {
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [altBrand1, setAltBrand1] = useState('');
  const [altBrand2, setAltBrand2] = useState('');
  const [category, setCategory] = useState<ProductCategory>('Mercearia');
  const [quantity, setQuantity] = useState<number>(1);
  const [unit, setUnit] = useState<ProductUnit>('un');
  const [imageUrl, setImageUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (item) {
      setName(item.name || '');
      setBrand(item.brand || '');
      setAltBrand1(item.alternativeBrands?.[0] || '');
      setAltBrand2(item.alternativeBrands?.[1] || '');
      setCategory(item.category || 'Mercearia');
      setQuantity(item.quantity || 1);
      setUnit(item.unit || 'un');
      setImageUrl(item.imageUrl || '');
      setNotes(item.notes || '');
    }
  }, [item]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        if (uploadEvent.target?.result) {
          setImageUrl(uploadEvent.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item || !name.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const alternativeBrands = [altBrand1.trim(), altBrand2.trim()].filter(Boolean);

      await onSave(item.id, {
        name: name.trim(),
        category,
        brand: brand.trim() || undefined,
        alternativeBrands: alternativeBrands.length > 0 ? alternativeBrands : undefined,
        quantity: Number(quantity) || 1,
        unit,
        imageUrl: imageUrl.trim() || undefined,
        notes: notes.trim() || undefined
      });

      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !item) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Editar Item & Marcas
            </h3>
            <p className="text-[11px] text-slate-400">
              Ajuste preferências de marca, embalagem e quantidade
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Item Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nome do Produto / Item *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>

          {/* Brands Section: Preferred (1st) & Alternatives (2nd & 3rd) */}
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 space-y-2.5">
            <div className="flex items-center space-x-1.5">
              <Award className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Preferência de Marcas no Supermercado
              </span>
            </div>

            {/* Preferred Brand (1st Priority) */}
            <div>
              <label className="block text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                ⭐ 1ª Opção: Marca Preferida
              </label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Ex: Tio João, Pilão, Ninho, Omo..."
                className="w-full px-3 py-2 rounded-xl border border-emerald-300 dark:border-emerald-700/80 bg-white dark:bg-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Alternative Brands (2nd and 3rd Priority) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  2ª Opção (Marca Alternativa 1)
                </label>
                <input
                  type="text"
                  value={altBrand1}
                  onChange={(e) => setAltBrand1(e.target.value)}
                  placeholder="Ex: Camil, Melitta, Piracanjuba..."
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  3ª Opção (Marca Alternativa 2)
                </label>
                <input
                  type="text"
                  value={altBrand2}
                  onChange={(e) => setAltBrand2(e.target.value)}
                  placeholder="Ex: Prato Fino, 3 Corações, Parmalat..."
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-400">
              💡 No supermercado você poderá clicar nas alternativas para selecionar rapidamente qual marca encontrou.
            </p>
          </div>

          {/* Category & Quantity & Unit Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {/* Category */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Categoria
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ProductCategory)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {INITIAL_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_ICONS[cat]} {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Quantidade
              </label>
              <input
                type="number"
                step="any"
                min="0.1"
                value={quantity}
                onChange={(e) => setQuantity(parseFloat(e.target.value) || 1)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>

            {/* Unit */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Unidade
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as ProductUnit)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
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

          {/* Photo Section */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Foto da Embalagem / Produto
            </label>
            <div className="flex items-center space-x-2">
              {imageUrl ? (
                <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0">
                  <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImageUrl('')}
                    className="absolute inset-0 bg-black/40 text-white flex items-center justify-center text-xs opacity-0 hover:opacity-100 transition-opacity"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                  <ImageIcon className="w-5 h-5" />
                </div>
              )}

              <label className="flex-1 cursor-pointer px-3 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-center space-x-1.5 transition-colors">
                <Camera className="w-4 h-4" />
                <span>Alterar Foto / Tirar Foto</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Observação Adicional (Opcional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Verificar data de validade, marca alternativa..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Submit Buttons */}
          <div className="pt-2 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting}
              className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-md shadow-emerald-600/20 flex items-center space-x-1.5 transition-all"
            >
              <Save className="w-4 h-4" />
              <span>Salvar Alterações</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

