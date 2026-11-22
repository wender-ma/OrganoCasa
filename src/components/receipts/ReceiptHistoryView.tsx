import React, { useState } from 'react';
import {
  ReceiptText,
  Plus,
  Store,
  Calendar,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Trash2,
  TrendingDown,
  TrendingUp,
  PieChart,
  Tag,
  EyeOff,
  Eye
} from 'lucide-react';
import { useReceipts } from '../../hooks/useReceipts';
import { MonthlyComparisonModal } from './MonthlyComparisonModal';
import {
  getMonthKey,
  parseReceiptDate,
  shiftMonthKey
} from '../../utils/monthlyReceiptAnalytics';

interface ReceiptHistoryViewProps {
  onOpenUpload: () => void;
}

export const ReceiptHistoryView: React.FC<ReceiptHistoryViewProps> = ({ onOpenUpload }) => {
  const { receipts, deleteReceipt, toggleReceiptExcludeFromStats } = useReceipts();
  const [expandedReceiptId, setExpandedReceiptId] = useState<string | null>(null);
  const [isComparisonOpen, setIsComparisonOpen] = useState(false);

  const toggleExpand = (id: string) => {
    setExpandedReceiptId(expandedReceiptId === id ? null : id);
  };

  const now = new Date();
  const currentMonthKey = getMonthKey(now);
  const prevMonthKey = shiftMonthKey(currentMonthKey, -1);

  const countableReceipts = receipts.filter((r) => !r.excludeFromStats);
  const excludedReceiptsCount = receipts.length - countableReceipts.length;

  // Filter countable receipts for current month
  const currentMonthReceipts = countableReceipts.filter(
    (r) => getMonthKey(parseReceiptDate(r.purchaseDate)) === currentMonthKey
  );

  // Filter countable receipts for previous month
  const prevMonthReceipts = countableReceipts.filter(
    (r) => getMonthKey(parseReceiptDate(r.purchaseDate)) === prevMonthKey
  );

  const currentMonthTotal = currentMonthReceipts.reduce((sum, r) => sum + r.totalAmount, 0);
  const prevMonthTotal = prevMonthReceipts.reduce((sum, r) => sum + r.totalAmount, 0);
  const totalSpentAllReceipts = countableReceipts.reduce((sum, r) => sum + r.totalAmount, 0);

  // Month-over-month comparison
  let momDiffPercent = 0;
  if (prevMonthTotal > 0) {
    momDiffPercent = ((currentMonthTotal - prevMonthTotal) / prevMonthTotal) * 100;
  }

  // Find store frequency among countable receipts
  const storeCounts: Record<string, number> = {};
  countableReceipts.forEach((r) => {
    const s = r.storeName || 'Supermercado';
    storeCounts[s] = (storeCounts[s] || 0) + 1;
  });
  const mostFrequentStore = Object.entries(storeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

  return (
    <div className="space-y-4 pb-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-br from-indigo-700 to-slate-900 rounded-3xl p-5 text-white shadow-xl flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-indigo-200 uppercase tracking-wider">
            Histórico & Gastos do Mês
          </span>
          <h2 className="text-2xl font-black mt-0.5">
            R$ {currentMonthTotal.toFixed(2)}
          </h2>
          <p className="text-xs text-indigo-200/90 mt-1">
            Gasto neste mês • {currentMonthReceipts.length} {currentMonthReceipts.length === 1 ? 'compra' : 'compras'}
            {excludedReceiptsCount > 0 && ` • ${excludedReceiptsCount} só p/ preços`}
          </p>
        </div>

        <button
          onClick={onOpenUpload}
          className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold text-xs rounded-2xl shadow-lg shadow-emerald-500/20 flex items-center space-x-1.5 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Ler Nova Nota</span>
        </button>
      </div>

      {/* Monthly Analytics Card (Click to open dedicated comparison panel) */}
      {receipts.length > 0 && (
        <button
          type="button"
          onClick={() => setIsComparisonOpen(true)}
          className="w-full text-left p-4 bg-white dark:bg-slate-850 rounded-2xl border border-slate-200/80 dark:border-slate-750 hover:border-indigo-400 dark:hover:border-indigo-500 shadow-xs hover:shadow-md transition-all space-y-3 cursor-pointer group active:scale-[0.99]"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <PieChart className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Resumo & Comparativo Mensal</span>
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-full group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/60 transition-colors">
              <span>Ver detalhes</span>
              <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
            <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl">
              <span className="text-[10px] text-slate-400 block">Total Acumulado</span>
              <strong className="text-slate-800 dark:text-slate-100 font-bold block mt-0.5">
                R$ {totalSpentAllReceipts.toFixed(2)}
              </strong>
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl">
              <span className="text-[10px] text-slate-400 block">vs Mês Anterior</span>
              <div className="flex items-center justify-center space-x-0.5 mt-0.5 font-bold">
                {prevMonthTotal === 0 ? (
                  <span className="text-slate-400">1º mês</span>
                ) : momDiffPercent <= 0 ? (
                  <span className="text-emerald-600 flex items-center">
                    <TrendingDown className="w-3 h-3 mr-0.5" />
                    {Math.abs(momDiffPercent).toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-rose-600 flex items-center">
                    <TrendingUp className="w-3 h-3 mr-0.5" />
                    +{momDiffPercent.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>

            <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl">
              <span className="text-[10px] text-slate-400 block">Mercado Favorito</span>
              <strong className="text-slate-800 dark:text-slate-100 font-bold block mt-0.5 truncate">
                {mostFrequentStore || 'Geral'}
              </strong>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 flex items-center justify-between pt-0.5">
            <span>{now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
            <span className="text-indigo-600/80 dark:text-indigo-400/90 font-semibold">
              Toque para abrir o comparativo mês a mês
            </span>
          </div>
        </button>
      )}

      <MonthlyComparisonModal
        isOpen={isComparisonOpen}
        onClose={() => setIsComparisonOpen(false)}
        receipts={receipts}
      />

      {/* Receipts list */}
      {receipts.length === 0 ? (
        <div className="text-center py-12 px-4 bg-white dark:bg-slate-850 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 space-y-3">
          <ReceiptText className="w-12 h-12 text-slate-400 mx-auto opacity-50" />
          <div className="space-y-1">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">
              Nenhuma nota fiscal registrada ainda
            </h3>
            <p className="text-xs text-slate-400 max-w-xs mx-auto">
              Escaneie o QR Code ou tire foto do cupom para registrar suas compras automaticamente.
            </p>
          </div>
          <button
            onClick={onOpenUpload}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 inline-flex items-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Ler Primeira Nota</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block px-1">
            Todas as Notas Fiscais ({receipts.length})
          </span>

          {receipts.map((rec) => {
            const isExpanded = expandedReceiptId === rec.id;
            const formattedDate = new Date(rec.purchaseDate).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'short',
              year: 'numeric'
            });

            return (
              <div
                key={rec.id}
                className="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200/80 dark:border-slate-750 shadow-xs overflow-hidden transition-all"
              >
                {/* Summary Header Row */}
                <div
                  onClick={() => toggleExpand(rec.id)}
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                      <Store className="w-5 h-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {rec.storeName || 'Supermercado'}
                        </h4>
                        {rec.excludeFromStats && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 shrink-0">
                            <Tag className="w-2.5 h-2.5" />
                            <span>Somente preços</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 text-[11px] text-slate-400 mt-0.5">
                        <span className="flex items-center space-x-1">
                          <Calendar className="w-3 h-3" />
                          <span>{formattedDate}</span>
                        </span>
                        <span>•</span>
                        <span>{rec.items.length} itens</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 pl-3">
                    <div className="text-right">
                      <span
                        className={`text-sm font-black block ${
                          rec.excludeFromStats
                            ? 'text-slate-400 dark:text-slate-500 line-through'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        R$ {rec.totalAmount.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">
                        {rec.excludeFromStats ? 'Fora do mensal' : rec.rawType}
                      </span>
                    </div>

                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-3">
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                        Itens no Cupom:
                      </span>
                      {rec.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs py-1 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <span className="text-slate-700 dark:text-slate-200 truncate flex-1 pr-2">
                            {item.quantity} {item.unit} • {item.name}
                          </span>
                          <span className="font-bold text-slate-900 dark:text-white">
                            R$ {item.totalPrice.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {rec.accessKey && (
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 truncate">
                        Chave SEFAZ: {rec.accessKey}
                      </div>
                    )}

                    <div className="pt-1 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleReceiptExcludeFromStats(rec.id);
                        }}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors flex items-center space-x-1.5 ${
                          rec.excludeFromStats
                            ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50'
                            : 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50'
                        }`}
                      >
                        {rec.excludeFromStats ? (
                          <>
                            <Eye className="w-3.5 h-3.5" />
                            <span>Incluir no custo mensal</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>Tirar do custo mensal (só preços)</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteReceipt(rec.id);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors flex items-center space-x-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Excluir Registro</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
