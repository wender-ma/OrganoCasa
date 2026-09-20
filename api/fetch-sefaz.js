function createTimeoutSignal(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    try {
      return AbortSignal.timeout(ms);
    } catch {}
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

/**
 * Robust HTML parser for SEFAZ Danfe NFC-e portals (Goiás, SP, RS, etc.)
 */
function parseSefazHtml(html, fallbackKey) {
  let storeName = 'Supermercado';
  let totalAmount = 0;
  let purchaseDate = new Date().toISOString();
  let accessKey = fallbackKey || '';
  const items = [];

  // 1. Extract Store Name
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

  // 3. Extract Emission Date
  const dateMatch =
    html.match(/Emiss[aã]o:\s*<\/strong>\s*(\d{2}\/\d{2}\/\d{4}\s*\d{2}:\d{2}:\d{2})/i) ||
    html.match(/Data de Emiss[aã]o:\s*<strong[^>]*>([^<]+)<\/strong>/i) ||
    html.match(/(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/);

  if (dateMatch && dateMatch[1]) {
    const rawDateStr = dateMatch[1].trim();
    const dParts = rawDateStr.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?/);
    if (dParts) {
      const day = parseInt(dParts[1], 10);
      const month = parseInt(dParts[2], 10) - 1;
      const year = parseInt(dParts[3], 10);
      const hour = dParts[4] ? parseInt(dParts[4], 10) : 12;
      const min = dParts[5] ? parseInt(dParts[5], 10) : 0;
      const sec = dParts[6] ? parseInt(dParts[6], 10) : 0;
      purchaseDate = new Date(year, month, day, hour, min, sec).toISOString();
    }
  }

  // 4. Extract Total Amount
  const totalMatch =
    html.match(/Valor a pagar R\$:<\/label><span class=["']totalNumb txtMax["']>([^<]+)<\/span>/i) ||
    html.match(/class=["'](?:totalNFe|txtMax|vNF|total-nota)["'][^>]*>([^<]+)</i) ||
    html.match(/Valor a pagar[^<]*<span[^>]*class=["']totalNFe[^"']*["'][^>]*>([^<]+)</i) ||
    html.match(/VALOR TOTAL(?:\s*R\$)?\s*[:]?\s*<[^>]*>([^<]+)</i) ||
    html.match(/class=["']valor["'][^>]*>\s*(?:R\$\s*)?(\d+[\.,]\d{2})\s*</i);

  if (totalMatch && totalMatch[1]) {
    const cleanTotal = totalMatch[1].replace(/[^\d,\.]/g, '').replace(',', '.');
    totalAmount = parseFloat(cleanTotal) || 0;
  }

  // 5. Extract Products table (Standard Brazilian Danfe NFC-e / SEFAZ table structure)
  const rowRegex = /<tr[^>]*id=["']Item\s*[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];

    const nameM =
      rowHtml.match(/class=["']txtTit[^"']*["'][^>]*>([^<]+)</i) ||
      rowHtml.match(/<span[^>]*class=["']xProd[^"']*["'][^>]*>([^<]+)</i);

    const qtyM =
      rowHtml.match(/class=["']Rqu?an?t?d?[^"']*["'][^>]*>(?:[\s\S]*?<\/strong>)?\s*([0-9\.,]+)/i) ||
      rowHtml.match(/Qtde\.:(?:\s*<\/strong>)?\s*([0-9\.,]+)/i) ||
      rowHtml.match(/class=["']Rqu?an?t?d?[^"']*["'][^>]*>([^<]+)</i);

    const unitM =
      rowHtml.match(/class=["']RUN[^"']*["'][^>]*>(?:[\s\S]*?<\/strong>)?\s*([a-zA-Z]+)/i) ||
      rowHtml.match(/UN:\s*(?:\s*<\/strong>)?\s*([a-zA-Z]+)/i) ||
      rowHtml.match(/class=["']RUN[^"']*["'][^>]*>([^<]+)</i);

    const unitPriceM =
      rowHtml.match(/class=["']RvlUnit[^"']*["'][^>]*>(?:[\s\S]*?<\/strong>)?(?:\s*&nbsp;)?\s*([0-9\.,]+)/i) ||
      rowHtml.match(/Vl\.\s*Unit\.:(?:\s*<\/strong>)?(?:\s*&nbsp;)?\s*([0-9\.,]+)/i) ||
      rowHtml.match(/class=["']RvlUnit[^"']*["'][^>]*>([^<]+)</i);

    const totalM =
      rowHtml.match(/class=["']valor[^"']*["'][^>]*>([^<]+)</i) ||
      rowHtml.match(/class=["']vProd[^"']*["'][^>]*>([^<]+)</i);

    if (nameM && nameM[1]) {
      const name = nameM[1].trim().toUpperCase().replace(/&amp;/g, '&');
      const qtyStr = (qtyM ? qtyM[1] : '1').replace(/[^\d,\.]/g, '').replace(',', '.');
      const unitStr = (unitM ? unitM[1] : 'un').replace(/[^a-zA-Z]/g, '').toLowerCase() || 'un';
      const unitPriceStr = (unitPriceM ? unitPriceM[1] : '0').replace(/[^\d,\.]/g, '').replace(',', '.');
      const totalStr = (totalM ? totalM[1] : '0').replace(/[^\d,\.]/g, '').replace(',', '.');

      const quantity = parseFloat(qtyStr) || 1;
      let unitPrice = parseFloat(unitPriceStr) || 0;
      const itemTotal = parseFloat(totalStr) || Number((quantity * unitPrice).toFixed(2));

      if (unitPrice === 0 && quantity > 0 && itemTotal > 0) {
        unitPrice = Number((itemTotal / quantity).toFixed(2));
      }

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
    let genMatch;
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

async function handler(req, res) {
  // Enable CORS
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
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {}
    }
    body = body || {};

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
        if (accessKey.startsWith('52')) {
          targetUrl = `https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe?chNFe=${accessKey}&nVersao=100&tpAmb=1`;
        } else {
          targetUrl = `https://www.fazenda.sp.gov.br/nfce/consulta?p=${accessKey}`;
        }
      }
    }

    if (!targetUrl && !accessKey) {
      res.status(400).json({
        success: false,
        error: 'URL ou chave de acesso de 44 dígitos não fornecida.'
      });
      return;
    }

    const isGoias =
      targetUrl.includes('sefaz.go.gov.br') ||
      targetUrl.includes('go.gov.br') ||
      accessKey.startsWith('52');

    const headers = {
      'User-Agent': 'curl/8.5.0',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    };

    let finalHtml = '';

    if (isGoias && accessKey) {
      // SEFAZ Goiás 2-step session flow:
      // Step 1: Initial request sets session cookies (JSESSIONID, TS01..., CookieGenericoGoias)
      const initialUrl = targetUrl || `https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe?chNFe=${accessKey}`;
      const res1 = await fetch(initialUrl, {
        headers,
        signal: createTimeoutSignal(10000)
      });

      let cookieHeader = '';
      if (typeof res1.headers.getSetCookie === 'function') {
        cookieHeader = res1.headers
          .getSetCookie()
          .map((c) => c.split(';')[0])
          .join('; ');
      } else if (res1.headers.raw && typeof res1.headers.raw === 'function') {
        const raw = res1.headers.raw()['set-cookie'] || [];
        cookieHeader = raw.map((c) => c.split(';')[0]).join('; ');
      } else {
        const rawCookie = res1.headers.get('set-cookie');
        if (rawCookie) {
          cookieHeader = rawCookie
            .split(',')
            .map((c) => c.split(';')[0].trim())
            .join('; ');
        }
      }

      // Step 2: Fetch rendered Danfe HTML payload with session cookies
      const renderUrl = `https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfce/render/html/danfeNFCe?chNFe=${accessKey}`;
      const res2 = await fetch(renderUrl, {
        headers: {
          ...headers,
          Cookie: cookieHeader,
          Referer: initialUrl
        },
        signal: createTimeoutSignal(10000)
      });

      if (res2.ok) {
        const xml = await res2.text();
        // Unescape XML entities
        finalHtml = xml
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&apos;/g, "'")
          .replace(/&amp;/g, '&')
          .replace(/&atilde;/gi, 'ã')
          .replace(/&eacute;/gi, 'é')
          .replace(/&oacute;/gi, 'ó')
          .replace(/&uacute;/gi, 'ú')
          .replace(/&iacute;/gi, 'í')
          .replace(/&ccedil;/gi, 'ç');
      }
    }

    // Fallback or Non-GO SEFAZ direct fetch
    if (!finalHtml && targetUrl) {
      const response = await fetch(targetUrl, {
        headers,
        signal: createTimeoutSignal(12000)
      });

      if (response.ok) {
        finalHtml = await response.text();
      }
    }

    if (!finalHtml) {
      res.status(502).json({
        success: false,
        error: 'Não foi possível carregar os dados da SEFAZ.'
      });
      return;
    }

    // Parse extracted HTML
    const parsedData = parseSefazHtml(finalHtml, accessKey);
    res.status(200).json(parsedData);
  } catch (error) {
    console.error('Erro na consulta SEFAZ:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Falha ao consultar servidor da SEFAZ.'
    });
  }
}

module.exports = handler;
module.exports.default = handler;
module.exports.parseSefazHtml = parseSefazHtml;
