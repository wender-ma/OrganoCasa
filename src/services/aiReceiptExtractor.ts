import { ParsedReceiptData, parseReceiptImage, parseReceiptTextHeuristics } from './receiptParser';
import { preprocessReceiptImage } from './imagePreprocessor';

export function getGeminiApiKey(): string {
  return (
    localStorage.getItem('organocasa_gemini_api_key') ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) ||
    ''
  );
}

export function saveGeminiApiKey(key: string): void {
  localStorage.setItem('organocasa_gemini_api_key', key.trim());
}

/**
 * Converts Blob or File to Base64 string
 */
function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isPdfBlob(fileOrBlob: Blob): boolean {
  if (fileOrBlob.type === 'application/pdf') return true;
  if ('name' in fileOrBlob && typeof (fileOrBlob as File).name === 'string') {
    return (fileOrBlob as File).name.toLowerCase().endsWith('.pdf');
  }
  return false;
}

/**
 * Extracts readable text literals from a PDF binary buffer (including /FlateDecode streams) as an offline fallback
 */
async function extractFallbackTextFromPdf(pdfBlob: Blob): Promise<string> {
  try {
    const buf = await pdfBlob.arrayBuffer();
    const decoder = new TextDecoder('latin1');
    const raw = decoder.decode(buf);
    const sources: string[] = [raw];

    if (typeof DecompressionStream !== 'undefined') {
      const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
      let sm: RegExpExecArray | null;
      while ((sm = streamRe.exec(raw)) !== null) {
        try {
          const bodyStr = sm[1];
          const bytes = new Uint8Array(bodyStr.length);
          for (let i = 0; i < bodyStr.length; i++) {
            bytes[i] = bodyStr.charCodeAt(i) & 0xff;
          }
          const ds = new DecompressionStream('deflate');
          const writer = ds.writable.getWriter();
          writer.write(bytes).catch(() => {});
          writer.close().catch(() => {});
          const decompressedBuf = await new Response(ds.readable).arrayBuffer();
          sources.push(decoder.decode(decompressedBuf));
        } catch {}
      }
    }

    const chunks: string[] = [];
    const combinedRaw = sources.join('\n');

    // Extract parenthesized PDF text strings (...)
    const regex = /\(([^()\\]{2,200})\)/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(combinedRaw)) !== null) {
      const cleaned = m[1].replace(/[\x00-\x1F]/g, ' ').trim();
      if (cleaned.length >= 2) {
        chunks.push(cleaned);
      }
    }
    return chunks.join('\n');
  } catch {
    return '';
  }
}

/**
 * Intelligent multimodal extraction using Server-Side Gemini Vision/PDF API (Oracle São Paulo Agent)
 * with automatic fallback to client-side Gemini and local OCR
 */
export async function extractReceiptWithAI(
  imageFileOrUrl: File | Blob | string,
  onProgress?: (progress: number, status: string) => void
): Promise<ParsedReceiptData> {
  return extractReceiptFromMultipleImages([imageFileOrUrl], onProgress);
}

/**
 * Extracts receipt data across 1 or more photos or PDF documents
 */
export async function extractReceiptFromMultipleImages(
  images: (File | Blob | string)[],
  onProgress?: (progress: number, status: string) => void
): Promise<ParsedReceiptData> {
  if (images.length === 0) {
    throw new Error('Nenhum arquivo selecionado para leitura.');
  }

  const customApiKey = getGeminiApiKey();

  // 1. Convert all inputs to Blobs
  onProgress?.(12, `Preparando ${images.length} arquivo(s) da nota fiscal...`);
  const rawBlobs: Blob[] = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (typeof img === 'string') {
      const res = await fetch(img);
      rawBlobs.push(await res.blob());
    } else {
      rawBlobs.push(img);
    }
  }

  // 2. Prepare files for Multimodal AI (keep PDFs as application/pdf, optimize images with natural colors)
  const preparedFiles: { mimeType: string; data: string; rawBlob: Blob; isPdf: boolean }[] = [];

  for (const blob of rawBlobs) {
    if (isPdfBlob(blob)) {
      const b64 = await fileToBase64(blob);
      preparedFiles.push({
        mimeType: 'application/pdf',
        data: b64,
        rawBlob: blob,
        isPdf: true
      });
    } else {
      const processed = await preprocessReceiptImage(blob, {
        enhanceForOCR: false,
        maxWidth: 1600,
        maxHeight: 2400,
        quality: 0.9
      });
      const b64 = await fileToBase64(processed.blob);
      preparedFiles.push({
        mimeType: 'image/jpeg',
        data: b64,
        rawBlob: blob,
        isPdf: false
      });
    }
  }

  // 3. Primary Path: Server-Side Gemini Multimodal API (/api/extract-receipt -> Oracle São Paulo Agent)
  onProgress?.(35, 'Analisando nota fiscal com IA Multimodal...');
  const serverEndpoints = [
    '/api/extract-receipt',
    'https://hub.wma.ia.br/organocasa-api/extract-receipt'
  ];

  let serverPartialData: ParsedReceiptData | null = null;

  for (const endpoint of serverEndpoints) {
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = controller ? setTimeout(() => controller.abort(), 38000) : null;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-OrganoCasa-Client': 'organocasa-pwa-v1'
        },
        body: JSON.stringify({
          files: preparedFiles.map((f) => ({ mimeType: f.mimeType, data: f.data })),
          ...(customApiKey ? { apiKey: customApiKey } : {})
        }),
        signal: controller?.signal
      }).finally(() => {
        if (timer) clearTimeout(timer);
      });

      if (res.ok) {
        const json = await res.json();
        if (json?.success && json?.data) {
          const data = json.data as ParsedReceiptData;
          if (Array.isArray(data.items) && data.items.length > 0) {
            onProgress?.(100, 'Nota fiscal processada com sucesso pela IA!');
            return data;
          }
          serverPartialData = data;
          break;
        }
      }
    } catch (srvErr) {
      console.warn(`[AI:Extractor] Tentativa em ${endpoint} falhou:`, srvErr);
    }
  }

  // 4. Secondary Path: Direct Client-Side Gemini call if user configured a custom key in localStorage
  if (customApiKey) {
    try {
      onProgress?.(45, 'Consultando IA Gemini com chave personalizada...');
      const prompt = `Extraia todos os produtos e dados deste cupom fiscal/nota fiscal brasileira em JSON estrito:
{
  "storeName": "Nome do Supermercado",
  "storeCnpj": "CNPJ com 14 dígitos ou vazio",
  "storeAddress": "Rua/Avenida e número do supermercado ou vazio",
  "storeNeighborhood": "Bairro ou vazio",
  "storeCity": "Cidade ou vazio",
  "storeState": "UF com 2 letras (ex: GO, SP) ou vazio",
  "accessKey": "44 dígitos numéricos ou vazio",
  "purchaseDate": "ISO 8601",
  "totalAmount": 0.00,
  "items": [
    { "name": "NOME DO PRODUTO", "quantity": 1, "unitPrice": 0.00, "totalPrice": 0.00, "unit": "un|kg|g|l|ml|pct|cx|dz", "barcode": null }
  ]
}`;
      const parts: any[] = [{ text: prompt }];
      for (const f of preparedFiles) {
        parts.push({
          inline_data: {
            mime_type: f.mimeType,
            data: f.data
          }
        });
      }

      const modelsToTry = [
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.8-flash'
      ];

      for (const model of modelsToTry) {
        try {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${customApiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: {
                  responseMimeType: 'application/json',
                  temperature: 0.1
                }
              })
            }
          );

          if (response.ok) {
            const data = await response.json();
            let textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textResponse) {
              let cleanJson = textResponse.trim();
              if (cleanJson.startsWith('```')) {
                cleanJson = cleanJson
                  .replace(/^```(?:json)?\s*\n?/, '')
                  .replace(/\n?```\s*$/, '')
                  .trim();
              }
              const parsedJson = JSON.parse(cleanJson);
              const extractedItems = (parsedJson.items || [])
                .filter((it: any) => it && typeof it.name === 'string' && it.name.trim().length >= 2)
                .map((it: any, idx: number) => ({
                  id: `ai-item-${idx + 1}-${Date.now()}`,
                  name: it.name.trim().toUpperCase(),
                  barcode: it.barcode || undefined,
                  quantity: Number(it.quantity) || 1,
                  unitPrice: Number(it.unitPrice) || 0,
                  totalPrice:
                    Number(it.totalPrice) || Number(it.quantity || 1) * Number(it.unitPrice || 0),
                  unit: it.unit || 'un'
                }));

              if (extractedItems.length > 0) {
                onProgress?.(100, 'Cupom processado com sucesso!');
                return {
                  storeName: parsedJson.storeName || 'Supermercado',
                  storeCnpj: parsedJson.storeCnpj || undefined,
                  storeAddress: parsedJson.storeAddress || undefined,
                  storeNeighborhood: parsedJson.storeNeighborhood || undefined,
                  storeCity: parsedJson.storeCity || undefined,
                  storeState: parsedJson.storeState
                    ? String(parsedJson.storeState).trim().toUpperCase().slice(0, 2)
                    : undefined,
                  accessKey: parsedJson.accessKey
                    ? String(parsedJson.accessKey).replace(/\D/g, '')
                    : undefined,
                  totalAmount: Number(
                    (
                      parsedJson.totalAmount ||
                      extractedItems.reduce((s: number, i: any) => s + i.totalPrice, 0)
                    ).toFixed(2)
                  ),
                  purchaseDate: parsedJson.purchaseDate || new Date().toISOString(),
                  rawType: 'ocr_image',
                  items: extractedItems
                };
              }
            }
          }
        } catch {}
      }
    } catch (clientAiErr) {
      console.warn('[AI:Extractor] Falha na chamada direta Gemini:', clientAiErr);
    }
  }

  // 5. Fallback: Local OCR (for images) and PDF stream text parser (for PDFs)
  onProgress?.(55, 'Executando leitura local de contingência...');
  const allParsed: ParsedReceiptData[] = [];

  for (let i = 0; i < preparedFiles.length; i++) {
    const fileEntry = preparedFiles[i];
    onProgress?.(
      60 + Math.round((i / preparedFiles.length) * 35),
      `Lendo arquivo ${i + 1} de ${preparedFiles.length}...`
    );

    if (fileEntry.isPdf) {
      const pdfText = await extractFallbackTextFromPdf(fileEntry.rawBlob);
      if (pdfText) {
        allParsed.push(parseReceiptTextHeuristics(pdfText));
      }
    } else {
      const ocrPrepared = await preprocessReceiptImage(fileEntry.rawBlob, {
        enhanceForOCR: true,
        contrast: 35,
        brightness: 0
      });
      const parsed = await parseReceiptImage(ocrPrepared.blob);
      allParsed.push(parsed);
    }
  }

  // Deduplicate items across multiple overlapping photos by name + totalPrice
  const seenKeys = new Set<string>();
  const mergedItems = [];
  for (const p of allParsed) {
    for (const it of p.items) {
      const dedupeKey = `${it.name.toUpperCase()}|${it.totalPrice.toFixed(2)}`;
      if (!seenKeys.has(dedupeKey)) {
        seenKeys.add(dedupeKey);
        mergedItems.push(it);
      }
    }
  }

  // Do NOT sum totalAmount across multiple overlapping photos of the same receipt;
  // take the highest detected totalAmount or the sum of deduplicated items.
  const maxDetectedTotal = allParsed.reduce((max, p) => Math.max(max, p.totalAmount || 0), 0);
  const itemsSum = mergedItems.reduce((acc, it) => acc + it.totalPrice, 0);
  const totalAmount = maxDetectedTotal > 0 ? maxDetectedTotal : itemsSum;

  return {
    storeName:
      allParsed.find((p) => p.storeName && p.storeName !== 'Supermercado')?.storeName ||
      (serverPartialData?.storeName && serverPartialData.storeName !== 'Supermercado'
        ? serverPartialData.storeName
        : undefined) ||
      allParsed[0]?.storeName ||
      'Supermercado',
    accessKey: allParsed.find((p) => p.accessKey)?.accessKey || serverPartialData?.accessKey,
    totalAmount: Number((totalAmount || serverPartialData?.totalAmount || 0).toFixed(2)),
    purchaseDate:
      allParsed[0]?.purchaseDate || serverPartialData?.purchaseDate || new Date().toISOString(),
    rawType: 'ocr_image',
    requiresManualItems: mergedItems.length === 0,
    items: mergedItems
  };
}

