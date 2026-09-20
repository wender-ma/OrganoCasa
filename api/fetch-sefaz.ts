import type { IncomingMessage, ServerResponse } from 'http';

interface SefazParsedItem {
  name: string;
  code?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
}

interface SefazParsedReceipt {
  success: boolean;
  storeName: string;
  accessKey?: string;
  totalAmount: number;
  purchaseDate: string;
  items: SefazParsedItem[];
  error?: string;
}

export default async function handler(req: any, res: any) {
  // Enable CORS for frontend
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const body = req.body || {};
    const rawUrl = body.url || req.query?.url;
    const accessKeyInput = body.accessKey || req.query?.accessKey;

    let targetUrl = '';
    let accessKey = '';

    if (rawUrl && typeof rawUrl === 'string') {
      targetUrl = rawUrl.trim();
      const match = targetUrl.match(/\b(\d{44})\b/);
      if (match) {
        accessKey = match[1];
      }
    } else if (accessKeyInput && typeof accessKeyInput === 'string') {
      const cleanKey = accessKeyInput.replace(/\D/g, '');
      if (cleanKey.length === 44) {
        accessKey = cleanKey;
        // Default to SEFAZ Goiás if UF is 52
        if (accessKey.startsWith('52')) {
          targetUrl = `https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe?chNFe=${accessKey}&nVersao=100&tpAmb=1`;
        } else {
          targetUrl = `https://www.fazenda.sp.gov.br/nfce/consulta?p=${accessKey}`;
        }
      }
    }

    if (!targetUrl) {
      res.status(400).json({
        success: false,
        error: 'URL ou chave de acesso de 44 dígitos não fornecida.'
      });
      return;
    }

    // Fetch SEFAZ HTML
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
      },
      signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) {
      res.status(502).json({
        success: false,
        error: `Servidor da SEFAZ retornou status ${response.status}.`
      });
      return;
    }

    const html = await response.text();

    // Parse SEFAZ HTML page
    const parsedData = parseSefazHtml(html, accessKey);

    res.status(200).json(parsedData);
  } catch (error: any) {
    console.error('Erro na consulta SEFAZ:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Falha ao consultar servidor da SEFAZ.'
    });
  }
}

/**
 * Robust HTML parser for SEFAZ Danfe NFC-e portals (Goiás, SP, RS, etc.)
 */
function parseSefazHtml(html: string, fallbackKey?: string): SefazParsedReceipt {
  let storeName = 'Supermercado';
  let totalAmount = 0;
  let purchaseDate = new Date().toISOString();
  let accessKey = fallbackKey || '';
  const items: SefazParsedItem[] = [];

  // 1. Extract Store Name
  // Common SEFAZ classes: .txtTopo, #u20, #content .titulo, .area-identificacao, etc.
  const storeMatch =
    html.match(/class=["'](?:txtTopo|text-center|xNome|bold-titulo|titulo)["'][^>]*>([^<]+)</i) ||
    html.match(/<div id=["']u20["'][^>]*>([^<]+)</i) ||
    html.match(/Raz[aã]o Social:\s*<strong[^>]*>([^<]+)<\/strong>/i);

  if (storeMatch && storeMatch[1]) {
    storeName = storeMatch[1].trim().replace(/&amp;/g, '&');
  }

  // 2. Extract Access Key if not present
  if (!accessKey) {
    const keyMatch = html.match(/\b(\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4})\b/);
    if (keyMatch) {
      accessKey = keyMatch[1].replace(/\s+/g, '');
    }
  }

  // 3. Extract Total Amount
  // Common total patterns: .totalNFe, .txtMax, Valor a pagar, Total R$
  const totalMatch =
    html.match(/class=["'](?:totalNFe|txtMax|vNF|total-nota)["'][^>]*>([^<]+)</i) ||
    html.match(/Valor a pagar[^<]*<span[^>]*class=["']totalNFe[^"']*["'][^>]*>([^<]+)</i) ||
    html.match(/VALOR TOTAL(?:\s*R\$)?\s*[:]?\s*<[^>]*>([^<]+)</i) ||
    html.match(/class=["']valor["'][^>]*>\s*(?:R\$\s*)?(\d+[\.,]\d{2})\s*</i);

  if (totalMatch && totalMatch[1]) {
    const cleanTotal = totalMatch[1].replace(/[^\d,\.]/g, '').replace(',', '.');
    totalAmount = parseFloat(cleanTotal) || 0;
  }

  // 4. Extract Products table (Standard Brazilian Danfe NFC-e table structure)
  // SEFAZ standard table #tabResult or .tabela-itens:
  // Each product row has .txtTit (name), .RCod (code), .Rquant (qty), .RUN (unit), .RvlUnit (price), .valor (total)
  const rowRegex = /<tr[^>]*id=["']Item\s*[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];

    // Name
    const nameM =
      rowHtml.match(/class=["']txtTit[^"']*["'][^>]*>([^<]+)</i) ||
      rowHtml.match(/<span[^>]*class=["']xProd[^"']*["'][^>]*>([^<]+)</i);

    // Quantity
    const qtyM =
      rowHtml.match(/class=["']Rquant[^"']*["'][^>]*>[\s\S]*?<strong>([^<]+)<\/strong>/i) ||
      rowHtml.match(/Qtde\.:\s*<strong[^>]*>([^<]+)<\/strong>/i) ||
      rowHtml.match(/class=["']Rquant[^"']*["'][^>]*>([^<]+)</i);

    // Unit
    const unitM =
      rowHtml.match(/class=["']RUN[^"']*["'][^>]*>[\s\S]*?<strong>([^<]+)<\/strong>/i) ||
      rowHtml.match(/UN:\s*<strong[^>]*>([^<]+)<\/strong>/i) ||
      rowHtml.match(/class=["']RUN[^"']*["'][^>]*>([^<]+)</i);

    // Unit Price
    const unitPriceM =
      rowHtml.match(/class=["']RvlUnit[^"']*["'][^>]*>[\s\S]*?<strong>([^<]+)<\/strong>/i) ||
      rowHtml.match(/Vl\.\s*Unit\.:\s*<strong[^>]*>([^<]+)<\/strong>/i) ||
      rowHtml.match(/class=["']RvlUnit[^"']*["'][^>]*>([^<]+)</i);

    // Total Price
    const totalM =
      rowHtml.match(/class=["']valor[^"']*["'][^>]*>([^<]+)</i) ||
      rowHtml.match(/class=["']vProd[^"']*["'][^>]*>([^<]+)</i);

    if (nameM && nameM[1]) {
      const name = nameM[1].trim().toUpperCase().replace(/&amp;/g, '&');
      const qtyStr = (qtyM ? qtyM[1] : '1').replace(/[^\d,\.]/g, '').replace(',', '.');
      const unitStr = (unitM ? unitM[1] : 'un').trim().toLowerCase();
      const unitPriceStr = (unitPriceM ? unitPriceM[1] : '0').replace(/[^\d,\.]/g, '').replace(',', '.');
      const totalStr = (totalM ? totalM[1] : '0').replace(/[^\d,\.]/g, '').replace(',', '.');

      const quantity = parseFloat(qtyStr) || 1;
      const unitPrice = parseFloat(unitPriceStr) || 0;
      const itemTotal = parseFloat(totalStr) || Number((quantity * unitPrice).toFixed(2));

      items.push({
        name,
        quantity,
        unit: unitStr || 'un',
        unitPrice,
        totalPrice: itemTotal
      });
    }
  }

  // Fallback: Generic table rows if #tabResult structure was different
  if (items.length === 0) {
    const genericItemRegex = /<td[^>]*class=["'](?:txtTit|desc-produto|nome-item)["'][^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/gi;
    let genMatch: RegExpExecArray | null;
    while ((genMatch = genericItemRegex.exec(html)) !== null) {
      const pName = genMatch[1].replace(/<[^>]+>/g, '').trim().toUpperCase();
      const pVal = parseFloat(genMatch[2].replace(/[^\d,\.]/g, '').replace(',', '.')) || 0;
      if (pName.length > 2 && pVal > 0) {
        items.push({
          name: pName,
          quantity: 1,
          unit: 'un',
          unitPrice: pVal,
          totalPrice: pVal
        });
      }
    }
  }

  // Recalculate total if needed
  if (totalAmount === 0 && items.length > 0) {
    totalAmount = Number(items.reduce((sum, it) => sum + it.totalPrice, 0).toFixed(2));
  }

  return {
    success: items.length > 0 || totalAmount > 0,
    storeName,
    accessKey,
    totalAmount,
    purchaseDate,
    items
  };
}
