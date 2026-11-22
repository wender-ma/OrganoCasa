import { Receipt } from '../types';

export interface StoreLocationInfo {
  storeName?: string;
  storeCnpj: string;
  storeAddress?: string;
  storeNeighborhood?: string;
  storeCity?: string;
  storeState?: string;
}

const cnpjCache = new Map<string, StoreLocationInfo | null>();

export function extractCnpjDigits(input?: string): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length === 44) {
    return digits.substring(6, 20);
  }
  if (digits.length === 14) {
    return digits;
  }
  return null;
}

export function formatCnpjDigits(digits: string): string {
  const d = digits.replace(/\D/g, '');
  if (d.length !== 14) return digits;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

function titleCaseBrazilian(text?: string): string | undefined {
  if (!text) return undefined;
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return trimmed
    .toLowerCase()
    .replace(/\b([a-zà-ú])/g, (m) => m.toUpperCase());
}

/**
 * Fetches official store name & full street address from Brazilian CNPJ public APIs.
 */
export async function fetchStoreLocationByCnpj(
  cnpjOrAccessKey?: string,
  timeoutMs = 2800
): Promise<StoreLocationInfo | null> {
  const digits = extractCnpjDigits(cnpjOrAccessKey);
  if (!digits) return null;

  if (cnpjCache.has(digits)) {
    return cnpjCache.get(digits) || null;
  }

  const endpoints = [
    `https://brasilapi.com.br/api/cnpj/v1/${digits}`,
    `https://minhareceita.org/${digits}`
  ];

  for (const url of endpoints) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller?.signal
      });
      if (!res.ok) continue;

      const data = await res.json();
      const rawName = String(data.nome_fantasia || data.razao_social || '').trim();
      const logradouro = [
        data.descricao_tipo_de_logradouro,
        data.logradouro
      ]
        .filter(Boolean)
        .join(' ')
        .trim();
      const numero = data.numero && String(data.numero).trim() !== 'S/N' ? String(data.numero).trim() : '';
      const fullStreet = [titleCaseBrazilian(logradouro), numero].filter(Boolean).join(', ');
      const neighborhood = titleCaseBrazilian(data.bairro);
      const city = titleCaseBrazilian(data.municipio);
      const state = data.uf ? String(data.uf).trim().toUpperCase() : undefined;

      const info: StoreLocationInfo = {
        storeName: rawName || undefined,
        storeCnpj: formatCnpjDigits(digits),
        storeAddress: fullStreet || undefined,
        storeNeighborhood: neighborhood,
        storeCity: city,
        storeState: state
      };

      cnpjCache.set(digits, info);
      return info;
    } catch {
      // Try fallback endpoint
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  cnpjCache.set(digits, null);
  return null;
}

/**
 * Enriches a receipt's store location fields when city/address is missing and an accessKey or CNPJ is present.
 */
export async function enrichReceiptStoreLocation(
  receipt: Pick<
    Receipt,
    | 'storeName'
    | 'accessKey'
    | 'storeCnpj'
    | 'storeAddress'
    | 'storeNeighborhood'
    | 'storeCity'
    | 'storeState'
  >
): Promise<Partial<Receipt>> {
  if (receipt.storeCity && receipt.storeAddress && receipt.storeCnpj) {
    return {};
  }

  const cnpjSource = receipt.storeCnpj || receipt.accessKey;
  if (!cnpjSource) return {};

  const resolved = await fetchStoreLocationByCnpj(cnpjSource);
  if (!resolved) return {};

  const updates: Partial<Receipt> = {};
  if (
    resolved.storeName &&
    (!receipt.storeName || receipt.storeName.startsWith('Supermercado') || receipt.storeName === 'Cupom Fiscal')
  ) {
    updates.storeName = resolved.storeName;
  }
  if (!receipt.storeCnpj && resolved.storeCnpj) updates.storeCnpj = resolved.storeCnpj;
  if (!receipt.storeAddress && resolved.storeAddress) updates.storeAddress = resolved.storeAddress;
  if (!receipt.storeNeighborhood && resolved.storeNeighborhood) {
    updates.storeNeighborhood = resolved.storeNeighborhood;
  }
  if (!receipt.storeCity && resolved.storeCity) updates.storeCity = resolved.storeCity;
  if (!receipt.storeState && resolved.storeState) updates.storeState = resolved.storeState;

  return updates;
}
