import { Receipt } from '../types';
import { guessCategoryFromName } from './categoryMatcher';

export interface StoreBreakdown {
  storeName: string;
  totalAmount: number;
  receiptCount: number;
}

export interface ProductBreakdown {
  key: string;
  displayName: string;
  totalAmount: number;
  totalQuantity: number;
  occurrences: number;
}

export interface MonthlyBucket {
  monthKey: string; // YYYY-MM
  year: number;
  monthIndex: number; // 0-11
  shortLabel: string;
  mediumLabel: string;
  longLabel: string;
  receipts: Receipt[];
  receiptCount: number;
  totalAmount: number;
  averageTicket: number;
  itemCount: number;
  topStore: StoreBreakdown | null;
  byCategory: Record<string, number>;
  byStore: Record<string, StoreBreakdown>;
  byProduct: Record<string, ProductBreakdown>;
}

export interface MonthlyTrendRow extends MonthlyBucket {
  prevMonthKey: string;
  prevMonthAmount: number;
  momDiffAmount: number;
  momDiffPercent: number | null;
}

export interface MonthlyReport {
  bucketsDesc: MonthlyBucket[];
  bucketMap: Record<string, MonthlyBucket>;
  selectableMonthKeys: string[];
  trendRowsDesc: MonthlyTrendRow[];
  overallTotalSpent: number;
  overallAverageMonthly: number;
  activeMonthsCount: number;
  countedReceiptsCount: number;
  excludedReceiptsCount: number;
  excludedTotalSpent: number;
  highestSpendMonth: MonthlyBucket | null;
  lowestSpendMonth: MonthlyBucket | null;
}

export interface CategoryComparisonRow {
  category: string;
  amountA: number;
  amountB: number;
  diff: number;
  diffPercent: number | null;
}

export interface StoreComparisonRow {
  storeName: string;
  amountA: number;
  amountB: number;
  countA: number;
  countB: number;
  diff: number;
  diffPercent: number | null;
}

export interface ProductComparisonRow {
  key: string;
  displayName: string;
  amountA: number;
  amountB: number;
  qtyA: number;
  qtyB: number;
  diff: number;
  diffPercent: number | null;
}

export interface MonthlyComparison {
  bucketA: MonthlyBucket;
  bucketB: MonthlyBucket;
  totalDiff: number;
  totalDiffPercent: number | null;
  countDiff: number;
  ticketDiff: number;
  ticketDiffPercent: number | null;
  itemsDiff: number;
  categories: CategoryComparisonRow[];
  stores: StoreComparisonRow[];
  products: ProductComparisonRow[];
}

export type TimelineRange = '6m' | '12m' | 'all';

export interface TimelineBarPoint {
  monthKey: string;
  axisLabel: string;
  mediumLabel: string;
  totalAmount: number;
  receiptCount: number;
  hasData: boolean;
}

const SHORT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const FULL_MONTHS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
];

/**
 * Parses receipt dates without UTC midnight timezone shift on YYYY-MM-DD strings.
 */
export function parseReceiptDate(dateStr?: string): Date {
  if (!dateStr) return new Date();

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]) - 1;
    const day = Number(dateOnly[3]);
    return new Date(year, month, day, 12, 0, 0);
  }

  const parsed = new Date(dateStr);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function getMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function parseMonthKey(monthKey: string): { year: number; monthIndex: number } {
  const [yStr, mStr] = monthKey.split('-');
  const year = Number(yStr) || new Date().getFullYear();
  const monthIndex = Math.max(0, Math.min(11, (Number(mStr) || 1) - 1));
  return { year, monthIndex };
}

export function shiftMonthKey(monthKey: string, deltaMonths: number): string {
  const { year, monthIndex } = parseMonthKey(monthKey);
  const shifted = new Date(year, monthIndex + deltaMonths, 1, 12, 0, 0);
  return getMonthKey(shifted);
}

export function formatMonthLabel(monthKey: string, variant: 'short' | 'medium' | 'long' = 'medium'): string {
  const { year, monthIndex } = parseMonthKey(monthKey);
  const shortYear = String(year).slice(-2);
  if (variant === 'short') {
    return `${SHORT_MONTHS[monthIndex]}/${shortYear}`;
  }
  if (variant === 'long') {
    return `${FULL_MONTHS[monthIndex]} de ${year}`;
  }
  const cap = SHORT_MONTHS[monthIndex].charAt(0).toUpperCase() + SHORT_MONTHS[monthIndex].slice(1);
  return `${cap}/${year}`;
}

export function createEmptyBucket(monthKey: string): MonthlyBucket {
  const { year, monthIndex } = parseMonthKey(monthKey);
  return {
    monthKey,
    year,
    monthIndex,
    shortLabel: formatMonthLabel(monthKey, 'short'),
    mediumLabel: formatMonthLabel(monthKey, 'medium'),
    longLabel: formatMonthLabel(monthKey, 'long'),
    receipts: [],
    receiptCount: 0,
    totalAmount: 0,
    averageTicket: 0,
    itemCount: 0,
    topStore: null,
    byCategory: {},
    byStore: {},
    byProduct: {}
  };
}

function normalizeProductKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function safeDiffPercent(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function formatBRLCompact(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Groups all receipts into monthly buckets and computes cross-month KPIs.
 */
export function buildMonthlyReport(receipts: Receipt[], referenceDate = new Date()): MonthlyReport {
  const bucketMap: Record<string, MonthlyBucket> = {};
  const countableReceipts = receipts.filter((r) => !r.excludeFromStats);
  const excludedReceipts = receipts.filter((r) => Boolean(r.excludeFromStats));

  for (const receipt of countableReceipts) {
    const parsedDate = parseReceiptDate(receipt.purchaseDate);
    const monthKey = getMonthKey(parsedDate);
    if (!bucketMap[monthKey]) {
      bucketMap[monthKey] = createEmptyBucket(monthKey);
    }

    const bucket = bucketMap[monthKey];
    const receiptTotal = Number(receipt.totalAmount) || 0;
    const storeName = (receipt.storeName || 'Supermercado').trim() || 'Supermercado';

    bucket.receipts.push(receipt);
    bucket.receiptCount += 1;
    bucket.totalAmount += receiptTotal;
    bucket.itemCount += receipt.items.length;

    if (!bucket.byStore[storeName]) {
      bucket.byStore[storeName] = { storeName, totalAmount: 0, receiptCount: 0 };
    }
    bucket.byStore[storeName].totalAmount += receiptTotal;
    bucket.byStore[storeName].receiptCount += 1;

    if (receipt.items.length === 0) {
      bucket.byCategory['Outros'] = (bucket.byCategory['Outros'] || 0) + receiptTotal;
      continue;
    }

    for (const item of receipt.items) {
      const itemTotal = Number(item.totalPrice) || (Number(item.unitPrice) || 0) * (Number(item.quantity) || 1);
      const itemCategory = item.category || guessCategoryFromName(item.name || '');
      bucket.byCategory[itemCategory] = (bucket.byCategory[itemCategory] || 0) + itemTotal;

      const prodKey = normalizeProductKey(item.name || '');
      if (prodKey) {
        if (!bucket.byProduct[prodKey]) {
          bucket.byProduct[prodKey] = {
            key: prodKey,
            displayName: item.name.trim(),
            totalAmount: 0,
            totalQuantity: 0,
            occurrences: 0
          };
        }
        bucket.byProduct[prodKey].totalAmount += itemTotal;
        bucket.byProduct[prodKey].totalQuantity += Number(item.quantity) || 1;
        bucket.byProduct[prodKey].occurrences += 1;
      }
    }
  }

  for (const bucket of Object.values(bucketMap)) {
    bucket.totalAmount = formatBRLCompact(bucket.totalAmount);
    bucket.averageTicket = bucket.receiptCount > 0 ? formatBRLCompact(bucket.totalAmount / bucket.receiptCount) : 0;
    bucket.receipts.sort(
      (a, b) => parseReceiptDate(b.purchaseDate).getTime() - parseReceiptDate(a.purchaseDate).getTime()
    );

    const storesSorted = Object.values(bucket.byStore).sort(
      (a, b) => b.receiptCount - a.receiptCount || b.totalAmount - a.totalAmount
    );
    bucket.topStore = storesSorted[0] || null;
  }

  const bucketsDesc = Object.values(bucketMap).sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  const currentKey = getMonthKey(referenceDate);
  const prevKey = shiftMonthKey(currentKey, -1);
  const selectableSet = new Set<string>([currentKey, prevKey, ...bucketsDesc.map((b) => b.monthKey)]);
  const selectableMonthKeys = Array.from(selectableSet).sort((a, b) => b.localeCompare(a));

  const trendRowsDesc: MonthlyTrendRow[] = bucketsDesc.map((bucket) => {
    const prevMonthKey = shiftMonthKey(bucket.monthKey, -1);
    const prevAmount = bucketMap[prevMonthKey]?.totalAmount ?? 0;
    const momDiffAmount = formatBRLCompact(bucket.totalAmount - prevAmount);
    return {
      ...bucket,
      prevMonthKey,
      prevMonthAmount: prevAmount,
      momDiffAmount,
      momDiffPercent: safeDiffPercent(bucket.totalAmount, prevAmount)
    };
  });

  const overallTotalSpent = formatBRLCompact(bucketsDesc.reduce((sum, b) => sum + b.totalAmount, 0));
  const activeMonthsCount = bucketsDesc.length;
  const overallAverageMonthly = activeMonthsCount > 0 ? formatBRLCompact(overallTotalSpent / activeMonthsCount) : 0;

  const sortedByTotal = [...bucketsDesc].sort((a, b) => b.totalAmount - a.totalAmount);
  const highestSpendMonth = sortedByTotal[0] || null;
  const lowestSpendMonth = sortedByTotal.length > 1 ? sortedByTotal[sortedByTotal.length - 1] : null;

  const excludedReceiptsCount = excludedReceipts.length;
  const excludedTotalSpent = formatBRLCompact(
    excludedReceipts.reduce((sum, r) => sum + (Number(r.totalAmount) || 0), 0)
  );

  return {
    bucketsDesc,
    bucketMap,
    selectableMonthKeys,
    trendRowsDesc,
    overallTotalSpent,
    overallAverageMonthly,
    activeMonthsCount,
    countedReceiptsCount: countableReceipts.length,
    excludedReceiptsCount,
    excludedTotalSpent,
    highestSpendMonth,
    lowestSpendMonth
  };
}

/**
 * Picks smart initial comparison pair (Month A = most recent month with data or current month;
 * Month B = its immediate previous month with data if available, or previous calendar month).
 */
export function resolveDefaultComparisonMonths(
  report: MonthlyReport,
  referenceDate = new Date()
): { monthA: string; monthB: string } {
  const currentKey = getMonthKey(referenceDate);
  const latestDataKey = report.bucketsDesc[0]?.monthKey;

  const monthA = report.bucketMap[currentKey] ? currentKey : latestDataKey || currentKey;
  const prevCalKey = shiftMonthKey(monthA, -1);
  const olderDataBucket = report.bucketsDesc.find((b) => b.monthKey < monthA);
  const monthB = report.bucketMap[prevCalKey] ? prevCalKey : olderDataBucket?.monthKey || prevCalKey;

  return { monthA, monthB };
}

/**
 * Builds continuous monthly series for the evolution bar chart.
 */
export function buildTimelineSeries(
  bucketMap: Record<string, MonthlyBucket>,
  range: TimelineRange,
  referenceDate = new Date()
): { points: TimelineBarPoint[]; averageActive: number; maxAmount: number } {
  const allDataKeys = Object.keys(bucketMap).sort();
  const currentKey = getMonthKey(referenceDate);
  const endKey = allDataKeys.length > 0 && allDataKeys[allDataKeys.length - 1] > currentKey
    ? allDataKeys[allDataKeys.length - 1]
    : currentKey;

  let startKey: string;
  if (range === '6m') {
    startKey = shiftMonthKey(endKey, -5);
  } else if (range === '12m') {
    startKey = shiftMonthKey(endKey, -11);
  } else {
    startKey = allDataKeys[0] ? (allDataKeys[0] < shiftMonthKey(endKey, -5) ? allDataKeys[0] : shiftMonthKey(endKey, -5)) : shiftMonthKey(endKey, -5);
  }

  const points: TimelineBarPoint[] = [];
  let cursor = startKey;
  let guard = 0;
  while (cursor <= endKey && guard < 120) {
    const bucket = bucketMap[cursor];
    const { monthIndex } = parseMonthKey(cursor);
    points.push({
      monthKey: cursor,
      axisLabel: SHORT_MONTHS[monthIndex],
      mediumLabel: formatMonthLabel(cursor, 'medium'),
      totalAmount: bucket?.totalAmount || 0,
      receiptCount: bucket?.receiptCount || 0,
      hasData: Boolean(bucket)
    });
    cursor = shiftMonthKey(cursor, 1);
    guard += 1;
  }

  const activePoints = points.filter((p) => p.totalAmount > 0);
  const averageActive =
    activePoints.length > 0
      ? formatBRLCompact(activePoints.reduce((sum, p) => sum + p.totalAmount, 0) / activePoints.length)
      : 0;
  const maxAmount = Math.max(1, ...points.map((p) => p.totalAmount));

  return { points, averageActive, maxAmount };
}

/**
 * Computes complete side-by-side deltas between Month A and Month B.
 */
export function compareTwoMonths(
  bucketMap: Record<string, MonthlyBucket>,
  monthAKey: string,
  monthBKey: string
): MonthlyComparison {
  const bucketA = bucketMap[monthAKey] || createEmptyBucket(monthAKey);
  const bucketB = bucketMap[monthBKey] || createEmptyBucket(monthBKey);

  const totalDiff = formatBRLCompact(bucketA.totalAmount - bucketB.totalAmount);
  const totalDiffPercent = safeDiffPercent(bucketA.totalAmount, bucketB.totalAmount);
  const countDiff = bucketA.receiptCount - bucketB.receiptCount;
  const ticketDiff = formatBRLCompact(bucketA.averageTicket - bucketB.averageTicket);
  const ticketDiffPercent = safeDiffPercent(bucketA.averageTicket, bucketB.averageTicket);
  const itemsDiff = bucketA.itemCount - bucketB.itemCount;

  const categoryNames = new Set([
    ...Object.keys(bucketA.byCategory),
    ...Object.keys(bucketB.byCategory)
  ]);

  const categories: CategoryComparisonRow[] = Array.from(categoryNames)
    .map((category) => {
      const amountA = formatBRLCompact(bucketA.byCategory[category] || 0);
      const amountB = formatBRLCompact(bucketB.byCategory[category] || 0);
      return {
        category,
        amountA,
        amountB,
        diff: formatBRLCompact(amountA - amountB),
        diffPercent: safeDiffPercent(amountA, amountB)
      };
    })
    .sort((a, b) => Math.max(b.amountA, b.amountB) - Math.max(a.amountA, a.amountB));

  const storeNames = new Set([
    ...Object.keys(bucketA.byStore),
    ...Object.keys(bucketB.byStore)
  ]);

  const stores: StoreComparisonRow[] = Array.from(storeNames)
    .map((storeName) => {
      const sA = bucketA.byStore[storeName];
      const sB = bucketB.byStore[storeName];
      const amountA = formatBRLCompact(sA?.totalAmount || 0);
      const amountB = formatBRLCompact(sB?.totalAmount || 0);
      return {
        storeName,
        amountA,
        amountB,
        countA: sA?.receiptCount || 0,
        countB: sB?.receiptCount || 0,
        diff: formatBRLCompact(amountA - amountB),
        diffPercent: safeDiffPercent(amountA, amountB)
      };
    })
    .sort((a, b) => Math.max(b.amountA, b.amountB) - Math.max(a.amountA, a.amountB));

  const productKeys = new Set([
    ...Object.keys(bucketA.byProduct),
    ...Object.keys(bucketB.byProduct)
  ]);

  const products: ProductComparisonRow[] = Array.from(productKeys)
    .map((key) => {
      const pA = bucketA.byProduct[key];
      const pB = bucketB.byProduct[key];
      const amountA = formatBRLCompact(pA?.totalAmount || 0);
      const amountB = formatBRLCompact(pB?.totalAmount || 0);
      return {
        key,
        displayName: pA?.displayName || pB?.displayName || key,
        amountA,
        amountB,
        qtyA: formatBRLCompact(pA?.totalQuantity || 0),
        qtyB: formatBRLCompact(pB?.totalQuantity || 0),
        diff: formatBRLCompact(amountA - amountB),
        diffPercent: safeDiffPercent(amountA, amountB)
      };
    })
    .sort((a, b) => b.amountA - a.amountA || Math.abs(b.diff) - Math.abs(a.diff));

  return {
    bucketA,
    bucketB,
    totalDiff,
    totalDiffPercent,
    countDiff,
    ticketDiff,
    ticketDiffPercent,
    itemsDiff,
    categories,
    stores,
    products
  };
}
