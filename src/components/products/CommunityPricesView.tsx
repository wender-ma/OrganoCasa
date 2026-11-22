import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  MapPin,
  ExternalLink,
  Globe2,
  RefreshCw,
  Store,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Calendar
} from 'lucide-react';
import { useReceipts } from '../../hooks/useReceipts';
import {
  CommunityQueryResult,
  queryCommunityPrices,
  syncExistingReceiptsToCommunity
} from '../../services/communityPrices';

interface CommunityPricesViewProps {
  searchQuery: string;
}

function formatDateRelative(isoDate: string): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return 'Recente';
  const diffDays = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';
  if (diffDays < 30) return `há ${diffDays} dias`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const CommunityPricesView: React.FC<CommunityPricesViewProps> = ({ searchQuery }) => {
  const { receipts } = useReceipts();

  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [syncingReceipts, setSyncingReceipts] = useState<boolean>(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [result, setResult] = useState<CommunityQueryResult>({
    records: [],
    stats: { sampleCount: 0, medianPrice: 0, minPrice: 0, maxPrice: 0, bestOffer: null },
    availableStates: [],
    availableCities: [],
    availableNeighborhoods: [],
    missingTable: false
  });

  const hasAutoSyncedRef = useRef(false);

  const loadCommunityData = async () => {
    setLoading(true);
    try {
      const data = await queryCommunityPrices({
        query: searchQuery,
        state: selectedState || undefined,
        city: selectedCity || undefined,
        neighborhood: selectedNeighborhood || undefined
      });
      setResult(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadCommunityData();
    }, 180);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedState, selectedCity, selectedNeighborhood]);

  // Automatic backfill of user's already-saved receipts once per mount so community gets seeded cleanly
  useEffect(() => {
    if (hasAutoSyncedRef.current || receipts.length === 0) return;
    hasAutoSyncedRef.current = true;

    syncExistingReceiptsToCommunity(receipts)
      .then((res) => {
        if (res.uploadedCount > 0 || res.enrichedCount > 0) {
          loadCommunityData();
        }
      })
      .catch(console.warn);
  }, [receipts.length]);

  // Auto-select user's most common city on initial load if none selected yet and only when data exists
  const localCities = useMemo(() => {
    const counts = new Map<string, { city: string; state?: string; count: number }>();
    receipts.forEach((r) => {
      if (r.storeCity) {
        const key = `${r.storeCity}|${r.storeState || ''}`;
        const prev = counts.get(key);
        counts.set(key, {
          city: r.storeCity,
          state: r.storeState,
          count: (prev?.count || 0) + 1
        });
      }
    });
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  }, [receipts]);

  const handleManualBackfill = async () => {
    setSyncingReceipts(true);
    setSyncMessage(null);
    try {
      const res = await syncExistingReceiptsToCommunity(receipts);
      if (res.missingTable) {
        setSyncMessage('Tabela comunitária ainda não criada no Supabase.');
      } else {
        setSyncMessage(
          `Atualizado: ${res.uploadedCount} preços enviados • ${res.enrichedCount} lojas enriquecidas.`
        );
      }
      await loadCommunityData();
    } finally {
      setSyncingReceipts(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const handleStateChange = (uf: string) => {
    setSelectedState(uf);
    setSelectedCity('');
    setSelectedNeighborhood('');
  };

  const handleCityChange = (city: string) => {
    setSelectedCity(city);
    setSelectedNeighborhood('');
  };

  return (
    <div className="space-y-4">
      {/* Region Filters Card */}
      <div className="p-4 bg-white dark:bg-slate-850 rounded-2xl border border-slate-200/80 dark:border-slate-750 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Globe2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
              Filtrar Preços por Região / Cidade
            </span>
          </div>

          <button
            type="button"
            onClick={handleManualBackfill}
            disabled={syncingReceipts || receipts.length === 0}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${syncingReceipts ? 'animate-spin' : ''}`} />
            <span>{syncingReceipts ? 'Sincronizando...' : 'Contribuir com minhas NFs'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select
            value={selectedState}
            onChange={(e) => handleStateChange(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Todos os Estados (UF)</option>
            {result.availableStates.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>

          <select
            value={selectedCity}
            onChange={(e) => handleCityChange(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Todas as Cidades</option>
            {result.availableCities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>

          <select
            value={selectedNeighborhood}
            onChange={(e) => setSelectedNeighborhood(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">Todos os Bairros</option>
            {result.availableNeighborhoods.map((nb) => (
              <option key={nb} value={nb}>
                {nb}
              </option>
            ))}
          </select>
        </div>

        {!selectedCity && localCities[0] && result.availableCities.includes(localCities[0].city) && (
          <button
            type="button"
            onClick={() => {
              if (localCities[0].state) setSelectedState(localCities[0].state);
              setSelectedCity(localCities[0].city);
            }}
            className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
          >
            <MapPin className="w-3 h-3" />
            <span>
              Filtrar rapidamente pela minha cidade: {localCities[0].city}
              {localCities[0].state ? ` - ${localCities[0].state}` : ''}
            </span>
          </button>
        )}

        {syncMessage && (
          <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>{syncMessage}</span>
          </div>
        )}
      </div>

      {/* Missing table info */}
      {result.missingTable && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <strong className="block">Banco comunitário aguardando criação da tabela no Supabase</strong>
            <p className="text-[11px] opacity-90">
              A tabela <code>community_prices</code> ainda não foi aplicada no Supabase. Assim que ela for criada no projeto, todas as notas cadastradas passam a alimentar e aparecer aqui automaticamente.
            </p>
          </div>
        </div>
      )}

      {/* Stats Summary + Best Offer */}
      {!result.missingTable && result.records.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="p-3 bg-white dark:bg-slate-850 rounded-2xl border border-slate-200/80 dark:border-slate-750 text-center">
            <span className="text-[10px] font-semibold text-slate-400 uppercase block">
              Mediana na Região
            </span>
            <strong className="text-lg font-black text-indigo-600 dark:text-indigo-400 mt-0.5 block">
              R$ {result.stats.medianPrice.toFixed(2)}
            </strong>
            <span className="text-[10px] text-slate-400">
              {result.stats.sampleCount} {result.stats.sampleCount === 1 ? 'registro' : 'registros'}
            </span>
          </div>

          <div className="p-3 bg-white dark:bg-slate-850 rounded-2xl border border-slate-200/80 dark:border-slate-750 text-center">
            <span className="text-[10px] font-semibold text-slate-400 uppercase block">
              Faixa de Preço
            </span>
            <strong className="text-sm font-black text-slate-800 dark:text-slate-100 mt-1 block">
              R$ {result.stats.minPrice.toFixed(2)} – R$ {result.stats.maxPrice.toFixed(2)}
            </strong>
            <span className="text-[10px] text-slate-400">Mínimo / Máximo</span>
          </div>

          {result.stats.bestOffer && (
            <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800/60 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" />
                  <span>Mais Barato</span>
                </span>
                <strong className="text-sm font-black text-emerald-700 dark:text-emerald-300">
                  R$ {result.stats.bestOffer.unitPrice.toFixed(2)}
                </strong>
              </div>
              <div className="text-[11px] font-bold text-slate-800 dark:text-slate-100 truncate mt-1">
                {result.stats.bestOffer.storeName}
              </div>
              <a
                href={result.stats.bestOffer.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:underline"
              >
                <MapPin className="w-3 h-3 shrink-0" />
                <span>Abrir no Google Maps</span>
                <ExternalLink className="w-2.5 h-2.5 shrink-0" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* Results List */}
      {loading ? (
        <div className="py-10 text-center text-xs text-slate-400">
          Buscando histórico comunitário de preços...
        </div>
      ) : result.records.length === 0 && !result.missingTable ? (
        <div className="text-center py-10 px-4 bg-white dark:bg-slate-850 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 space-y-2">
          <Globe2 className="w-10 h-10 text-slate-400 mx-auto opacity-50" />
          <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
            Nenhum preço comunitário encontrado para esse filtro
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Experimente limpar o filtro de cidade/busca ou clique em &quot;Contribuir com minhas NFs&quot; acima para enviar os preços das suas notas.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {result.records.slice(0, 80).map((rec) => {
            const locationParts = [
              rec.storeNeighborhood,
              rec.storeCity && rec.storeState ? `${rec.storeCity} - ${rec.storeState}` : rec.storeCity || rec.storeState
            ].filter(Boolean);

            return (
              <div
                key={rec.id}
                className="p-3.5 bg-white dark:bg-slate-850 rounded-2xl border border-slate-200/80 dark:border-slate-750 shadow-xs space-y-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {rec.productName}
                    </h4>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 flex-wrap">
                      <span>{rec.category}</span>
                      {rec.brand && (
                        <>
                          <span>•</span>
                          <span className="font-semibold text-slate-600 dark:text-slate-300">
                            {rec.brand}
                          </span>
                        </>
                      )}
                      {rec.barcode && (
                        <>
                          <span>•</span>
                          <span>EAN: {rec.barcode}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-base font-black text-emerald-600 dark:text-emerald-400 block">
                      R$ {rec.unitPrice.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">
                      por {rec.unit}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap text-[11px]">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-200">
                      <Store className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <span className="truncate">{rec.storeName}</span>
                    </div>
                    {(rec.storeAddress || locationParts.length > 0) && (
                      <div className="text-slate-500 dark:text-slate-400 truncate pl-5">
                        {[rec.storeAddress, ...locationParts].filter(Boolean).join(' • ')}
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-slate-400 pl-5">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDateRelative(rec.observedAt)}</span>
                    </div>
                  </div>

                  <a
                    href={rec.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors shrink-0"
                  >
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Google Maps</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
