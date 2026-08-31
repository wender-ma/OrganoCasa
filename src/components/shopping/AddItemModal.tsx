import React, { useState, useEffect } from 'react';
import { X, Search, Globe, Plus, Sparkles, Image as ImageIcon, Camera, DollarSign, Award, Layers, Check } from 'lucide-react';
import { ProductCategory, ProductUnit, Product } from '../../types';
import { INITIAL_CATEGORIES, CATEGORY_ICONS } from '../../db/seed';
import { useProducts } from '../../hooks/useProducts';
import { searchProductsByName, OFFProductResult } from '../../services/openFoodFacts';

interface AddItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddItem: (data: {
    name: string;
    category: ProductCategory;
    quantity: number;
    unit: ProductUnit;
    brand?: string;
    alternativeBrands?: string[];
    imageUrl?: string;
    productId?: string;
    averagePrice?: number;
    lastPrice?: number;
    notes?: string;
  }) => Promise<any>;
}

export const AddItemModal: React.FC<AddItemModalProps> = ({
  isOpen,
  onClose,
  onAddItem
}) => {
  const { products } = useProducts();

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [altBrand1, setAltBrand1] = useState('');
  const [altBrand2, setAltBrand2] = useState('');
  const [category, setCategory] = useState<ProductCategory>('Mercearia');
  const [quantity, setQuantity] = useState<number>(1);
  const [unit, setUnit] = useState<ProductUnit>('un');
  const [imageUrl, setImageUrl] = useState('');
  const [price, setPrice] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<string | undefined>();

  // Online Search
  const [onlineResults, setOnlineResults] = useState<OFFProductResult[]>([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);

  // Local autocomplete suggestions
  const suggestions = name.trim().length > 0
    ? products.filter((p) => p.name.toLowerCase().includes(name.trim().toLowerCase())).slice(0, 5)
    : [];

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setBrand('');
      setAltBrand1('');
      setAltBrand2('');
      setCategory('Mercearia');
      setQuantity(1);
      setUnit('un');
      setImageUrl('');
      setPrice('');
      setNotes('');
      setSelectedProductId(undefined);
      setOnlineResults([]);
    }
  }, [isOpen]);

  const handleSelectProduct = (prod: Product) => {
    setName(prod.name);
    setCategory(prod.category);
    setUnit(prod.unit);
    setBrand(prod.brand || '');
    setAltBrand1(prod.alternativeBrands?.[0] || '');
    setAltBrand2(prod.alternativeBrands?.[1] || '');
    setImageUrl(prod.imageUrl || '');
    setPrice(prod.lastPrice > 0 ? prod.lastPrice.toString() : '');
    setSelectedProductId(prod.id);
  };

  const handleSelectOnlineResult = (off: OFFProductResult) => {
    setName(off.product_name);
    setCategory(off.category);
    setUnit(off.unit);
    if (off.image_url) setImageUrl(off.image_url);

    // If Open Food Facts returns brands, populate preferred brand and alternative
    if (off.brands) {
      const brandParts = off.brands.split(',').map((b) => b.trim()).filter(Boolean);
      if (brandParts.length > 0) setBrand(brandParts[0]);
      if (brandParts.length > 1) setAltBrand1(brandParts[1]);
      if (brandParts.length > 2) setAltBrand2(brandParts[2]);
    }

    setOnlineResults([]);
  };

  const handleSearchOnline = async () => {
    if (!name.trim()) return;
    setIsSearchingOnline(true);
    try {
      const res = await searchProductsByName(name.trim());
      setOnlineResults(res);
    } finally {
      setIsSearchingOnline(false);
    }
  };

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
    if (!name.trim()) return;

    const parsedPrice = parseFloat(price.replace(',', '.')) || 0;
    const alternativeBrands = [altBrand1.trim(), altBrand2.trim()].filter(Boolean);

    await onAddItem({
      name: name.trim(),
      category,
      brand: brand.trim() || undefined,
      alternativeBrands: alternativeBrands.length > 0 ? alternativeBrands : undefined,
      quantity: Number(quantity) || 1,
      unit,
      imageUrl: imageUrl.trim() || undefined,
      productId: selectedProductId,
      lastPrice: parsedPrice,
      averagePrice: parsedPrice,
      notes: notes.trim() || undefined
    });

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Adicionar Item à Lista
              </h3>
              <p className="text-[11px] text-slate-400">
                Defina marca preferida, alternativas e foto do item
              </p>
            </div>
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
          {/* Item Name Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nome do Produto / Item *
            </label>
            <div className="relative">
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSelectedProductId(undefined);
                }}
                placeholder="Ex: Arroz Branco, Café Torrado, Sabão em Pó..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-24"
                required
                autoFocus
              />
              <button
                type="button"
                onClick={handleSearchOnline}
                disabled={!name.trim() || isSearchingOnline}
                className="absolute right-1.5 top-1.5 px-2.5 py-1.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 rounded-lg text-xs font-semibold flex items-center space-x-1 disabled:opacity-40 transition-colors"
                title="Buscar foto e dados no Open Food Facts"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>{isSearchingOnline ? 'Buscando...' : 'Buscar Foto'}</span>
              </button>
            </div>

            {/* Local Database Suggestions */}
            {suggestions.length > 0 && !selectedProductId && (
              <div className="mt-2 bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-2">
                <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 block mb-1">
                  Sugestões do seu catálogo:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectProduct(p)}
                      className="px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-emerald-900 border border-emerald-200/80 dark:border-emerald-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 flex items-center space-x-1.5 shadow-2xs"
                    >
                      <span>{CATEGORY_ICONS[p.category] || '📦'}</span>
                      <span className="font-medium">{p.name}</span>
                      {p.brand && (
                        <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 px-1 py-0.2 rounded font-semibold">
                          ⭐ {p.brand}
                        </span>
                      )}
                      {p.lastPrice > 0 && (
                        <span className="text-[10px] text-emerald-600 font-bold">
                          (R$ {p.lastPrice.toFixed(2)})
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Online Search Results */}
            {onlineResults.length > 0 && (
              <div className="mt-2 bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 max-h-40 overflow-y-auto">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-1.5">
                  Produtos encontrados online (clique para aplicar foto e marcas):
                </span>
                <div className="space-y-1.5">
                  {onlineResults.map((off, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectOnlineResult(off)}
                      className="w-full text-left p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg flex items-center space-x-2 border border-transparent hover:border-slate-200 dark:hover:border-slate-600 transition-colors"
                    >
                      {off.image_url ? (
                        <img
                          src={off.image_url}
                          alt={off.product_name}
                          className="w-8 h-8 rounded-md object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-md bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs">
                          📦
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {off.product_name}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {off.brands ? `Marca: ${off.brands} • ` : ''}
                          {off.category}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
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
              💡 Caso não encontre a 1ª opção no mercado, o app exibirá as opções 2 e 3 para facilitar a escolha.
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

          {/* Price & Image Preview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Price (optional) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Preço Estimado / Último (R$)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">
                  R$
                </span>
                <input
                  type="text"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0,00"
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Image Preview & Upload */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Foto da Embalagem / Produto
              </label>
              <div className="flex items-center space-x-2">
                {imageUrl ? (
                  <div className="relative w-11 h-11 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 shrink-0">
                    <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
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
                  <span>Foto / Câmera</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              </div>
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
              placeholder="Ex: Pegar pacote lacrado, verificar validade..."
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
              disabled={!name.trim()}
              className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-md shadow-emerald-600/20 flex items-center space-x-1.5 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar à Lista</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

