import { db } from '../db/dexie';
import { CommunityPriceRecord, ProductCategory, Receipt } from '../types';
import { guessCategoryFromName } from '../utils/categoryMatcher';
import { enrichReceiptStoreLocation } from './cnpjEnricher';
import { getSupabaseClient } from './supabase';
import { pushSingleReceipt } from './supabaseSync';

export interface CommunityPriceWithMap extends CommunityPriceRecord {
  googleMapsUrl: string;
}

export interface CommunityPriceStats {
  sampleCount: number;
  medianPrice: number;
  minPrice: number;
  maxPrice: number;
  bestOffer: CommunityPriceWithMap | null;
}

export interface CommunityQueryFilters {
  query?: string;
  barcode?: string;
  state?: string;
  city?: string;
  neighborhood?: string;
  limit?: number;
}

export interface CommunityQueryResult {
  records: CommunityPriceWithMap[];
  stats: CommunityPriceStats;
  availableStates: string[];
  availableCities: string[];
  availableNeighborhoods: string[];
  missingTable: boolean;
}

export function normalizeCommunityKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stableHash32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Builds an official Google Maps search link pinpointing the exact supermarket branch.
 */
export function buildGoogleMapsStoreUrl(loc: {
  storeName?: string;
  storeAddress?: string;
  storeNeighborhood?: string;
  storeCity?: string;
  storeState?: string;
}): string {
  const parts = [
    loc.storeName?.trim(),
    loc.storeAddress?.trim(),
    loc.storeNeighborhood?.trim(),
    loc.storeCity?.trim(),
    loc.storeState?.trim()
  ].filter(Boolean);

  if (parts.length === 0) {
    return 'https://www.google.com/maps';
  }

  const query = `${parts.join(', ')}, Brasil`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function isMissingCommunityTableError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    msg.includes('community_prices') && (msg.includes('does not exist') || msg.includes('schema cache'))
  );
}

function mapRemoteCommunityRow(row: any): CommunityPriceWithMap {
  const mapped: CommunityPriceRecord = {
    id: row.id,
    sourceReceiptKey: row.source_receipt_key || undefined,
    barcode: row.barcode || undefined,
    normalizedKey: row.normalized_key,
    productName: row.product_name,
    brand: row.brand || undefined,
    category: (row.category || 'Outros') as ProductCategory,
    unit: row.unit || 'un',
    unitPrice: Number(row.unit_price || 0),
    storeName: row.store_name || 'Supermercado',
    storeCnpj: row.store_cnpj || undefined,
    storeAddress: row.store_address || undefined,
    storeNeighborhood: row.store_neighborhood || undefined,
    storeCity: row.store_city || undefined,
    storeState: row.store_state || undefined,
    observedAt: row.observed_at || row.created_at,
    createdAt: row.created_at || row.observed_at
  };

  return {
    ...mapped,
    googleMapsUrl: buildGoogleMapsStoreUrl(mapped)
  };
}

/**
 * Computes median, min, max and best recent offer from community observations.
 */
export function computeCommunityStats(records: CommunityPriceWithMap[]): CommunityPriceStats {
  if (records.length === 0) {
    return {
      sampleCount: 0,
      medianPrice: 0,
      minPrice: 0,
      maxPrice: 0,
      bestOffer: null
    };
  }

  const sortedByPrice = [...records].sort((a, b) => a.unitPrice - b.unitPrice);
  const prices = sortedByPrice.map((r) => r.unitPrice);
  const mid = Math.floor(prices.length / 2);
  const median =
    prices.length % 2 === 0 ? (prices[mid - 1] + prices[mid]) / 2 : prices[mid];

  return {
    sampleCount: records.length,
    medianPrice: Number(median.toFixed(2)),
    minPrice: Number(prices[0].toFixed(2)),
    maxPrice: Number(prices[prices.length - 1].toFixed(2)),
    bestOffer: sortedByPrice[0]
  };
}

/**
 * Automatically and unconditionally publishes valid priced receipt items to the
 * shared anonymous `community_prices` pool (no household/user identifiers).
 */
export async function publishReceiptToCommunity(
  receipt: Receipt,
  explicitItems?: Array<{
    name: string;
    barcode?: string;
    brand?: string;
    category?: ProductCategory;
    unit?: string;
    unitPrice?: number;
  }>
): Promise<{ uploaded: number; missingTable?: boolean }> {
  const client = getSupabaseClient();
  if (!client || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { uploaded: 0 };
  }

  const itemsSource = explicitItems && explicitItems.length > 0 ? explicitItems : receipt.items;
  if (!itemsSource || itemsSource.length === 0) {
    return { uploaded: 0 };
  }

  let enrichedReceipt = receipt;
  if (!receipt.storeCity || !receipt.storeAddress) {
    const locPatch = await enrichReceiptStoreLocation(receipt).catch(() => ({}));
    if (Object.keys(locPatch).length > 0) {
      enrichedReceipt = { ...receipt, ...locPatch };
    }
  }

  const receiptSeed = enrichedReceipt.accessKey || enrichedReceipt.id;
  const nowIso = new Date().toISOString();
  const observedAt = enrichedReceipt.purchaseDate || nowIso;

  const rows: Record<string, any>[] = [];

  itemsSource.forEach((item, idx) => {
    const unitPrice = Number(item.unitPrice) || 0;
    if (unitPrice <= 0.05 || unitPrice >= 20000) return;

    const normalizedKey = normalizeCommunityKey(item.name || '');
    if (normalizedKey.length < 2) return;

    const dedupeSeed = `${receiptSeed}|${item.barcode || normalizedKey}|${idx}`;
    const deterministicId = `cp-${stableHash32(dedupeSeed)}-${idx}`;

    rows.push({
      id: deterministicId,
      source_receipt_key: `src-${stableHash32(receiptSeed)}`,
      barcode: item.barcode || null,
      normalized_key: normalizedKey,
      product_name: item.name.trim(),
      brand: item.brand || null,
      category: item.category || guessCategoryFromName(item.name),
      unit: (item.unit || 'un').toLowerCase(),
      unit_price: Number(unitPrice.toFixed(2)),
      store_name: enrichedReceipt.storeName || 'Supermercado',
      store_cnpj: enrichedReceipt.storeCnpj || null,
      store_address: enrichedReceipt.storeAddress || null,
      store_neighborhood: enrichedReceipt.storeNeighborhood || null,
      store_city: enrichedReceipt.storeCity || null,
      store_state: enrichedReceipt.storeState || null,
      observed_at: observedAt,
      created_at: nowIso
    });
  });

  if (rows.length === 0) {
    return { uploaded: 0 };
  }

  try {
    const { error } = await client.from('community_prices').upsert(rows, { onConflict: 'id' });
    if (error) {
      if (isMissingCommunityTableError(error)) {
        return { uploaded: 0, missingTable: true };
      }
      console.warn('[Community] Falha ao enviar preços comunitários:', error.message);
      return { uploaded: 0 };
    }
    return { uploaded: rows.length };
  } catch (err) {
    console.warn('[Community] Erro ao enviar preços comunitários:', err);
    return { uploaded: 0 };
  }
}

/**
 * Enriches existing local receipts (via CNPJ/accessKey) and backfills their prices
 * to the community pool idempotently.
 */
export async function syncExistingReceiptsToCommunity(
  receipts: Receipt[]
): Promise<{ enrichedCount: number; uploadedCount: number; missingTable?: boolean }> {
  let enrichedCount = 0;
  let uploadedCount = 0;
  let missingTable = false;

  for (const rc of receipts) {
    let current = rc;
    if ((!current.storeCity || !current.storeAddress) && (current.accessKey || current.storeCnpj)) {
      const patch = await enrichReceiptStoreLocation(current).catch(() => ({}));
      if (Object.keys(patch).length > 0) {
        current = { ...current, ...patch };
        await db.receipts.put(current);
        pushSingleReceipt(current).catch(console.warn);
        enrichedCount += 1;
      }
    }

    const res = await publishReceiptToCommunity(current);
    if (res.missingTable) missingTable = true;
    uploadedCount += res.uploaded;
  }

  return { enrichedCount, uploadedCount, missingTable };
}

/**
 * Queries shared community prices filtered by product, barcode, state, city, and neighborhood.
 */
export async function queryCommunityPrices(
  filters: CommunityQueryFilters = {}
): Promise<CommunityQueryResult> {
  const emptyResult: CommunityQueryResult = {
    records: [],
    stats: computeCommunityStats([]),
    availableStates: [],
    availableCities: [],
    availableNeighborhoods: [],
    missingTable: false
  };

  const client = getSupabaseClient();
  if (!client || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return emptyResult;
  }

  try {
    const { data, error } = await client
      .from('community_prices')
      .select('*')
      .order('observed_at', { ascending: false })
      .limit(filters.limit || 500);

    if (error) {
      if (isMissingCommunityTableError(error)) {
        return { ...emptyResult, missingTable: true };
      }
      console.warn('[Community] Falha ao consultar preços comunitários:', error.message);
      return emptyResult;
    }

    const allMapped = (data || []).map(mapRemoteCommunityRow);

    const stateSet = new Set<string>();
    const citySet = new Set<string>();
    const neighborhoodSet = new Set<string>();

    for (const r of allMapped) {
      if (r.storeState) stateSet.add(r.storeState);
      if ((!filters.state || r.storeState === filters.state) && r.storeCity) {
        citySet.add(r.storeCity);
      }
      if (
        (!filters.state || r.storeState === filters.state) &&
        (!filters.city || r.storeCity === filters.city) &&
        r.storeNeighborhood
      ) {
        neighborhoodSet.add(r.storeNeighborhood);
      }
    }

    const cleanBarcode = filters.barcode?.replace(/\D/g, '') || '';
    const normTokens = filters.query
      ? normalizeCommunityKey(filters.query)
          .split(' ')
          .filter((t) => t.length >= 2)
      : [];

    const filtered = allMapped.filter((r) => {
      if (filters.state && r.storeState !== filters.state) return false;
      if (filters.city && r.storeCity !== filters.city) return false;
      if (filters.neighborhood && r.storeNeighborhood !== filters.neighborhood) return false;

      if (cleanBarcode && r.barcode && r.barcode === cleanBarcode) {
        return true;
      }

      if (normTokens.length > 0) {
        const hay = `${r.normalizedKey} ${normalizeCommunityKey(r.storeName)} ${normalizeCommunityKey(r.brand || '')}`;
        return normTokens.every((tok) => hay.includes(tok));
      }

      if (cleanBarcode && !r.barcode) return false;
      return true;
    });

    return {
      records: filtered,
      stats: computeCommunityStats(filtered),
      availableStates: Array.from(stateSet).sort(),
      availableCities: Array.from(citySet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      availableNeighborhoods: Array.from(neighborhoodSet).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      missingTable: false
    };
  } catch (err) {
    console.warn('[Community] Erro ao consultar comunidade:', err);
    return emptyResult;
  }
}
