import React, { useEffect, useState } from 'react';
import {
  X,
  Store,
  Calendar,
  Package,
  Globe2,
  MapPin,
  ExternalLink
} from 'lucide-react';
import { PriceRecord, Product } from '../../types';
import { useProducts } from '../../hooks/useProducts';
import {
  CommunityQueryResult,
  queryCommunityPrices
} from '../../services/communityPrices';

interface PriceHistoryModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PriceHistoryModal: React.FC<PriceHistoryModalProps> = ({
  product,
  isOpen,
  onClose
}) => {
  const { getProductPriceHistory } = useProducts();
  const [history, setHistory] = useState<PriceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'mine' | 'community'>('mine');

  // Community state
  const [commState, setCommState] = useState('');
  const [commCity, setCommCity] = useState('');
  const [commLoading, setCommLoading] = useState(false);
  const [commResult, setCommResult] = useState<CommunityQueryResult>({
    records: [],
    stats: { sampleCount: 0, medianPrice: 0, minPrice: 0, maxPrice: 0, bestOffer: null },
    availableStates: [],
    availableCities: [],
    availableNeighborhoods: [],
    missingTable: false
  });

  useEffect(() => {
    if (product && isOpen) {
      setActiveTab('mine');
      setLoading(true);
      getProductPriceHistory(product.id)
        .then((records) => setHistory(records))
        .finally(() => setLoading(false));
    }
  }, [product, isOpen]);

  useEffect(() => {
    if (!product || !isOpen || activeTab !== 'community') return;

    let cancelled = false;
    setCommLoading(true);
    queryCommunityPrices({
      query: product.name,
      barcode: product.barcode,
      state: commState || undefined,
      city: commCity || undefined,
      limit: 120
    })
      .then((res) => {
        if (!cancelled) setCommResult(res);
      })
      .finally(() => {
        if (!cancelled) setCommLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [product, isOpen, activeTab, commState, commCity]);

  if (!isOpen || !product) return null;

  const prices = history.map((h) => h.price);
  const minPrice = prices.length > 0 ? Math.min(...prices) : product.lastPrice;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : product.lastPrice;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[88vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xl">
                {product.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base leading-tight">
                {product.name}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {product.category} • Unidade: {product.unit}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="px-4 pt-3 pb-2 bg-slate-50 dark:bg-slate-850 border-b border-slate-100 dark:border-slate-800">
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('mine')}
              className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'mine'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Seu Histórico ({history.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('community')}
              className={`py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all ${
                activeTab === 'community'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Globe2 className="w-3.5 h-3.5" />
              <span>Comunidade & Região</span>
            </button>
          </div>
        </div>

        {activeTab === 'mine' ? (
          <>
            {/* Price Stats Cards */}
            <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 dark:bg-slate-850 border-b border-slate-100 dark:border-slate-800">
              <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60 text-center">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                  Preço Médio
                </span>
                <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                  R$ {product.averagePrice.toFixed(2)}
                </span>
              </div>

              <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60 text-center">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                  Último Pago
                </span>
                <span className="text-sm font-extrabold text-slate-800 dark:text-slate-200 mt-0.5 block">
                  R$ {product.lastPrice.toFixed(2)}
                </span>
              </div>

              <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60 text-center">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                  Menor Preço
                </span>
                <span className="text-sm font-bold text-teal-600 dark:text-teal-400 mt-0.5 block">
                  R$ {minPrice.toFixed(2)}
                </span>
              </div>

              <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200/60 dark:border-slate-700/60 text-center">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                  Maior Preço
                </span>
                <span className="text-sm font-bold text-rose-600 dark:text-rose-400 mt-0.5 block">
                  R$ {maxPrice.toFixed(2)}
                </span>
              </div>
            </div>

            {/* History Timeline */}
            <div className="p-4 flex-1 overflow-y-auto max-h-72">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>Histórico de Compras ({history.length})</span>
              </h4>

              {loading ? (
                <div className="py-8 text-center text-slate-400 text-sm">Carregando histórico...</div>
              ) : history.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-sm">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  Nenhum registro detalhado ainda. Ele será gerado automaticamente ao ler suas Notas Fiscais!
                </div>
              ) : (
                <div className="space-y-2.5">
                  {history.map((record, index) => {
                    const isCheapest = record.price === minPrice && minPrice < maxPrice;
                    const formattedDate = new Date(record.date).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    });

                    return (
                      <div
                        key={record.id || index}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300">
                            <Store className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex items-center space-x-1.5">
                              <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                                {record.storeName || 'Supermercado'}
                              </span>
                              {isCheapest && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300">
                                  Melhor Preço
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400 block mt-0.5">
                              {formattedDate} • {record.quantity} {record.unit || product.unit}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                            R$ {record.price.toFixed(2)}
                          </div>
                          <span className="text-[10px] text-slate-400 block">
                            Total: R$ {(record.price * record.quantity).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="p-4 flex-1 overflow-y-auto space-y-3">
            {/* Region Filter */}
            <div className="grid grid-cols-2 gap-2">
              <select
                value={commState}
                onChange={(e) => {
                  setCommState(e.target.value);
                  setCommCity('');
                }}
                className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100"
              >
                <option value="">Todos os Estados</option>
                {commResult.availableStates.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>

              <select
                value={commCity}
                onChange={(e) => setCommCity(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100"
              >
                <option value="">Todas as Cidades</option>
                {commResult.availableCities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>

            {commLoading ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Consultando preços na comunidade...
              </div>
            ) : commResult.missingTable ? (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300">
                A tabela comunitária ainda está aguardando criação no Supabase.
              </div>
            ) : commResult.records.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Nenhum registro comunitário encontrado para este produto nesta região ainda.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                      Mediana Região
                    </span>
                    <strong className="text-xs font-black text-indigo-700 dark:text-indigo-300">
                      R$ {commResult.stats.medianPrice.toFixed(2)}
                    </strong>
                  </div>
                  <div className="p-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                      Menor Preço
                    </span>
                    <strong className="text-xs font-black text-emerald-700 dark:text-emerald-300">
                      R$ {commResult.stats.minPrice.toFixed(2)}
                    </strong>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                      Registros
                    </span>
                    <strong className="text-xs font-black text-slate-800 dark:text-slate-100">
                      {commResult.stats.sampleCount}
                    </strong>
                  </div>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {commResult.records.map((rec) => {
                    const formattedDate = new Date(rec.observedAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    });
                    const locationLine = [
                      rec.storeAddress,
                      rec.storeNeighborhood,
                      rec.storeCity && rec.storeState
                        ? `${rec.storeCity} - ${rec.storeState}`
                        : rec.storeCity || rec.storeState
                    ]
                      .filter(Boolean)
                      .join(' • ');

                    return (
                      <div
                        key={rec.id}
                        className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60 space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-bold text-slate-900 dark:text-white block truncate">
                              {rec.storeName}
                            </span>
                            {locationLine && (
                              <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                                {locationLine}
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              {formattedDate} • {rec.unit}
                            </span>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 block">
                              R$ {rec.unitPrice.toFixed(2)}
                            </span>
                            <a
                              href={rec.googleMapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline mt-0.5"
                            >
                              <MapPin className="w-3 h-3" />
                              <span>Maps</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 text-center bg-slate-50/50 dark:bg-slate-850/50">
          <p className="text-[11px] text-slate-400">
            💡 Dica: Toda nota lida atualiza seu histórico e contribui anonimamente para os preços da região.
          </p>
        </div>
      </div>
    </div>
  );
};

