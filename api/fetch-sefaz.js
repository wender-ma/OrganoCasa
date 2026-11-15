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

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache'
};

/**
 * Detects WAF block pages (F5 BigIP ASM), SEFAZ 503 maintenance pages, or CAPTCHA walls
 */
function isBlockedOrErrorHtml(html) {
  if (!html || typeof html !== 'string' || html.trim().length < 50) return true;
  const hasProductMarkers =
    /id=["']Item\s*/i.test(html) ||
    /class=["']txtTit/i.test(html) ||
    /class=["']xProd/i.test(html) ||
    /id=["']tabResult["']/i.test(html);
  if (hasProductMarkers) return false;

  if (
    /Acesso Negado/i.test(html) ||
    /bloqueada por nossa pol[ií]tica de seguran[cç]a/i.test(html) ||
    /<title>\s*Algo deu errado!\s*<\/title>/i.test(html) ||
    /Servi[cç]o Temporariamente Indispon[ií]vel/i.test(html) ||
    /The requested URL was rejected/i.test(html)
  ) {
    return true;
  }
  return false;
}

/**
 * Unescapes XML/HTML entities returned by SEFAZ render endpoints
 */
function unescapeHtmlEntities(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&atilde;/gi, 'ã')
    .replace(/&otilde;/gi, 'õ')
    .replace(/&aacute;/gi, 'á')
    .replace(/&eacute;/gi, 'é')
    .replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó')
    .replace(/&uacute;/gi, 'ú')
    .replace(/&acirc;/gi, 'â')
    .replace(/&ecirc;/gi, 'ê')
    .replace(/&ocirc;/gi, 'ô')
    .replace(/&ccedil;/gi, 'ç');
}

/**
 * Robust HTML parser for SEFAZ Danfe NFC-e portals (Goiás, SP, RS, MG, etc.)
 */
function parseSefazHtml(html, fallbackKey) {
  let storeName = 'Supermercado';
  let totalAmount = 0;
  let purchaseDate = new Date().toISOString();
  let accessKey = fallbackKey || '';
  const items = [];

  if (!html || isBlockedOrErrorHtml(html)) {
    return {
      success: false,
      storeName,
      accessKey,
      totalAmount: 0,
      purchaseDate,
      items: []
    };
  }

  // 1. Extract Store Name
  const storeMatch =
    html.match(/<div[^>]*id=["']u20["'][^>]*>([^<]+)</i) ||
    html.match(/class=["'](?:txtTopo|xNome|bold-titulo|titulo)["'][^>]*>([^<]+)</i) ||
    html.match(/Raz[aã]o Social:\s*<strong[^>]*>([^<]+)<\/strong>/i);

  if (storeMatch && storeMatch[1]) {
    const candidate = storeMatch[1].trim().replace(/&amp;/g, '&');
    if (
      candidate &&
      !/^(Acesso Negado|Algo deu errado|Secretaria|DOCUMENTO AUXILIAR|DANFE)/i.test(candidate)
    ) {
      storeName = candidate;
    }
  }

  // 2. Extract Access Key if not present
  if (!accessKey) {
    const keyMatch =
      html.match(/\b((?:\d{4}\s*){10}\d{4})\b/) || html.match(/\b(\d{44})\b/);
    if (keyMatch) {
      accessKey = keyMatch[1].replace(/\D/g, '');
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
    html.match(/Valor a pagar R\$:<\/label>\s*<span[^>]*class=["'][^"']*totalNumb[^"']*txtMax[^"']*["'][^>]*>([^<]+)<\/span>/i) ||
    html.match(/Valor a pagar[^<]*<\/label>\s*<span[^>]*class=["'][^"']*totalNumb[^"']*["'][^>]*>([^<]+)<\/span>/i) ||
    html.match(/class=["'](?:totalNFe|txtMax|vNF|total-nota)["'][^>]*>([^<]+)</i) ||
    html.match(/Valor a pagar[^<]*<span[^>]*class=["']totalNFe[^"']*["'][^>]*>([^<]+)</i) ||
    html.match(/VALOR TOTAL(?:\s*R\$)?\s*[:]?\s*<[^>]*>([^<]+)</i);

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
      rowHtml.match(/Qtde\.?\s*:(?:\s*<\/strong>)?\s*([0-9\.,]+)/i) ||
      rowHtml.match(/class=["']Rqu?an?t?d?[^"']*["'][^>]*>([^<]+)</i);

    const unitM =
      rowHtml.match(/class=["']RUN[^"']*["'][^>]*>(?:[\s\S]*?<\/strong>)?\s*([a-zA-Z]+)/i) ||
      rowHtml.match(/UN\s*:\s*(?:\s*<\/strong>)?\s*([a-zA-Z]+)/i) ||
      rowHtml.match(/class=["']RUN[^"']*["'][^>]*>([^<]+)</i);

    const unitPriceM =
      rowHtml.match(/class=["']RvlUnit[^"']*["'][^>]*>(?:[\s\S]*?<\/strong>)?(?:\s*&nbsp;)?\s*([0-9\.,]+)/i) ||
      rowHtml.match(/Vl\.\s*Unit\.?\s*:(?:\s*<\/strong>)?(?:\s*&nbsp;)?\s*([0-9\.,]+)/i) ||
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
    const genericItemRegex =
      /<td[^>]*class=["'](?:txtTit|desc-produto|nome-item)["'][^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/gi;
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
    success: items.length > 0,
    storeName,
    accessKey,
    totalAmount,
    purchaseDate,
    items
  };
}

/**
 * Anti-SSRF Validation: Only official Brazilian government portals (*.gov.br) are allowed
 */
function isAllowedSefazUrl(rawUrlString) {
  if (!rawUrlString || typeof rawUrlString !== 'string') return false;
  try {
    let normalized = rawUrlString.trim();
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized;
    }
    const parsed = new URL(normalized);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    if (parsed.username || parsed.password) {
      return false;
    }
    if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    return host.endsWith('.gov.br') && host.length > 7;
  } catch {
    return false;
  }
}

/**
 * Normalizes SEFAZ URLs to avoid cross-subdomain 302 redirects that drop session cookies
 * and extracts the 44-digit access key from query parameters or path.
 */
function normalizeSefazTarget(rawUrl, fallbackAccessKey) {
  let accessKey = (fallbackAccessKey || '').replace(/\D/g, '');
  if (accessKey.length !== 44) accessKey = '';

  if (!rawUrl || typeof rawUrl !== 'string') {
    if (accessKey.length === 44) {
      const targetUrl = accessKey.startsWith('52')
        ? `https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe?chNFe=${accessKey}&nVersao=100&tpAmb=1`
        : `https://www.fazenda.sp.gov.br/nfce/consulta?p=${accessKey}`;
      return { targetUrl, accessKey };
    }
    return { targetUrl: '', accessKey: '' };
  }

  let urlStr = rawUrl.trim();
  if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) {
    urlStr = 'https://' + urlStr;
  }

  // Encode unescaped pipes in query string so URL parser and WAFs don't reject the request
  urlStr = urlStr.replace(/\|/g, '%7C');

  try {
    const parsed = new URL(urlStr);

    // Extract 44-digit key from p=, chNFe=, chaveAcesso=, chave=
    const pParam =
      parsed.searchParams.get('p') ||
      parsed.searchParams.get('chNFe') ||
      parsed.searchParams.get('chaveAcesso') ||
      parsed.searchParams.get('chave');
    if (pParam && !accessKey) {
      const decoded = decodeURIComponent(pParam);
      const firstPart = decoded.split('|')[0].replace(/\D/g, '');
      if (firstPart.length >= 44) {
        accessKey = firstPart.substring(0, 44);
      }
    }

    if (!accessKey) {
      const match = urlStr.match(/(\d{44})/);
      if (match) accessKey = match[1];
    }

    // Rewrite www.sefaz.go.gov.br/nfce/consulta -> https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe
    if (
      parsed.hostname.toLowerCase() === 'www.sefaz.go.gov.br' ||
      (parsed.hostname.toLowerCase().endsWith('.sefaz.go.gov.br') &&
        parsed.pathname.includes('/nfce/consulta'))
    ) {
      parsed.protocol = 'https:';
      parsed.hostname = 'nfeweb.sefaz.go.gov.br';
      parsed.port = '';
      parsed.pathname = '/nfeweb/sites/nfce/danfeNFCe';
      urlStr = parsed.toString();
    }
  } catch {
    if (!accessKey) {
      const match = urlStr.match(/(\d{44})/);
      if (match) accessKey = match[1];
    }
  }

  return { targetUrl: urlStr, accessKey };
}

/**
 * Extracts Set-Cookie headers from a fetch Response into a Map(name -> value)
 */
function collectCookies(res, cookieJar) {
  if (!res || !res.headers) return;
  let rawCookies = [];
  if (typeof res.headers.getSetCookie === 'function') {
    rawCookies = res.headers.getSetCookie();
  } else if (res.headers.raw && typeof res.headers.raw === 'function') {
    rawCookies = res.headers.raw()['set-cookie'] || [];
  } else {
    const single = res.headers.get('set-cookie');
    if (single) {
      rawCookies = single.split(/,(?=\s*[A-Za-z0-9_\-]+=)/);
    }
  }
  for (const c of rawCookies) {
    const pair = c.split(';')[0].trim();
    const eqIdx = pair.indexOf('=');
    if (eqIdx > 0) {
      const k = pair.substring(0, eqIdx).trim();
      const v = pair.substring(eqIdx + 1).trim();
      cookieJar.set(k, v);
    }
  }
}

function serializeCookieJar(cookieJar) {
  const parts = [];
  for (const [k, v] of cookieJar.entries()) {
    parts.push(`${k}=${v}`);
  }
  return parts.join('; ');
}

/**
 * Performs an HTTP GET following redirects manually while preserving all cookies across hops
 * and validating every redirect target against SSRF rules.
 */
async function fetchWithCookieJar(initialUrl, cookieJar, timeoutMs = 9000) {
  let currentUrl = initialUrl;
  let lastRes = null;

  for (let hop = 0; hop < 5; hop++) {
    if (!isAllowedSefazUrl(currentUrl)) {
      throw new Error('Redirect bloqueado por política anti-SSRF.');
    }
    const cookieStr = serializeCookieJar(cookieJar);
    const headers = {
      ...BROWSER_HEADERS,
      ...(cookieStr ? { Cookie: cookieStr } : {})
    };

    const res = await fetch(currentUrl, {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: createTimeoutSignal(timeoutMs)
    });

    collectCookies(res, cookieJar);
    lastRes = res;

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) break;
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }
    break;
  }

  return { response: lastRes, finalUrl: currentUrl };
}

/**
 * Enriches storeName via BrasilAPI CNPJ lookup when only 44-digit key is available
 */
async function lookupCnpjStoreName(accessKey) {
  if (!accessKey || accessKey.length !== 44) return null;
  const cnpj = accessKey.substring(6, 20);
  const endpoints = [
    `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
    `https://minhareceita.org/${cnpj}`
  ];
  for (const url of endpoints) {
    try {
      const cnpjRes = await fetch(url, {
        headers: {
          'User-Agent': BROWSER_HEADERS['User-Agent'],
          Accept: 'application/json'
        },
        signal: createTimeoutSignal(3500)
      });
      if (cnpjRes.ok) {
        const cData = await cnpjRes.json();
        const rawName = cData.nome_fantasia || cData.razao_social;
        if (rawName) {
          return `${rawName}${cData.municipio ? ` (${cData.municipio} - ${cData.uf})` : ''}`;
        }
      }
    } catch {}
  }
  return null;
}

async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-OrganoCasa-Client'
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

    if (rawUrl && typeof rawUrl === 'string' && !isAllowedSefazUrl(rawUrl.trim())) {
      res.status(400).json({
        success: false,
        error: 'Domínio não autorizado. Apenas portais oficiais da SEFAZ (.gov.br) são permitidos.'
      });
      return;
    }

    const { targetUrl, accessKey } = normalizeSefazTarget(rawUrl, accessKeyInput);

    if (!targetUrl && !accessKey) {
      res.status(400).json({
        success: false,
        error: 'URL ou chave de acesso de 44 dígitos não fornecida.'
      });
      return;
    }

    const hasQrHash = Boolean(
      targetUrl && (targetUrl.includes('%7C') || targetUrl.includes('|') || targetUrl.includes('cHashQRCode='))
    );

    const isGoias =
      targetUrl.includes('sefaz.go.gov.br') ||
      targetUrl.includes('go.gov.br') ||
      accessKey.startsWith('52');

    let finalHtml = '';
    let sefazHttpStatus = 0;
    const cookieJar = new Map();

    // 1. Direct fetch (2-step for SEFAZ-GO when QR Code hash is present)
    if (isGoias && accessKey && hasQrHash) {
      try {
        const step1 = await fetchWithCookieJar(targetUrl, cookieJar, 9000);
        sefazHttpStatus = step1.response ? step1.response.status : 0;

        if (step1.response && step1.response.ok) {
          const step1Text = await step1.response.text();
          if (!isBlockedOrErrorHtml(step1Text) && /id=["']Item/i.test(step1Text)) {
            finalHtml = unescapeHtmlEntities(step1Text);
          }
        }

        if (!finalHtml && cookieJar.size > 0) {
          const renderUrl = `https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfce/render/html/danfeNFCe?chNFe=${accessKey}`;
          const cookieStr = serializeCookieJar(cookieJar);
          const res2 = await fetch(renderUrl, {
            headers: {
              ...BROWSER_HEADERS,
              ...(cookieStr ? { Cookie: cookieStr } : {}),
              Referer: step1.finalUrl || targetUrl
            },
            signal: createTimeoutSignal(9000)
          });
          sefazHttpStatus = res2.status || sefazHttpStatus;
          if (res2.ok) {
            const rawXml = await res2.text();
            const unescaped = unescapeHtmlEntities(rawXml);
            if (!isBlockedOrErrorHtml(unescaped)) {
              finalHtml = unescaped;
            }
          }
        }
      } catch (e) {
        console.warn('[fetch-sefaz] Erro no fluxo 2-etapas SEFAZ-GO:', e.message);
      }
    } else if (targetUrl && hasQrHash) {
      try {
        const step = await fetchWithCookieJar(targetUrl, cookieJar, 10000);
        sefazHttpStatus = step.response ? step.response.status : 0;
        if (step.response && step.response.ok) {
          const text = await step.response.text();
          if (!isBlockedOrErrorHtml(text)) {
            finalHtml = unescapeHtmlEntities(text);
          }
        }
      } catch (e) {
        console.warn('[fetch-sefaz] Erro na consulta direta:', e.message);
      }
    }

    // 2. Delegate to Oracle São Paulo Agent (Brazilian IP + Playwright/FlareSolverr) if direct fetch failed/blocked
    const isOracleAgent = process.env.IS_ORACLE_AGENT === '1';
    const oracleAgentBase =
      process.env.ORACLE_AGENT_URL || 'https://hub.wma.ia.br/organocasa-api';

    if (!finalHtml && !isOracleAgent && hasQrHash && oracleAgentBase) {
      try {
        const agentRes = await fetch(`${oracleAgentBase}/fetch-sefaz`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-OrganoCasa-Client': 'organocasa-pwa-v1'
          },
          body: JSON.stringify({ url: targetUrl, accessKey }),
          signal: createTimeoutSignal(14000)
        });
        if (agentRes.ok) {
          const agentJson = await agentRes.json();
          if (agentJson && Array.isArray(agentJson.items) && agentJson.items.length > 0) {
            res.status(200).json(agentJson);
            return;
          }
        }
      } catch (agentErr) {
        console.warn('[fetch-sefaz] Fallback Oracle Agent indisponível:', agentErr.message);
      }
    }

    // 3. Parse extracted HTML if we got any valid content
    const parsedData = finalHtml ? parseSefazHtml(finalHtml, accessKey) : null;

    if (parsedData && parsedData.items.length > 0) {
      if (
        (!parsedData.storeName || parsedData.storeName.startsWith('Supermercado')) &&
        accessKey &&
        accessKey.length === 44
      ) {
        const enrichedName = await lookupCnpjStoreName(accessKey);
        if (enrichedName) parsedData.storeName = enrichedName;
      }

      res.status(200).json({
        ...parsedData,
        success: true,
        requiresManualItems: false,
        sefazPortalUrl: accessKey?.startsWith('52')
          ? 'https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfe/consulta-completa'
          : 'https://www.fazenda.sp.gov.br/nfce/consulta'
      });
      return;
    }

    // 4. Honest fallback when SEFAZ is down (503), WAF-blocked, or raw 44-digit key requires CAPTCHA
    if (accessKey && accessKey.length === 44) {
      const enrichedName = await lookupCnpjStoreName(accessKey);
      const storeName = enrichedName || 'Supermercado (NFC-e)';
      const yy = accessKey.substring(2, 4);
      const mm = accessKey.substring(4, 6);
      const emissionDate = new Date(
        2000 + parseInt(yy, 10),
        Math.max(0, parseInt(mm, 10) - 1),
        1
      ).toISOString();

      const reasonNote = !hasQrHash
        ? 'Nota identificada pelo CNPJ na Receita Federal. Como os 44 dígitos sozinhos não possuem o código do QR Code, a SEFAZ exige captcha. Dica: tire uma foto do cupom abaixo para extrair todos os produtos com IA em segundos!'
        : sefazHttpStatus === 503
        ? 'O servidor da SEFAZ está temporariamente fora do ar (Erro 503 Manutenção). Tire uma foto do cupom abaixo para extrair os produtos imediatamente com IA!'
        : 'A SEFAZ bloqueou a consulta automática desta nota no momento. Tire uma foto do cupom abaixo para extrair os produtos com IA ou cole a tabela da SEFAZ.';

      res.status(200).json({
        success: true,
        storeName,
        accessKey,
        totalAmount: 0,
        purchaseDate: emissionDate,
        items: [],
        requiresManualItems: true,
        sefazHttpStatus,
        sefazPortalUrl: accessKey.startsWith('52')
          ? 'https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfe/consulta-completa'
          : 'https://www.fazenda.sp.gov.br/nfce/consulta',
        note: reasonNote
      });
      return;
    }

    res.status(502).json({
      success: false,
      error: 'Não foi possível carregar os dados da SEFAZ no momento. Tente enviar uma foto ou PDF do cupom.'
    });
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
module.exports.isAllowedSefazUrl = isAllowedSefazUrl;
module.exports.normalizeSefazTarget = normalizeSefazTarget;
module.exports.isBlockedOrErrorHtml = isBlockedOrErrorHtml;
