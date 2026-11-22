import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  BarChart3,
  TrendingDown,
  TrendingUp,
  ArrowLeftRight,
  Store,
  Tag,
  ShoppingBag,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ReceiptText,
  Minus
} from 'lucide-react';
import { Receipt } from '../../types';
import {
  TimelineRange,
  buildMonthlyReport,
  buildTimelineSeries,
  compareTwoMonths,
  formatMonthLabel,
  parseReceiptDate,
  resolveDefaultComparisonMonths
} from '../../utils/monthlyReceiptAnalytics';

interface MonthlyComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  receipts: Receipt[];
}

type DetailTab = 'categories' | 'stores' | 'products' | 'timeline';

function formatBRL(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

interface DeltaBadgeProps {
  diff: number;
  diffPercent: number | null;
  invertColors?: boolean; // true = lower expense is positive (emerald)
  suffix?: string;
}

const DeltaBadge: React.FC<DeltaBadgeProps> = ({
  diff,
  diffPercent,
  invertColors = true,
  suffix = ''
}) => {
  if (Math.abs(diff) < 0.01 && diffPercent !== null) {
    return (
      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
        <Minus className="w-3 h-3" />
        0%
      </span>
    );
  }

  if (diffPercent === null) {
    if (diff > 0) {
      return (
        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300">
          Novo{suffix ? ` (${suffix})` : ''}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
        Sem base
      </span>
    );
  }

  const isDecrease = diff < 0;
  const isGood = invertColors ? isDecrease : !isDecrease;
  const colorClasses = isGood
    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
    : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300';

  const Icon = isDecrease ? TrendingDown : TrendingUp;
  const sign = diff > 0 ? '+' : '';

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${colorClasses}`}>
      <Icon className="w-3 h-3 shrink-0" />
      <span>
        {sign}
        {diffPercent.toFixed(1)}%
      </span>
    </span>
  );
};

export const MonthlyComparisonModal: React.FC<MonthlyComparisonModalProps> = ({
  isOpen,
  onClose,
  receipts
}) => {
  const report = useMemo(() => buildMonthlyReport(receipts), [receipts]);
  const defaults = useMemo(() => resolveDefaultComparisonMonths(report), [report]);

  const [monthA, setMonthA] = useState<string>(defaults.monthA);
  const [monthB, setMonthB] = useState<string>(defaults.monthB);
  const [timelineRange, setTimelineRange] = useState<TimelineRange>('6m');
  const [activeTab, setActiveTab] = useState<DetailTab>('categories');
  const [showMonthReceipts, setShowMonthReceipts] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMonthA(defaults.monthA);
      setMonthB(defaults.monthB);
      setShowMonthReceipts(false);
    }
  }, [isOpen, defaults.monthA, defaults.monthB]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const comparison = useMemo(
    () => compareTwoMonths(report.bucketMap, monthA, monthB),
    [report.bucketMap, monthA, monthB]
  );

  const timeline = useMemo(
    () => buildTimelineSeries(report.bucketMap, timelineRange),
    [report.bucketMap, timelineRange]
  );

  if (!isOpen) return null;

  const handleSelectMonthFromChart = (clickedKey: string) => {
    if (clickedKey === monthA) return;
    if (clickedKey === monthB) {
      setMonthB(monthA);
    }
    setMonthA(clickedKey);
  };

  const handleSwapMonths = () => {
    setMonthA(monthB);
    setMonthB(monthA);
  };

  const maxCategoryValue = Math.max(
    1,
    ...comparison.categories.map((c) => Math.max(c.amountA, c.amountB))
  );

  const avgLineBottomPct =
    timeline.maxAmount > 0 && timeline.averageActive > 0
      ? Math.min(96, Math.max(4, (timeline.averageActive / timeline.maxAmount) * 100))
      : null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Comparativo Mensal de Notas Fiscais"
        className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom duration-200"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 dark:text-white text-base leading-tight">
                Comparativo Mensal Dedicado
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {receipts.length} {receipts.length === 1 ? 'nota' : 'notas'} em {report.activeMonthsCount}{' '}
                {report.activeMonthsCount === 1 ? 'mês' : 'meses'} • Média de{' '}
                <strong className="text-slate-700 dark:text-slate-200">
                  {formatBRL(report.overallAverageMonthly)}/mês
                </strong>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar painel comparativo"
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto p-4 sm:p-5 space-y-5 flex-1">
          {/* Direct Comparison Selectors */}
          <div className="bg-slate-50 dark:bg-slate-850 p-3 rounded-2xl border border-slate-200/70 dark:border-slate-800">
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-1">
                  Mês em Análise
                </label>
                <select
                  value={monthA}
                  onChange={(e) => setMonthA(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800/80 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {report.selectableMonthKeys.map((key) => {
                    const count = report.bucketMap[key]?.receiptCount || 0;
                    return (
                      <option key={key} value={key}>
                        {formatMonthLabel(key, 'medium')} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>

              <button
                type="button"
                onClick={handleSwapMonths}
                title="Inverter meses comparados"
                aria-label="Inverter meses comparados"
                className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:border-indigo-300 transition-colors mb-0.5"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1">
                  Comparar com
                </label>
                <select
                  value={monthB}
                  onChange={(e) => setMonthB(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-800/70 text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {report.selectableMonthKeys.map((key) => {
                    const count = report.bucketMap[key]?.receiptCount || 0;
                    return (
                      <option key={key} value={key}>
                        {formatMonthLabel(key, 'medium')} ({count})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>

          {/* Primary KPI Comparison */}
          <div className="space-y-2.5">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-700 via-indigo-800 to-slate-900 text-white shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-200 block">
                    {comparison.bucketA.longLabel}
                  </span>
                  <div className="text-2xl sm:text-3xl font-black mt-0.5">
                    {formatBRL(comparison.bucketA.totalAmount)}
                  </div>
                  <div className="text-xs text-indigo-200/90 mt-1">
                    vs <strong>{formatBRL(comparison.bucketB.totalAmount)}</strong> em{' '}
                    {comparison.bucketB.mediumLabel}
                  </div>
                </div>

                <div className="text-right shrink-0 space-y-1">
                  <DeltaBadge
                    diff={comparison.totalDiff}
                    diffPercent={comparison.totalDiffPercent}
                  />
                  <div className="text-xs font-bold text-indigo-100">
                    {comparison.totalDiff === 0
                      ? 'Mesmo valor'
                      : comparison.totalDiff < 0
                        ? `Economizou ${formatBRL(Math.abs(comparison.totalDiff))}`
                        : `+${formatBRL(comparison.totalDiff)} a mais`}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200/70 dark:border-slate-800">
                <span className="text-[10px] font-semibold text-slate-400 uppercase block">
                  Compras
                </span>
                <div className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                  {comparison.bucketA.receiptCount}
                  <span className="text-xs font-medium text-slate-400 ml-1">
                    vs {comparison.bucketB.receiptCount}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {comparison.countDiff > 0
                    ? `+${comparison.countDiff} idas`
                    : comparison.countDiff < 0
                      ? `${comparison.countDiff} idas`
                      : 'Mesma freq.'}
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200/70 dark:border-slate-800">
                <span className="text-[10px] font-semibold text-slate-400 uppercase block">
                  Ticket Médio
                </span>
                <div className="text-sm sm:text-base font-black text-slate-900 dark:text-white mt-0.5 truncate">
                  {formatBRL(comparison.bucketA.averageTicket)}
                </div>
                <div className="mt-0.5 flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] text-slate-400">
                    vs {formatBRL(comparison.bucketB.averageTicket)}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200/70 dark:border-slate-800">
                <span className="text-[10px] font-semibold text-slate-400 uppercase block">
                  Itens Lidos
                </span>
                <div className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                  {comparison.bucketA.itemCount}
                  <span className="text-xs font-medium text-slate-400 ml-1">
                    vs {comparison.bucketB.itemCount}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {comparison.itemsDiff > 0
                    ? `+${comparison.itemsDiff} itens`
                    : comparison.itemsDiff < 0
                      ? `${comparison.itemsDiff} itens`
                      : 'Mesmo volume'}
                </span>
              </div>
            </div>
          </div>

          {/* Monthly Evolution Chart */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-850 border border-slate-200/80 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Evolução dos Gastos Mês a Mês
                </h4>
                <p className="text-[11px] text-slate-400">
                  Toque em uma barra para selecioná-la como Mês em Análise
                </p>
              </div>

              <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 text-[11px] font-bold">
                {(
                  [
                    ['6m', '6M'],
                    ['12m', '12M'],
                    ['all', 'Tudo']
                  ] as Array<[TimelineRange, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTimelineRange(key)}
                    className={`px-2.5 py-1 rounded-lg transition-colors ${
                      timelineRange === key
                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-[10px] font-semibold text-slate-500 dark:text-slate-400 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-indigo-600 inline-block" />
                Em análise ({formatMonthLabel(monthA, 'short')})
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" />
                Comparado ({formatMonthLabel(monthB, 'short')})
              </span>
              {timeline.averageActive > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-4 border-t-2 border-dashed border-emerald-500 inline-block" />
                  Média ({formatBRL(timeline.averageActive)})
                </span>
              )}
            </div>

            {/* Bars Area */}
            <div className="overflow-x-auto pb-1">
              <div
                className="relative h-44 flex items-end gap-2 pt-6 px-1"
                style={{ minWidth: timeline.points.length > 7 ? `${timeline.points.length * 48}px` : '100%' }}
              >
                {avgLineBottomPct !== null && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 border-t-2 border-dashed border-emerald-500/70 z-10"
                    style={{ bottom: `calc(${avgLineBottomPct}% * 0.72 + 24px)` }}
                  />
                )}

                {timeline.points.map((pt) => {
                  const isA = pt.monthKey === monthA;
                  const isB = pt.monthKey === monthB;
                  const heightPct =
                    pt.totalAmount > 0
                      ? Math.max(8, Math.round((pt.totalAmount / timeline.maxAmount) * 100))
                      : 0;

                  const barColor = isA
                    ? 'bg-indigo-600 dark:bg-indigo-500 ring-2 ring-indigo-300 dark:ring-indigo-400/50'
                    : isB
                      ? 'bg-amber-500 dark:bg-amber-400 ring-2 ring-amber-200 dark:ring-amber-400/40'
                      : pt.hasData
                        ? 'bg-slate-300 dark:bg-slate-700 hover:bg-indigo-400 dark:hover:bg-indigo-600'
                        : 'bg-slate-100 dark:bg-slate-800/70';

                  return (
                    <button
                      key={pt.monthKey}
                      type="button"
                      onClick={() => handleSelectMonthFromChart(pt.monthKey)}
                      className="flex-1 min-w-[38px] h-full flex flex-col justify-end items-center group cursor-pointer focus:outline-none"
                      title={`${pt.mediumLabel}: ${formatBRL(pt.totalAmount)} (${pt.receiptCount} notas)`}
                    >
                      <span
                        className={`text-[10px] font-bold mb-1 whitespace-nowrap ${
                          isA
                            ? 'text-indigo-600 dark:text-indigo-300'
                            : isB
                              ? 'text-amber-600 dark:text-amber-300'
                              : 'text-slate-400'
                        }`}
                      >
                        {pt.totalAmount > 0 ? Math.round(pt.totalAmount) : '—'}
                      </span>

                      <div className="w-full max-w-[34px] h-[72%] flex items-end justify-center">
                        <div
                          className={`w-full rounded-t-lg transition-all duration-300 ${barColor}`}
                          style={{ height: pt.totalAmount > 0 ? `${heightPct}%` : '4px' }}
                        />
                      </div>

                      <span
                        className={`text-[10px] uppercase font-bold mt-1.5 ${
                          isA
                            ? 'text-indigo-600 dark:text-indigo-300'
                            : isB
                              ? 'text-amber-600 dark:text-amber-300'
                              : 'text-slate-400'
                        }`}
                      >
                        {pt.axisLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Dedicated Breakdown Tabs */}
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 dark:bg-slate-850 rounded-2xl border border-slate-200/70 dark:border-slate-800">
              {(
                [
                  ['categories', 'Categorias', Tag],
                  ['stores', 'Mercados', Store],
                  ['products', 'Top Itens', ShoppingBag],
                  ['timeline', 'Mês a Mês', CalendarDays]
                ] as Array<[DetailTab, string, React.ElementType]>
              ).map(([tabKey, label, Icon]) => (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => setActiveTab(tabKey)}
                  className={`py-2 px-1.5 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 transition-all ${
                    activeTab === tabKey
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>

            {/* Tab 1: Categories */}
            {activeTab === 'categories' && (
              <div className="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    Comparativo por Categoria
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {formatMonthLabel(monthA, 'short')} vs {formatMonthLabel(monthB, 'short')}
                  </span>
                </div>

                {comparison.categories.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">
                    Nenhuma compra registrada nos dois meses selecionados.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {comparison.categories.map((cat) => {
                      const pctA = Math.round((cat.amountA / maxCategoryValue) * 100);
                      const pctB = Math.round((cat.amountB / maxCategoryValue) * 100);
                      return (
                        <div key={cat.category} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="font-bold text-slate-800 dark:text-slate-100 truncate">
                              {cat.category}
                            </span>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-bold text-slate-700 dark:text-slate-200">
                                {formatBRL(cat.amountA)}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                / {formatBRL(cat.amountB)}
                              </span>
                              <DeltaBadge diff={cat.diff} diffPercent={cat.diffPercent} />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full transition-all duration-300"
                                style={{ width: `${cat.amountA > 0 ? Math.max(3, pctA) : 0}%` }}
                              />
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-amber-400 dark:bg-amber-500 rounded-full transition-all duration-300"
                                style={{ width: `${cat.amountB > 0 ? Math.max(3, pctB) : 0}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Stores */}
            {activeTab === 'stores' && (
              <div className="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    Gastos por Supermercado
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {formatMonthLabel(monthA, 'short')} vs {formatMonthLabel(monthB, 'short')}
                  </span>
                </div>

                {comparison.stores.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">
                    Nenhum supermercado registrado nos meses selecionados.
                  </p>
                ) : (
                  comparison.stores.map((st) => (
                    <div
                      key={st.storeName}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs text-slate-900 dark:text-white truncate">
                          {st.storeName}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {st.countA}x em {formatMonthLabel(monthA, 'short')} • {st.countB}x em{' '}
                          {formatMonthLabel(monthB, 'short')}
                        </div>
                      </div>

                      <div className="text-right shrink-0 space-y-1">
                        <div className="text-xs font-black text-slate-900 dark:text-white">
                          {formatBRL(st.amountA)}
                          <span className="font-normal text-slate-400 ml-1">
                            vs {formatBRL(st.amountB)}
                          </span>
                        </div>
                        <DeltaBadge diff={st.diff} diffPercent={st.diffPercent} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab 3: Top Products */}
            {activeTab === 'products' && (
              <div className="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    Itens que Mais Pesaram no Mês
                  </span>
                  <span className="text-[11px] text-slate-400">Top 15</span>
                </div>

                {comparison.products.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">
                    Nenhum item detalhado nas notas dos meses selecionados.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {comparison.products.slice(0, 15).map((prod) => (
                      <div
                        key={prod.key}
                        className="py-2.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                            {prod.displayName}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Qtd: {prod.qtyA} ({formatMonthLabel(monthA, 'short')}) vs {prod.qtyB} (
                            {formatMonthLabel(monthB, 'short')})
                          </div>
                        </div>

                        <div className="text-right shrink-0 space-y-0.5">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {formatBRL(prod.amountA)}{' '}
                            <span className="text-[11px] font-normal text-slate-400">
                              / {formatBRL(prod.amountB)}
                            </span>
                          </div>
                          <DeltaBadge diff={prod.diff} diffPercent={prod.diffPercent} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: Month-by-Month Summary Table */}
            {activeTab === 'timeline' && (
              <div className="bg-white dark:bg-slate-850 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    Histórico Consolidado Mês a Mês
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Total geral: {formatBRL(report.overallTotalSpent)}
                  </span>
                </div>

                {report.highestSpendMonth && report.lowestSpendMonth && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40">
                      <span className="text-[10px] font-bold uppercase text-rose-600 dark:text-rose-400 block">
                        Maior Gasto Mensal
                      </span>
                      <strong className="text-slate-900 dark:text-white">
                        {report.highestSpendMonth.mediumLabel} •{' '}
                        {formatBRL(report.highestSpendMonth.totalAmount)}
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
                      <span className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400 block">
                        Menor Gasto Mensal
                      </span>
                      <strong className="text-slate-900 dark:text-white">
                        {report.lowestSpendMonth.mediumLabel} •{' '}
                        {formatBRL(report.lowestSpendMonth.totalAmount)}
                      </strong>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {report.trendRowsDesc.map((row) => {
                    const isA = row.monthKey === monthA;
                    const isB = row.monthKey === monthB;
                    return (
                      <button
                        key={row.monthKey}
                        type="button"
                        onClick={() => handleSelectMonthFromChart(row.monthKey)}
                        className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                          isA
                            ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700'
                            : isB
                              ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-300 dark:border-amber-800'
                              : 'bg-slate-50 dark:bg-slate-800/60 border-transparent hover:border-slate-200 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900 dark:text-white">
                              {row.mediumLabel}
                            </span>
                            {isA && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-600 text-white">
                                Em análise
                              </span>
                            )}
                            {isB && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-white">
                                Comparado
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                            {row.receiptCount} {row.receiptCount === 1 ? 'nota' : 'notas'} • Ticket{' '}
                            {formatBRL(row.averageTicket)}
                            {row.topStore ? ` • ${row.topStore.storeName}` : ''}
                          </div>
                        </div>

                        <div className="text-right shrink-0 space-y-1">
                          <div className="text-xs font-black text-slate-900 dark:text-white">
                            {formatBRL(row.totalAmount)}
                          </div>
                          <DeltaBadge diff={row.momDiffAmount} diffPercent={row.momDiffPercent} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Month A Receipts Drilldown */}
          {comparison.bucketA.receipts.length > 0 && (
            <div className="bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowMonthReceipts((prev) => !prev)}
                className="w-full p-3.5 flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <ReceiptText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>
                    Notas de {comparison.bucketA.mediumLabel} ({comparison.bucketA.receiptCount})
                  </span>
                </span>
                {showMonthReceipts ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {showMonthReceipts && (
                <div className="px-3.5 pb-3.5 space-y-1.5 border-t border-slate-200/60 dark:border-slate-800 pt-2.5">
                  {comparison.bucketA.receipts.map((rec) => (
                    <div
                      key={rec.id}
                      className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <span className="font-bold text-slate-800 dark:text-slate-100 truncate block">
                          {rec.storeName || 'Supermercado'}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {parseReceiptDate(rec.purchaseDate).toLocaleDateString('pt-BR')} •{' '}
                          {rec.items.length} itens
                        </span>
                      </div>
                      <span className="font-black text-slate-900 dark:text-white shrink-0">
                        {formatBRL(rec.totalAmount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
