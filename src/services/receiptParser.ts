import { ProductCategory, ReceiptItem } from '../types';
import { classifyScannedCode, parseNfceQrParams, inspectAccessKey } from './nfceClassifier';
import { fetchProductByBarcode } from './openFoodFacts';
import { db } from '../db/dexie';
import { guessCategoryFromName } from '../utils/categoryMatcher';

export { guessCategoryFromName };

export interface ParsedReceiptData {
  storeName: string;
  accessKey?: string;
  totalAmount: number;
  purchaseDate: string;
  rawType: 'qr_code' | 'xml' | 'ocr_image' | 'manual';
  excludeFromStats?: boolean;
  items: ReceiptItem[];
  sefazPortalUrl?: string;
  note?: string;
  requiresManualItems?: boolean;
}

/**
 * Parses official SEFAZ XML (NF-e / NFC-e)
 */
export function parseSEFAZXml(xmlString: string): ParsedReceiptData {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

  // Check for parse error
  const parserError = xmlDoc.getElementsByTagName('parsererror');
  if (parserError.length > 0) {
    throw new Error('Formato XML inválido');
  }

  // 1. Store Name
  let storeName = 'Supermercado';
  const emitNome = xmlDoc.querySelector('emit > xNome') || xmlDoc.querySelector('emit > xFant');
  if (emitNome && emitNome.textContent) {
    storeName = emitNome.textContent.trim();
  }

  // 2. Access key (chNFe)
  let accessKey: string | undefined;
  const infNFe = xmlDoc.querySelector('infNFe');
  if (infNFe) {
    const idAttr = infNFe.getAttribute('Id');
    if (idAttr) {
      accessKey = idAttr.replace(/\D/g, '');
    }
  }

  // 3. Purchase Date
  let purchaseDate = new Date().toISOString();
  const dhEmi = xmlDoc.querySelector('ide > dhEmi') || xmlDoc.querySelector('ide > dEmi');
  if (dhEmi && dhEmi.textContent) {
    try {
      purchaseDate = new Date(dhEmi.textContent.trim()).toISOString();
    } catch {
      purchaseDate = new Date().toISOString();
    }
  }

  // 4. Total Amount
  let totalAmount = 0;
  const vNF = xmlDoc.querySelector('total > ICMSTot > vNF') || xmlDoc.querySelector('vNF');
  if (vNF && vNF.textContent) {
    totalAmount = parseFloat(vNF.textContent.trim()) || 0;
  }

  // 5. Products / Items
  const items: ReceiptItem[] = [];
  const detElements = xmlDoc.querySelectorAll('det');

  detElements.forEach((det, index) => {
    const prod = det.querySelector('prod');
    if (!prod) return;

    const xProd = prod.querySelector('xProd')?.textContent?.trim() || `Item ${index + 1}`;
    const cEAN = prod.querySelector('cEAN')?.textContent?.trim();
    const qCom = parseFloat(prod.querySelector('qCom')?.textContent?.trim() || '1') || 1;
    const vUnCom = parseFloat(prod.querySelector('vUnCom')?.textContent?.trim() || '0') || 0;
    const vProd = parseFloat(prod.querySelector('vProd')?.textContent?.trim() || '0') || (qCom * vUnCom);
    const uCom = prod.querySelector('uCom')?.textContent?.trim()?.toLowerCase() || 'un';

    items.push({
      id: `item-${index + 1}-${Date.now()}`,
      name: xProd,
      barcode: cEAN && cEAN !== 'SEM GTIN' && cEAN !== 'SEM_GTIN' ? cEAN : undefined,
      quantity: qCom,
      unitPrice: vUnCom,
      totalPrice: vProd,
      unit: uCom
    });
  });

  if (totalAmount === 0 && items.length > 0) {
    totalAmount = items.reduce((sum, it) => sum + it.totalPrice, 0);
  }

  return {
    storeName,
    accessKey,
    totalAmount: Number(totalAmount.toFixed(2)),
    purchaseDate,
    rawType: 'xml',
    items
  };
}

const SEFAZ_STATES: Record<string, string> = {
  '52': 'Goiás (GO)',
  '53': 'Distrito Federal (DF)',
  '35': 'São Paulo (SP)',
  '31': 'Minas Gerais (MG)',
  '33': 'Rio de Janeiro (RJ)',
  '41': 'Paraná (PR)',
  '43': 'Rio Grande do Sul (RS)',
  '42': 'Santa Catarina (SC)',
  '29': 'Bahia (BA)',
  '51': 'Mato Grosso (MT)',
  '50': 'Mato Grosso do Sul (MS)',
  '23': 'Ceará (CE)',
  '26': 'Pernambuco (PE)',
  '32': 'Espírito Santo (ES)',
  '15': 'Pará (PA)',
  '21': 'Maranhão (MA)',
  '25': 'Paraíba (PB)',
  '24': 'Rio Grande do Norte (RN)',
  '27': 'Alagoas (AL)',
  '28': 'Sergipe (SE)',
  '22': 'Piauí (PI)',
  '13': 'Amazonas (AM)',
  '11': 'Rondônia (RO)',
  '12': 'Acre (AC)',
  '14': 'Roraima (RR)',
  '16': 'Amapá (AP)',
  '17': 'Tocantins (TO)'
};

function formatCNPJ(cnpjRaw: string): string {
  if (cnpjRaw.length !== 14) return cnpjRaw;
  return `${cnpjRaw.substring(0, 2)}.${cnpjRaw.substring(2, 5)}.${cnpjRaw.substring(5, 8)}/${cnpjRaw.substring(8, 12)}-${cnpjRaw.substring(12, 14)}`;
}

/**
 * Parses NFC-e QR Code URLs or Access Key (Supports SEFAZ GO, SP, MG, RJ, and all Brazilian states)
 * Known SEFAZ GO URLs:
 *  - https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe?chNFe=...&nVersao=...&tpAmb=...&cHashQRCode=...
 *  - https://www.sefaz.go.gov.br/nfce/consulta
 */
export async function parseQRCodeUrl(qrCodeText: string): Promise<ParsedReceiptData> {
  const trimmed = qrCodeText.trim();
  const classified = classifyScannedCode(trimmed);

  // 1. Se for código de barras de produto puro (EAN-13, EAN-8)
  if (classified.type === 'barcode_ean') {
    const barcode = classified.barcode || trimmed;
    let productName = `PRODUTO (EAN: ${barcode})`;
    let unit = 'un';
    let unitPrice = 0;
    let brand: string | undefined;
    let category: ProductCategory | undefined;
    let imageUrl: string | undefined;

    // 1a. Consulta catálogo local primeiro
    try {
      const localProd = await db.products.where('barcode').equals(barcode).first();
      if (localProd) {
        productName = localProd.name;
        unit = localProd.unit || 'un';
        unitPrice = localProd.lastPrice || localProd.averagePrice || 0;
        brand = localProd.brand;
        category = localProd.category;
        imageUrl = localProd.imageUrl;
      }
    } catch {
      // Ignora erro caso IndexedDB não esteja disponível
    }

    // 1b. Se não encontrou nome no catálogo local, consulta OpenFoodFacts
    if (productName.startsWith('PRODUTO (EAN:')) {
      try {
        const offProd = await fetchProductByBarcode(barcode);
        if (offProd && offProd.product_name) {
          brand = offProd.brands ? offProd.brands.split(',')[0].trim() : undefined;
          productName = brand ? `${offProd.product_name} (${brand})` : offProd.product_name;
          unit = offProd.unit || unit;
          category = offProd.category;
          imageUrl = offProd.image_url;
        }
      } catch {
        // Fallback silencioso para o código EAN bruto
      }
    }

    return {
      storeName: 'Produto com Código de Barras',
      totalAmount: unitPrice,
      purchaseDate: new Date().toISOString(),
      rawType: 'qr_code',
      items: [
        {
          id: `ean-item-${Date.now()}`,
          name: productName,
          barcode,
          brand,
          category,
          imageUrl,
          quantity: 1,
          unitPrice,
          totalPrice: unitPrice,
          unit
        }
      ]
    };
  }

  // 2. Se for texto puro sem formato fiscal nem URL
  if (classified.type === 'text') {
    throw new Error(`Texto lido: "${trimmed}". Este QR Code não é uma Nota Fiscal NFC-e.`);
  }

  // 3. Se for NFC-e, usa os metadados extraídos
  const meta = classified.metadata;
  const accessKey = meta.accessKey;

  // Validate raw 44-digit access key (Modulo 11, UF, month)
  if (!meta.rawUrl && accessKey) {
    const inspection = inspectAccessKey(accessKey);
    if (!inspection.isValid) {
      throw new Error(inspection.errorReason || 'Chave de acesso de 44 dígitos inválida.');
    }
  }

  const totalAmount = meta.totalAmount || 0;
  let storeName = meta.stateName ? `Supermercado (SEFAZ - ${meta.stateName})` : 'Supermercado (NFC-e)';
  const purchaseDate = meta.emissionDate || new Date().toISOString();

  // 4. Consultar a API serverless da SEFAZ (com fallback direto para o Agente Oracle São Paulo)
  const urlToFetch = meta.rawUrl || (trimmed.startsWith('http') ? trimmed : (trimmed.includes('.') ? `https://${trimmed}` : undefined));
  const hasValidTarget = Boolean(urlToFetch || (accessKey && accessKey.length === 44));

  if (hasValidTarget) {
    const payload = {
      url: urlToFetch,
      accessKey
    };
    const endpoints = ['/api/fetch-sefaz', 'https://hub.wma.ia.br/organocasa-api/fetch-sefaz'];

    for (const endpoint of endpoints) {
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutId = controller ? setTimeout(() => controller.abort(), 15000) : null;

        const sefazRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-OrganoCasa-Client': 'organocasa-pwa-v1'
          },
          body: JSON.stringify(payload),
          signal: controller?.signal
        }).finally(() => {
          if (timeoutId) clearTimeout(timeoutId);
        });

        if (sefazRes.ok) {
          const sefazJson = await sefazRes.json();

          if (sefazJson.success && Array.isArray(sefazJson.items) && sefazJson.items.length > 0) {
            return {
              storeName: sefazJson.storeName || storeName,
              accessKey: sefazJson.accessKey || accessKey,
              totalAmount: sefazJson.totalAmount > 0 ? sefazJson.totalAmount : totalAmount,
              purchaseDate: sefazJson.purchaseDate || purchaseDate,
              rawType: 'qr_code',
              items: sefazJson.items.map((it: any, idx: number) => ({
                id: `sefaz-item-${idx + 1}-${Date.now()}`,
                name: it.name,
                quantity: Number(it.quantity) || 1,
                unitPrice: Number(it.unitPrice) || 0,
                totalPrice:
                  Number(it.totalPrice) ||
                  Number((Number(it.quantity || 1) * Number(it.unitPrice || 0)).toFixed(2)),
                unit: it.unit || 'un'
              }))
            };
          } else if (sefazJson.success && sefazJson.storeName && sefazJson.storeName !== 'Supermercado') {
            return {
              storeName: sefazJson.storeName,
              accessKey: sefazJson.accessKey || accessKey,
              totalAmount: sefazJson.totalAmount > 0 ? sefazJson.totalAmount : totalAmount,
              purchaseDate: sefazJson.purchaseDate || purchaseDate,
              rawType: 'qr_code',
              sefazPortalUrl:
                sefazJson.sefazPortalUrl ||
                (accessKey?.startsWith('52')
                  ? 'https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfe/consulta-completa'
                  : 'https://www.fazenda.sp.gov.br/nfce/consulta'),
              note:
                sefazJson.note ||
                'O portal da SEFAZ está indisponível no momento. Tire uma foto do cupom abaixo para extrair todos os produtos com IA!',
              requiresManualItems: true,
              items: []
            };
          }
        }
      } catch (apiErr) {
        console.warn(`[QR:SEFAZ] Exceção ao consultar ${endpoint}:`, apiErr);
      }
    }
  }

  // 5. Fallback local sem fabricar itens fantasmas caso a SEFAZ esteja fora do ar (503)
  if (meta.cnpj) {
    storeName = `Supermercado (${meta.stateName || 'NFC-e'} - ${meta.cnpj})`;
  }

  const defaultPortalUrl = accessKey?.startsWith('52')
    ? 'https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfe/consulta-completa'
    : 'https://www.fazenda.sp.gov.br/nfce/consulta';

  return {
    storeName,
    accessKey,
    totalAmount: totalAmount > 0 ? Number(totalAmount.toFixed(2)) : 0,
    purchaseDate,
    rawType: 'qr_code',
    sefazPortalUrl: meta.rawUrl || defaultPortalUrl,
    note: meta.rawUrl
      ? 'O portal da SEFAZ não respondeu aos itens desta nota no momento. Tire uma foto rápida do cupom abaixo para extrair todos os produtos com IA!'
      : 'Nota identificada pela chave de 44 dígitos. Tire uma foto do cupom abaixo (IA) ou cole a tabela da SEFAZ.',
    requiresManualItems: true,
    items: []
  };
}

/**
 * OCR Receipt image parser using client-side Tesseract.js
 */
export async function parseReceiptImage(
  imageFileOrUrl: File | Blob | string,
  onProgress?: (progress: number, status: string) => void
): Promise<ParsedReceiptData> {
  let worker: any = null;
  try {
    onProgress?.(10, 'Carregando motor OCR...');
    const { createWorker } = await import('tesseract.js');
    worker = await createWorker('por');

    onProgress?.(30, 'Processando imagem do cupom...');
    const ret = await worker.recognize(imageFileOrUrl);
    const text = ret.data.text;

    onProgress?.(80, 'Extraindo produtos e valores...');
    const parsed = parseReceiptTextHeuristics(text);
    onProgress?.(100, 'Concluído!');

    return parsed;
  } catch (error) {
    console.error('Erro no OCR Tesseract:', error);
    return {
      storeName: 'Cupom Fiscal',
      totalAmount: 0,
      purchaseDate: new Date().toISOString(),
      rawType: 'ocr_image',
      items: []
    };
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
}

function parseBrNumber(raw: string | undefined | null): number {
  if (!raw) return 0;
  const cleaned = String(raw).replace(/[^\d,\.]/g, '').trim();
  if (!cleaned) return 0;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (cleaned.includes(',')) {
    return parseFloat(cleaned.replace(',', '.')) || 0;
  }
  return parseFloat(cleaned) || 0;
}

/**
 * Robust multi-line heuristics parser for Brazilian thermal receipt OCR text & SEFAZ HTML copy-paste
 */
export function parseReceiptTextHeuristics(rawText: string): ParsedReceiptData {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let storeName = 'Supermercado';
  let totalAmount = 0;
  let accessKey: string | undefined;
  const items: ReceiptItem[] = [];

  // 1. Look for 44-digit access key in text (contiguous OR 11 blocks of 4 digits)
  const keyMatch =
    rawText.match(/\b((?:\d{4}[\s\.\-]+){10}\d{4})\b/) ||
    rawText.match(/\b(\d{44})\b/);
  if (keyMatch) {
    accessKey = keyMatch[1].replace(/\D/g, '');
  }

  // 2. Look for store name in top lines
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const l = lines[i];
    if (
      l.match(
        /supermercado|mercado|hiper|atacad|comercio|comércio|loja|distribuidora|pao de acucar|pão de açúcar|carrefour|extra|assai|assaí|atacadao|atacadão|pro brasil/i
      )
    ) {
      storeName = l.replace(/[^\p{L}\p{N}\s\.\-&]/gu, '').trim() || storeName;
      break;
    }
  }

  // 2b. Multi-line SEFAZ copy-paste pass (handles browser copy where each item spans 1-5 lines, with or without "(Código: ...)")
  const multiLineSefazRegex =
    /(?:^|[\n\r])\s*([^\n\r\t]*?[A-ZÀ-ÖØ-öø-ÿ]{2}[^\n\r\t]*?)(?:\s*\(\s*C[óo]digo\s*:\s*[^)]+\))?\s+Qtde\.?\s*:\s*([0-9\.,]+)[\s\S]{0,80}?UN\s*:\s*([a-zA-Z]+)[\s\S]{0,120}?Vl\.\s*Unit\.?\s*:\s*(?:&nbsp;)?\s*([0-9\.,]+)(?:[\s\S]{0,80}?(?:Vl\.\s*Total|Valor\s*Total)\s*:?\s*([0-9\.,]+))?/gi;

  let mlMatch: RegExpExecArray | null;
  let mlIndex = 0;
  while ((mlMatch = multiLineSefazRegex.exec(rawText)) !== null) {
    const name = mlMatch[1]
      .replace(/\s*\(\s*C[óo]digo\s*:[^)]+\)\s*$/i, '')
      .replace(/^\d+\s+/, '')
      .trim()
      .toUpperCase();
    const qty = parseBrNumber(mlMatch[2]) || 1;
    const unit = (mlMatch[3] || 'un').toLowerCase();
    const unitPrice = parseBrNumber(mlMatch[4]) || 0;
    const totalPrice = mlMatch[5]
      ? parseBrNumber(mlMatch[5])
      : Number((qty * unitPrice).toFixed(2));

    if (name.length >= 2 && (totalPrice > 0 || unitPrice > 0)) {
      items.push({
        id: `sefaz-ml-${mlIndex++}-${Date.now()}`,
        name,
        quantity: qty,
        unitPrice:
          unitPrice > 0 ? unitPrice : totalPrice > 0 ? Number((totalPrice / qty).toFixed(2)) : 0,
        totalPrice: totalPrice > 0 ? totalPrice : Number((qty * unitPrice).toFixed(2)),
        unit
      });
    }
  }

  // Extract total amount from rawText if multi-line SEFAZ items were found
  const globalTotalMatch = rawText.match(
    /(?:Valor a pagar(?:\s*R\$)?|VALOR TOTAL(?:\s*R\$)?)\s*:?\s*(?:R\$\s*)?([\d\.]+,\d{2}|\d+\.\d{2})/i
  );
  if (globalTotalMatch) {
    totalAmount = parseBrNumber(globalTotalMatch[1]);
  }

  if (items.length > 0) {
    if (totalAmount === 0) {
      totalAmount = Number(items.reduce((sum, item) => sum + item.totalPrice, 0).toFixed(2));
    }
    return {
      storeName,
      accessKey,
      totalAmount: Number(totalAmount.toFixed(2)),
      purchaseDate: new Date().toISOString(),
      rawType: 'ocr_image',
      items
    };
  }

  // 3. Line-by-line parsing with two-line support
  const ignoredWordsRegex =
    /^(TOTAL|SUBTOTAL|TROCO|DINHEIRO|CARTAO|CARTÃO|CREDITO|CRÉDITO|DEBITO|DÉBITO|VALOR A PAGAR|FORMA PAGAMENTO|PAGAMENTO|DESCONTO|CNPJ|IE|IMPOSTO|TRIBUTOS|OPERADOR|EXTRATO|CUPOM|NFC-E|DANFE)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Total extraction
    if (
      line.match(/TOTAL\s*(?:R\$)?\s*([\d\.]+,\d{2}|\d+\.\d{2})/i) ||
      line.match(/VALOR A PAGAR\s*(?:R\$)?\s*([\d\.]+,\d{2}|\d+\.\d{2})/i)
    ) {
      const match = line.match(/(?:TOTAL|VALOR A PAGAR)\s*(?:R\$)?\s*([\d\.]+,\d{2}|\d+\.\d{2})/i);
      if (match) {
        totalAmount = parseBrNumber(match[1]);
      }
      continue;
    }

    if (ignoredWordsRegex.test(line)) {
      continue;
    }

    // Pattern S: Single-line SEFAZ NFC-e Danfe format (with or without "(Código: ...)")
    const sefazPattern =
      /^(.+?)(?:\s*\([Cc][óo]digo:[^)]*\))?\s+Qtde\.?\s*:\s*([0-9\.,]+)\s+UN\s*:\s*([a-zA-Z]+)\s+Vl\.\s*Unit\.?\s*:\s*(?:&nbsp;)?\s*([0-9\.,]+)(?:\s+Vl\.\s*Total\s*:?\s*([0-9\.,]+))?/i;
    const matchSefaz = line.match(sefazPattern);
    if (matchSefaz) {
      const name = matchSefaz[1].replace(/^\d+\s+/, '').trim().toUpperCase();
      const qty = parseBrNumber(matchSefaz[2]) || 1;
      const unit = (matchSefaz[3] || 'un').toLowerCase();
      const unitPrice = parseBrNumber(matchSefaz[4]) || 0;
      const totalPrice = matchSefaz[5]
        ? parseBrNumber(matchSefaz[5])
        : Number((qty * unitPrice).toFixed(2));

      if (name.length >= 2 && (totalPrice > 0 || unitPrice > 0)) {
        items.push({
          id: `sefaz-${i}-${Date.now()}`,
          name,
          quantity: qty,
          unitPrice:
            unitPrice > 0 ? unitPrice : totalPrice > 0 ? Number((totalPrice / qty).toFixed(2)) : 0,
          totalPrice: totalPrice > 0 ? totalPrice : Number((qty * unitPrice).toFixed(2)),
          unit
        });
        continue;
      }
    }

    // Pattern Tab: Table row copied from browser with tabs (\t)
    if (line.includes('\t')) {
      const parts = line
        .split('\t')
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length >= 4) {
        let name = parts[0];
        let rest = parts.slice(1);
        if (/^\d+$/.test(name) && rest.length >= 4) {
          name = rest[0];
          rest = rest.slice(1);
        }
        const numCandidates = rest
          .map((c) => ({
            raw: c,
            num: parseFloat(c.replace(/[^\d,\.]/g, '').replace(',', '.'))
          }))
          .filter((c) => !isNaN(c.num));

        if (numCandidates.length >= 2 && name.length >= 2 && !ignoredWordsRegex.test(name)) {
          const qty =
            numCandidates[0].num > 0 && numCandidates[0].num < 1000 ? numCandidates[0].num : 1;
          const unitCandidate = rest.find((r) => /^[a-zA-Z]{1,4}$/.test(r)) || 'un';
          const lastNum = numCandidates[numCandidates.length - 1].num;
          const secondLastNum =
            numCandidates.length >= 3 ? numCandidates[numCandidates.length - 2].num : 0;

          const totalPrice = lastNum > 0 ? lastNum : 0;
          const unitPrice =
            secondLastNum > 0
              ? secondLastNum
              : totalPrice > 0 && qty > 0
              ? Number((totalPrice / qty).toFixed(2))
              : 0;

          items.push({
            id: `tab-${i}-${Date.now()}`,
            name: name.replace(/^\d+\s+/, '').trim().toUpperCase(),
            quantity: qty,
            unitPrice,
            totalPrice: totalPrice || Number((qty * unitPrice).toFixed(2)),
            unit: unitCandidate.toLowerCase()
          });
          continue;
        }
      }
    }

    // Pattern A: Single line with quantity, unit and price (supports accented Portuguese names up to 65 chars)
    const singleLineFullRegex =
      /(?:(\d+)\s+)?([A-ZÀ-ÖØ-öø-ÿ0-9\s\.\-\/\%\(\)\,\&]{3,65}?)\s+(\d+(?:[\.,]\d+)?)\s*(UN|KG|G|L|ML|PCT|CX|LT|DZ)?\s*[xX\*]?\s*(\d+[\.,]\d{2})\s+(\d+[\.,]\d{2})/i;
    const matchA = line.match(singleLineFullRegex);
    if (matchA) {
      const name = matchA[2].replace(/^\d+\s+/, '').trim();
      const qty = parseFloat(matchA[3].replace(',', '.')) || 1;
      const unit = (matchA[4] || 'un').toLowerCase();
      const unitPrice = parseFloat(matchA[5].replace(',', '.')) || 0;
      const totalPrice = parseFloat(matchA[6].replace(',', '.')) || qty * unitPrice;

      if (name.length >= 2 && totalPrice > 0) {
        items.push({
          id: `ocr-${i}-${Date.now()}`,
          name: name.toUpperCase(),
          quantity: qty,
          unitPrice,
          totalPrice,
          unit
        });
        continue;
      }
    }

    // Pattern B: Two-line pattern
    // Line i: Product Name (e.g. "001 FEIJÃO CARIOCA 1KG")
    // Line i+1: Quantity and Price (e.g. "1 UN X 8,50 8,50" or "0,450 KG X 12,00 5,40")
    if (i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const nextLineQtyPriceRegex =
        /^(\d+(?:[\.,]\d+)?)\s*(UN|KG|G|L|ML|PCT|CX|LT|DZ)?\s*[xX\*]?\s*(\d+[\.,]\d{2})(?:\s+(?:=\s*)?(\d+[\.,]\d{2}))?/i;
      const matchB = nextLine.match(nextLineQtyPriceRegex);

      if (matchB && line.length >= 3 && !ignoredWordsRegex.test(line)) {
        const cleanName = line.replace(/^\d{1,14}\s+/, '').trim();
        const qty = parseFloat(matchB[1].replace(',', '.')) || 1;
        const unit = (matchB[2] || 'un').toLowerCase();
        const unitPrice = parseFloat(matchB[3].replace(',', '.')) || 0;
        const totalPrice = matchB[4]
          ? parseFloat(matchB[4].replace(',', '.'))
          : Number((qty * unitPrice).toFixed(2));

        if (cleanName.length >= 2 && (totalPrice > 0 || unitPrice > 0)) {
          items.push({
            id: `ocr-${i}-${Date.now()}`,
            name: cleanName.toUpperCase(),
            quantity: qty,
            unitPrice,
            totalPrice: totalPrice || unitPrice,
            unit
          });
          i++; // Skip the nextLine as it was consumed
          continue;
        }
      }
    }

    // Pattern C: Simple line ending with currency price (supports accented Portuguese names up to 65 chars)
    const simpleLineRegex =
      /^([A-ZÀ-ÖØ-öø-ÿ0-9\s\.\-\/\%\(\)\,\&]{3,65}?)\s+(?:R\$\s*)?(\d+[\.,]\d{2})$/i;
    const matchC = line.match(simpleLineRegex);
    if (matchC && !ignoredWordsRegex.test(line)) {
      const name = matchC[1].replace(/^\d{1,14}\s+/, '').trim();
      const price = parseFloat(matchC[2].replace(',', '.'));
      if (name.length >= 3 && price > 0 && price < 9999) {
        items.push({
          id: `ocr-${i}-${Date.now()}`,
          name: name.toUpperCase(),
          quantity: 1,
          unitPrice: price,
          totalPrice: price,
          unit: 'un'
        });
      }
    }
  }

  // Recalculate total if needed
  if (totalAmount === 0 && items.length > 0) {
    totalAmount = Number(items.reduce((sum, item) => sum + item.totalPrice, 0).toFixed(2));
  }

  return {
    storeName,
    accessKey,
    totalAmount: Number(totalAmount.toFixed(2)),
    purchaseDate: new Date().toISOString(),
    rawType: 'ocr_image',
    items
  };
}

