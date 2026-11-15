const fs = require('fs');

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

const GEMINI_KEY_PATHS = [
  '/etc/organocasa-agent/gemini-api-key',
  '/var/lib/video-notes-exec/credentials/gemini-api-key'
];

function resolveServerGeminiKey(explicitKey) {
  if (explicitKey && typeof explicitKey === 'string' && explicitKey.trim().length > 10) {
    return explicitKey.trim();
  }
  const envKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.VITE_GEMINI_API_KEY;
  if (envKey && envKey.trim().length > 10) {
    return envKey.trim();
  }
  for (const p of GEMINI_KEY_PATHS) {
    try {
      if (fs.existsSync(p)) {
        const val = fs.readFileSync(p, 'utf8').trim();
        if (val.length > 10) return val;
      }
    } catch {}
  }
  return '';
}

const GEMINI_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-2.5-flash',
  'gemini-2.0-flash'
];

function buildExtractionPrompt(fileCount, hasPdf) {
  return `Você é um especialista em leitura e extração de Cupons Fiscais (NFC-e / SAT / DANFE / Nota Fiscal Paulista / SEFAZ) e comprovantes de supermercados, atacadistas e apps de mercado do Brasil.
Você recebeu ${fileCount} arquivo(s) (${hasPdf ? 'incluindo PDF(s) e/ou imagem(ns)' : 'foto(s) de cupom fiscal'}).
Analise todo o conteúdo visual e textual em conjunto. Caso haja múltiplas fotos de um cupom longo (topo, meio, rodapé), consolide todos os itens sem duplicar linhas sobrepostas.

Retorne EXCLUSIVAMENTE um objeto JSON válido (sem blocos markdown) no seguinte formato exato:
{
  "storeName": "Nome fantasia ou razão social do Supermercado (ex: SUPERMERCADO PRO BRASIL)",
  "accessKey": "Chave de acesso de 44 dígitos numéricos contínuos se visível, ou string vazia",
  "purchaseDate": "Data e hora da compra em formato ISO 8601 (YYYY-MM-DDTHH:mm:ss.000Z)",
  "totalAmount": 0.00,
  "items": [
    {
      "name": "Descrição limpa e legível do produto em maiúsculas (com acentos preservados, ex: FEIJÃO CARIOCA 1KG)",
      "quantity": 1,
      "unitPrice": 0.00,
      "totalPrice": 0.00,
      "unit": "un|kg|g|l|ml|pct|cx|dz",
      "barcode": "código EAN de 8 a 14 dígitos se visível ou null"
    }
  ]
}

Regras estritas:
1. Extraia TODOS os itens reais de produtos presentes na nota/cupom. NUNCA invente produtos genéricos se não houver itens visíveis.
2. Em cupons térmicos brasileiros onde o peso aparece como "0,450 KG X 19,90 = 8,96", quantity deve ser 0.45, unit "kg", unitPrice 19.90 e totalPrice 8.96.
3. Se houver desconto sobre um item específico, subtraia do totalPrice daquele item.
4. Na chave de acesso (accessKey), remova todos os espaços/pontos e retorne exatamente os 44 dígitos numéricos se estiver presente.`;
}

function sanitizeExtractedData(parsedJson) {
  const rawItems = Array.isArray(parsedJson?.items) ? parsedJson.items : [];
  const validUnits = new Set(['un', 'kg', 'g', 'l', 'ml', 'pct', 'cx', 'dz']);

  const items = rawItems
    .filter((it) => it && typeof it.name === 'string' && it.name.trim().length >= 2)
    .map((it, idx) => {
      const name = it.name.trim().toUpperCase();
      const quantity = Math.max(0.001, Number(it.quantity) || 1);
      let unitPrice = Math.max(0, Number(it.unitPrice) || 0);
      let totalPrice = Math.max(0, Number(it.totalPrice) || 0);

      if (totalPrice === 0 && unitPrice > 0) {
        totalPrice = Number((quantity * unitPrice).toFixed(2));
      } else if (unitPrice === 0 && totalPrice > 0 && quantity > 0) {
        unitPrice = Number((totalPrice / quantity).toFixed(2));
      }

      const rawUnit = String(it.unit || 'un').toLowerCase().trim();
      const unit = validUnits.has(rawUnit) ? rawUnit : 'un';
      const cleanBarcode = it.barcode ? String(it.barcode).replace(/\D/g, '') : '';

      return {
        id: `ai-item-${idx + 1}-${Date.now()}`,
        name,
        barcode: cleanBarcode.length >= 8 && cleanBarcode.length <= 14 ? cleanBarcode : undefined,
        quantity,
        unitPrice: Number(unitPrice.toFixed(2)),
        totalPrice: Number(totalPrice.toFixed(2)),
        unit
      };
    });

  const cleanKey = String(parsedJson?.accessKey || '').replace(/\D/g, '');
  const accessKey = cleanKey.length === 44 ? cleanKey : undefined;

  let totalAmount = Number(parsedJson?.totalAmount) || 0;
  if (totalAmount <= 0 && items.length > 0) {
    totalAmount = Number(items.reduce((sum, it) => sum + it.totalPrice, 0).toFixed(2));
  }

  let purchaseDate = new Date().toISOString();
  if (parsedJson?.purchaseDate) {
    const d = new Date(parsedJson.purchaseDate);
    if (!isNaN(d.getTime()) && d.getFullYear() >= 2018 && d.getFullYear() <= 2035) {
      purchaseDate = d.toISOString();
    }
  }

  return {
    storeName: String(parsedJson?.storeName || 'Supermercado').trim() || 'Supermercado',
    accessKey,
    totalAmount: Number(totalAmount.toFixed(2)),
    purchaseDate,
    rawType: 'ocr_image',
    items
  };
}

async function extractWithGeminiServer(files, apiKey) {
  const hasPdf = files.some((f) => f.mimeType === 'application/pdf');
  const prompt = buildExtractionPrompt(files.length, hasPdf);

  const parts = [{ text: prompt }];
  for (const file of files) {
    parts.push({
      inline_data: {
        mime_type: file.mimeType || 'image/jpeg',
        data: file.data
      }
    });
  }

  let lastError = null;
  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1
            }
          }),
          signal: createTimeoutSignal(35000)
        }
      );

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        lastError = new Error(`Gemini (${model}) HTTP ${response.status}: ${errText.slice(0, 200)}`);
        continue;
      }

      const data = await response.json();
      let textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResponse) {
        lastError = new Error(`Gemini (${model}) retornou resposta vazia.`);
        continue;
      }

      let cleanJson = textResponse.trim();
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson
          .replace(/^```(?:json)?\s*\n?/, '')
          .replace(/\n?```\s*$/, '')
          .trim();
      }

      const parsedJson = JSON.parse(cleanJson);
      const sanitized = sanitizeExtractedData(parsedJson);
      return {
        success: true,
        model,
        data: sanitized
      };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error('Falha ao processar documento na IA Multimodal.');
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-OrganoCasa-Client'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Método não permitido. Use POST.' });
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

    let files = Array.isArray(body.files) ? body.files : [];
    if (files.length === 0 && (body.fileBase64 || body.data)) {
      files = [
        {
          data: body.fileBase64 || body.data,
          mimeType: body.mimeType || 'image/jpeg'
        }
      ];
    }
    if (files.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Nenhum arquivo (foto ou PDF) enviado para extração.'
      });
      return;
    }

    const apiKey = resolveServerGeminiKey(body.apiKey);
    const isOracleAgent = process.env.IS_ORACLE_AGENT === '1';
    const oracleAgentBase =
      process.env.ORACLE_AGENT_URL || 'https://hub.wma.ia.br/organocasa-api';

    // If we have a local Gemini API key, execute directly
    if (apiKey) {
      const result = await extractWithGeminiServer(files, apiKey);
      res.status(200).json(result);
      return;
    }

    // If running on Vercel without local key, delegate to Oracle São Paulo Agent
    if (!isOracleAgent && oracleAgentBase) {
      const agentRes = await fetch(`${oracleAgentBase}/extract-receipt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OrganoCasa-Client': 'organocasa-pwa-v1'
        },
        body: JSON.stringify({ files }),
        signal: createTimeoutSignal(40000)
      });

      if (agentRes.ok) {
        const agentJson = await agentRes.json();
        res.status(200).json(agentJson);
        return;
      }
      const errBody = await agentRes.text().catch(() => '');
      res.status(agentRes.status || 502).json({
        success: false,
        error: `Erro no agente de IA: ${errBody.slice(0, 200)}`
      });
      return;
    }

    res.status(503).json({
      success: false,
      error: 'Chave de IA Gemini não configurada no servidor.'
    });
  } catch (error) {
    console.error('[extract-receipt] Erro:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Falha na extração com IA Multimodal.'
    });
  }
}

module.exports = handler;
module.exports.default = handler;
module.exports.extractWithGeminiServer = extractWithGeminiServer;
module.exports.resolveServerGeminiKey = resolveServerGeminiKey;
module.exports.sanitizeExtractedData = sanitizeExtractedData;
