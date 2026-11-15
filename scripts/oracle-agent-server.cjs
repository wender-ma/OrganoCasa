#!/usr/bin/env node
/**
 * OrganoCasa — Oracle Cloud (São Paulo) Hybrid Agent Microservice
 * Provides:
 *  - GET  /health
 *  - POST /extract-receipt (Server-side Gemini 3.5 Flash Multimodal Vision + PDF extractor)
 *  - POST /fetch-sefaz     (Brazilian IP SEFAZ 2-step + FlareSolverr & Playwright Headless fallback)
 */

const http = require('http');
const { execFile } = require('child_process');
const sefazHandler = require('../api/fetch-sefaz.js');
const extractHandler = require('../api/extract-receipt.js');

process.env.IS_ORACLE_AGENT = '1';

const PORT = Number(process.env.PORT || 4195);
const HOST = process.env.HOST || '127.0.0.1';
const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL || 'http://172.18.0.3:8191/v1';
const PLAYWRIGHT_PYTHON = '/home/ubuntu/farewatch/venv/bin/python';

// Simple IP rate limiter (max 40 requests / minute per IP)
const rateMap = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60_000;
  const entry = rateMap.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + windowMs;
  } else {
    entry.count += 1;
  }
  rateMap.set(ip, entry);
  return entry.count <= 40;
}

/**
 * Fallback 1: Fetch SEFAZ HTML via FlareSolverr container
 */
async function fetchViaFlareSolverr(targetUrl) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 16000);
    const res = await fetch(FLARESOLVERR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cmd: 'request.get',
        url: targetUrl,
        maxTimeout: 15000
      }),
      signal: controller.signal
    }).finally(() => clearTimeout(timer));

    if (!res.ok) return '';
    const data = await res.json();
    const html = data?.solution?.response || '';
    if (html && !sefazHandler.isBlockedOrErrorHtml(html)) {
      return html;
    }
  } catch (e) {
    console.warn('[oracle-agent] FlareSolverr fallback error:', e.message);
  }
  return '';
}

/**
 * Fallback 2: Fetch SEFAZ HTML via Playwright Headless Chromium
 */
function fetchViaPlaywright(targetUrl, accessKey) {
  return new Promise((resolve) => {
    const pyScript = `
import sys, urllib.request
from playwright.sync_api import sync_playwright

url = sys.argv[1]
key = sys.argv[2] if len(sys.argv) > 2 else ""

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, channel="chromium")
    context = browser.new_context(
        locale="pt-BR",
        timezone_id="America/Sao_Paulo",
        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"
    )
    page = context.new_page()
    page.set_default_timeout(12000)
    try:
        page.goto(url, wait_until="domcontentloaded")
        try:
            page.wait_for_selector("#tabResult, .txtTit, iframe", timeout=5000)
        except Exception:
            pass
        html = page.content()
        if "Item" not in html and key and "sefaz.go.gov.br" in url:
            render_url = f"https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfce/render/html/danfeNFCe?chNFe={key}"
            page.goto(render_url, wait_until="domcontentloaded")
            html = page.content()
        sys.stdout.write(html)
    except Exception:
        pass
    finally:
        browser.close()
`;
    execFile(
      PLAYWRIGHT_PYTHON,
      ['-c', pyScript, targetUrl, accessKey || ''],
      { timeout: 16000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout) => {
        if (err || !stdout) {
          resolve('');
          return;
        }
        resolve(stdout);
      }
    );
  });
}

/**
 * Creates an Express/Vercel-like (req, res) wrapper around Node's http.ServerResponse
 */
function createVercelRes(res, onInterceptJson) {
  let statusCode = 200;
  const wrapper = {
    setHeader: (k, v) => res.setHeader(k, v),
    status: (code) => {
      statusCode = code;
      return wrapper;
    },
    json: (obj) => {
      if (onInterceptJson) {
        onInterceptJson(statusCode, obj);
        return;
      }
      res.statusCode = statusCode;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(obj));
    },
    end: (body) => {
      res.statusCode = statusCode;
      res.end(body);
    }
  };
  return wrapper;
}

function readJsonBody(req, maxBytes = 30 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('Payload excede o limite máximo de 30MB.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error('JSON inválido no corpo da requisição.'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-OrganoCasa-Client, X-Api-Key'
  );

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const clientIp =
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';

  if (!checkRateLimit(clientIp)) {
    res.statusCode = 429;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: 'Muitas requisições. Aguarde 1 minuto.' }));
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname.replace(/^\/organocasa-api/, '') || '/';

  if (req.method === 'GET' && (pathname === '/health' || pathname === '/')) {
    const hasKey = Boolean(extractHandler.resolveServerGeminiKey());
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(
      JSON.stringify({
        ok: true,
        service: 'organocasa-oracle-agent',
        region: 'sa-saopaulo-1',
        geminiConfigured: hasKey,
        models: ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash']
      })
    );
    return;
  }

  if (pathname === '/extract-receipt') {
    try {
      req.body = await readJsonBody(req);
      req.query = Object.fromEntries(parsedUrl.searchParams.entries());
      await extractHandler(req, createVercelRes(res));
    } catch (err) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (pathname === '/fetch-sefaz') {
    try {
      req.body = await readJsonBody(req, 1024 * 1024);
      req.query = Object.fromEntries(parsedUrl.searchParams.entries());

      let interceptedStatus = 200;
      let interceptedPayload = null;

      await sefazHandler(
        req,
        createVercelRes(res, (code, obj) => {
          interceptedStatus = code;
          interceptedPayload = obj;
        })
      );

      // If direct Brazilian IP fetch returned items, return immediately
      if (interceptedPayload && Array.isArray(interceptedPayload.items) && interceptedPayload.items.length > 0) {
        res.statusCode = interceptedStatus;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(interceptedPayload));
        return;
      }

      // Otherwise, if a valid SEFAZ QR Code URL with hash was provided, try Browser Agent Fallbacks (FlareSolverr + Playwright)
      const { targetUrl, accessKey } = sefazHandler.normalizeSefazTarget(
        req.body?.url || req.query?.url,
        req.body?.accessKey || req.query?.accessKey
      );
      const hasQrHash = Boolean(
        targetUrl &&
          (targetUrl.includes('%7C') || targetUrl.includes('|') || targetUrl.includes('cHashQRCode='))
      );

      const isOriginMaintenance = interceptedPayload?.sefazHttpStatus === 503;

      if (hasQrHash && !isOriginMaintenance && sefazHandler.isAllowedSefazUrl(targetUrl)) {
        let browserHtml = await fetchViaFlareSolverr(targetUrl);
        if (!browserHtml) {
          browserHtml = await fetchViaPlaywright(targetUrl, accessKey);
        }
        if (browserHtml && !sefazHandler.isBlockedOrErrorHtml(browserHtml)) {
          const parsedBrowser = sefazHandler.parseSefazHtml(browserHtml, accessKey);
          if (parsedBrowser.items.length > 0) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(
              JSON.stringify({
                ...parsedBrowser,
                success: true,
                requiresManualItems: false,
                agentEngine: 'browser-fallback'
              })
            );
            return;
          }
        }
      }

      res.statusCode = interceptedStatus;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(interceptedPayload || { success: false, error: 'Sem resposta' }));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ success: false, error: 'Endpoint não encontrado.' }));
});

server.listen(PORT, HOST, () => {
  console.log(`[organocasa-oracle-agent] Listening on http://${HOST}:${PORT}`);
});
