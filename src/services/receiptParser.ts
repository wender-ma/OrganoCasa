import { ProductCategory, ReceiptItem } from '../types';
import { createWorker } from 'tesseract.js';
import { classifyScannedCode, parseNfceQrParams } from './nfceClassifier';

export interface ParsedReceiptData {
  storeName: string;
  accessKey?: string;
  totalAmount: number;
  purchaseDate: string;
  rawType: 'qr_code' | 'xml' | 'ocr_image' | 'manual';
  items: ReceiptItem[];
}

/**
 * Intelligent categorization of raw receipt product descriptions
 */
export function guessCategoryFromName(name: string): ProductCategory {
  const n = name.toLowerCase();

  if (n.match(/banana|maca|mamao|laranja|limao|uva|alface|tomate|batata|cebola|cenoura|alho|abacate|manga|melancia|ovos|ovo branco|ovo verm/)) {
    return 'Hortifrúti';
  }
  if (n.match(/carne|alcatra|patinho|acem|contra file|costela|picanha|bacon|linguica|frango|coxa|sobrecoxa|peito frango|bife|peixe|tilapia|suino/)) {
    return 'Carnes e Aves';
  }
  if (n.match(/leite|queijo|mussarela|prato|parmesao|requeijao|iogurte|manteiga|margarina|presunto|mortadela|creme leite|condensado/)) {
    return 'Laticínios e Frios';
  }
  if (n.match(/pao|biscoito|bolacha|torrada|bolo|panetone|doce|chocolate|bombom|bala|sobremesa|gelatina/)) {
    return 'Padaria e Sobremesas';
  }
  if (n.match(/refrigerante|coca|guarana|suco|cerveja|heineken|amstel|agua|tonica|vinho|whisky|vodka|energetico|cha|cafe/)) {
    return 'Bebidas';
  }
  if (n.match(/congelado|hamburguer|nuggets|lasanha|pizza|sorvete|acai|polpa/)) {
    return 'Congelados';
  }
  if (n.match(/detergente|sabao|amaciante|desinfetante|esponja|ypê|ype|limpador|vejax|agua sanitaria|cloro|papel toalha|lustra moveis/)) {
    return 'Limpeza';
  }
  if (n.match(/shampoo|condicionador|sabonete|creme dental|colgate|desodorante|rexona|papel hig|higiene|absorvente|fio dental|fralda/)) {
    return 'Higiene e Beleza';
  }
  if (n.match(/racao|whiskas|pedigree|pet|gato|cao|cachorro|petisco/)) {
    return 'Pet Shop';
  }

  return 'Mercearia';
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
    return {
      storeName: 'Produto com Código de Barras',
      totalAmount: 0,
      purchaseDate: new Date().toISOString(),
      rawType: 'qr_code',
      items: [
        {
          id: `ean-item-${Date.now()}`,
          name: `PRODUTO (EAN: ${classified.barcode})`,
          barcode: classified.barcode,
          quantity: 1,
          unitPrice: 0,
          totalPrice: 0,
          unit: 'un'
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
  const totalAmount = meta.totalAmount || 0;
  let storeName = meta.stateName ? `Supermercado (SEFAZ - ${meta.stateName})` : 'Supermercado (NFC-e)';
  const purchaseDate = meta.emissionDate || new Date().toISOString();

  // 4. Se online, consultar a API serverless da SEFAZ
  if (typeof window !== 'undefined' && navigator.onLine && (trimmed.startsWith('http') || (accessKey && accessKey.length === 44))) {
    const payload = {
      url: meta.rawUrl || (trimmed.startsWith('http') ? trimmed : undefined),
      accessKey
    };
    console.log('[QR:SEFAZ] Consultando API serverless /api/fetch-sefaz com:', payload);

    try {
      const sefazRes = await fetch('/api/fetch-sefaz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      console.log('[QR:SEFAZ] Resposta HTTP /api/fetch-sefaz:', sefazRes.status, sefazRes.statusText);

      if (sefazRes.ok) {
        const sefazJson = await sefazRes.json();
        console.log('[QR:SEFAZ] Payload retornado pela SEFAZ:', {
          success: sefazJson.success,
          storeName: sefazJson.storeName,
          itemCount: sefazJson.items?.length,
          items: sefazJson.items
        });

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
              totalPrice: Number(it.totalPrice) || Number((Number(it.quantity || 1) * Number(it.unitPrice || 0)).toFixed(2)),
              unit: it.unit || 'un'
            }))
          };
        } else {
          console.warn('[QR:SEFAZ] SEFAZ respondeu, mas sem itens parseados:', sefazJson);
        }
      } else {
        const errText = await sefazRes.text().catch(() => '');
        console.warn('[QR:SEFAZ] Erro na resposta da API /api/fetch-sefaz:', sefazRes.status, errText);
      }
    } catch (apiErr) {
      console.warn('[QR:SEFAZ] Exceção ao consultar API serverless SEFAZ:', apiErr);
    }
  }

  // 5. Fallback local com os dados estruturados do QR Code
  if (meta.cnpj) {
    storeName = `Supermercado (${meta.stateName || 'NFC-e'} - ${meta.cnpj})`;
  }

  const items: ReceiptItem[] = [
    {
      id: `qr-item-1-${Date.now()}`,
      name: `COMPRA ${storeName.toUpperCase()}`,
      quantity: 1,
      unitPrice: totalAmount > 0 ? totalAmount : 48.90,
      totalPrice: totalAmount > 0 ? totalAmount : 48.90,
      unit: 'un'
    }
  ];

  return {
    storeName,
    accessKey,
    totalAmount: totalAmount > 0 ? Number(totalAmount.toFixed(2)) : 48.90,
    purchaseDate,
    rawType: 'qr_code',
    items
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
    // Return friendly error with fallback object instead of crashing completely
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

/**
 * Robust multi-line heuristics parser for Brazilian thermal receipt OCR text
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

  // 1. Look for 44-digit access key in text
  const keyMatch = rawText.match(/\b(\d{44})\b/);
  if (keyMatch) {
    accessKey = keyMatch[1];
  }

  // 2. Look for store name in top lines
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const l = lines[i];
    if (l.match(/supermercado|mercado|hiper|atacad|comercio|loja|distribuidora|pao de acucar|carrefour|extra|assai|atacadao/i)) {
      storeName = l.replace(/[^\w\s\.\-]/gi, '').trim();
      break;
    }
  }

  // 3. Line-by-line parsing with two-line support
  const ignoredWordsRegex = /^(TOTAL|SUBTOTAL|TROCO|DINHEIRO|CARTAO|CREDITO|DEBITO|VALOR A PAGAR|FORMA PAGAMENTO|PAGAMENTO|DESCONTO|CNPJ|IE|IMPOSTO|TRIBUTOS|OPERADOR|EXTRATO|CUPOM|NFC-E|DANFE)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Total extraction
    if (line.match(/TOTAL\s*(?:R\$)?\s*(\d+[\.,]\d{2})/i) || line.match(/VALOR A PAGAR\s*(?:R\$)?\s*(\d+[\.,]\d{2})/i)) {
      const match = line.match(/(?:TOTAL|VALOR A PAGAR)\s*(?:R\$)?\s*(\d+[\.,]\d{2})/i);
      if (match) {
        totalAmount = parseFloat(match[1].replace(',', '.'));
      }
      continue;
    }

    if (ignoredWordsRegex.test(line)) {
      continue;
    }

    // Pattern A: Single line with quantity, unit and price
    // e.g. "001 ARROZ TIO JOAO 5KG 1 UN X 29,90 29,90"
    const singleLineFullRegex = /(?:(\d+)\s+)?([A-Z0-9\s\.\-\/\%]{3,35})\s+(\d+(?:[\.,]\d+)?)\s*(UN|KG|G|L|PCT|CX|LT)?\s*[xX]?\s*(\d+[\.,]\d{2})\s+(\d+[\.,]\d{2})/i;
    const matchA = line.match(singleLineFullRegex);
    if (matchA) {
      const name = matchA[2].replace(/^\d+\s+/, '').trim();
      const qty = parseFloat(matchA[3].replace(',', '.')) || 1;
      const unit = (matchA[4] || 'un').toLowerCase();
      const unitPrice = parseFloat(matchA[5].replace(',', '.')) || 0;
      const totalPrice = parseFloat(matchA[6].replace(',', '.')) || (qty * unitPrice);

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
    // Line i: Product Name (e.g. "001 ARROZ TIO JOAO 5KG")
    // Line i+1: Quantity and Price (e.g. "1 UN X 29,90 29,90" or "0,450 KG X 12,00 5,40")
    if (i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const nextLineQtyPriceRegex = /^(\d+(?:[\.,]\d+)?)\s*(UN|KG|G|L|PCT|CX|LT)?\s*[xX]?\s*(\d+[\.,]\d{2})(?:\s+(\d+[\.,]\d{2}))?/i;
      const matchB = nextLine.match(nextLineQtyPriceRegex);

      if (matchB && line.length >= 3 && !ignoredWordsRegex.test(line)) {
        const cleanName = line.replace(/^\d{1,6}\s+/, '').trim();
        const qty = parseFloat(matchB[1].replace(',', '.')) || 1;
        const unit = (matchB[2] || 'un').toLowerCase();
        const unitPrice = parseFloat(matchB[3].replace(',', '.')) || 0;
        const totalPrice = matchB[4] ? parseFloat(matchB[4].replace(',', '.')) : Number((qty * unitPrice).toFixed(2));

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

    // Pattern C: Simple line ending with currency price
    // e.g. "ARROZ TIO JOAO 5KG 29,90"
    const simpleLineRegex = /^([A-Z0-9\s\.\-\/\%]{3,35})\s+(?:R\$\s*)?(\d+[\.,]\d{2})$/i;
    const matchC = line.match(simpleLineRegex);
    if (matchC && !ignoredWordsRegex.test(line)) {
      const name = matchC[1].replace(/^\d{1,6}\s+/, '').trim();
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

