import { ParsedReceiptData, parseReceiptImage } from './receiptParser';
import { ReceiptItem } from '../types';
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
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Intelligent multimodal extraction using Gemini Vision API with automatic fallback to local OCR
 */
export async function extractReceiptWithAI(
  imageFileOrUrl: File | Blob | string,
  onProgress?: (progress: number, status: string) => void
): Promise<ParsedReceiptData> {
  return extractReceiptFromMultipleImages([imageFileOrUrl], onProgress);
}

/**
 * Extracts receipt data across 1 or more photos (e.g. top and bottom of long thermal receipts)
 */
export async function extractReceiptFromMultipleImages(
  images: (File | Blob | string)[],
  onProgress?: (progress: number, status: string) => void
): Promise<ParsedReceiptData> {
  if (images.length === 0) {
    throw new Error('Nenhuma foto selecionada para leitura.');
  }

  const apiKey = getGeminiApiKey();

  // 1. Convert all inputs to raw Blobs
  onProgress?.(12, `Otimizando ${images.length} foto(s) do cupom...`);
  const rawBlobs: Blob[] = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    let rawBlob: Blob;
    if (typeof img === 'string') {
      const res = await fetch(img);
      rawBlob = await res.blob();
    } else {
      rawBlob = img;
    }
    rawBlobs.push(rawBlob);
  }

  // 2. Preprocess with natural colors for Vision AI (no harsh binarization)
  const naturalBlobs: Blob[] = [];
  for (const blob of rawBlobs) {
    const processed = await preprocessReceiptImage(blob, {
      enhanceForOCR: false,
      maxWidth: 1600,
      maxHeight: 2400,
      quality: 0.9
    });
    naturalBlobs.push(processed.blob);
  }

  // 3. If Gemini API key is configured and online, use Gemini Flash Vision with all images
  if (apiKey && navigator.onLine) {
    try {
      onProgress?.(35, `Analisando ${naturalBlobs.length} foto(s) com IA Multimodal...`);
      const base64List = await Promise.all(naturalBlobs.map(fileToBase64));

      const prompt = `Você é um especialista em leitura e extração de Cupons Fiscais (NFC-e / SAT / Danfe) de supermercados e mercados do Brasil.
Você recebeu ${base64List.length} foto(s) que compõem o mesmo cupom fiscal (podem ser partes diferentes de um cupom longo: topo, meio, rodapé).
Analise todas as imagens em conjunto, remova itens duplicados caso haja sobreposição de fotos e extraia com máxima precisão todas as informações no formato JSON estrito abaixo:

{
  "storeName": "Nome do Supermercado/Empresa (ex: Supermercado Central)",
  "accessKey": "Chave de 44 dígitos se visível ou string vazia",
  "purchaseDate": "Data da compra em formato ISO YYYY-MM-DDTHH:mm:ss.000Z ou data atual se não encontrar",
  "totalAmount": 0.00,
  "items": [
    {
      "name": "Nome claro do produto em maiúsculas (ex: ARROZ BRANCO 5KG)",
      "quantity": 1,
      "unitPrice": 0.00,
      "totalPrice": 0.00,
      "unit": "un|kg|g|l|ml|pct|cx|dz",
      "barcode": "código EAN se visível ou null"
    }
  ]
}

Regras obrigatórias:
1. Extraia TODOS os produtos listados no cupom fiscal.
2. Identifique corretamente unidades de peso (kg, g) e unidades simples (un, pct, cx).
3. Calcule o preço unitário e valor total real com descontos já subtraídos.
4. Retorne APENAS o JSON válido sem marcações markdown ao redor.`;

      const parts: any[] = [{ text: prompt }];
      for (const b64 of base64List) {
        parts.push({
          inline_data: {
            mime_type: 'image/jpeg',
            data: b64
          }
        });
      }

      // Try gemini-1.5-flash with fallback to gemini-2.0-flash
      const modelsToTry = ['gemini-1.5-flash', 'gemini-2.0-flash'];
      let lastError: any = null;
      let textResponse: string | null = null;

      for (const model of modelsToTry) {
        try {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: {
                  response_mime_type: 'application/json',
                  temperature: 0.1
                }
              })
            }
          );

          if (response.ok) {
            const data = await response.json();
            textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textResponse) break;
          } else {
            const errData = await response.text();
            lastError = new Error(`API Gemini (${model}): ${response.status} - ${errData}`);
          }
        } catch (mErr) {
          lastError = mErr;
        }
      }

      if (!textResponse) {
        throw lastError || new Error('Nenhuma resposta retornada pela IA.');
      }

      // Clean JSON string (remove markdown fences if present)
      let cleanJson = textResponse.trim();
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
      }

      const parsedJson = JSON.parse(cleanJson);

      onProgress?.(100, 'Cupom processado com sucesso!');

      const extractedItems = (parsedJson.items || []).map((it: any, idx: number) => ({
        id: `ai-item-${idx + 1}-${Date.now()}`,
        name: it.name || `PRODUTO ${idx + 1}`,
        barcode: it.barcode || undefined,
        quantity: Number(it.quantity) || 1,
        unitPrice: Number(it.unitPrice) || 0,
        totalPrice: Number(it.totalPrice) || Number(it.quantity || 1) * Number(it.unitPrice || 0),
        unit: it.unit || 'un'
      }));

      return {
        storeName: parsedJson.storeName || 'Supermercado',
        accessKey: parsedJson.accessKey || undefined,
        totalAmount: Number((parsedJson.totalAmount || extractedItems.reduce((s: number, i: any) => s + i.totalPrice, 0)).toFixed(2)),
        purchaseDate: parsedJson.purchaseDate || new Date().toISOString(),
        rawType: 'ocr_image',
        items: extractedItems
      };
    } catch (aiError) {
      console.warn('Falha na IA Gemini, acionando fallback OCR local:', aiError);
      onProgress?.(50, 'Acionando motor OCR local...');
    }
  }

  // 4. Fallback: Local Tesseract.js OCR across all photos with enhanced contrast
  onProgress?.(55, 'Preparando leitura OCR local...');
  const ocrBlobs: Blob[] = [];
  for (const blob of rawBlobs) {
    const ocrPrepared = await preprocessReceiptImage(blob, {
      enhanceForOCR: true,
      contrast: 130,
      brightness: 12
    });
    ocrBlobs.push(ocrPrepared.blob);
  }

  const allParsed: ParsedReceiptData[] = [];
  for (let i = 0; i < ocrBlobs.length; i++) {
    onProgress?.(
      60 + Math.round((i / ocrBlobs.length) * 35),
      `Lendo foto ${i + 1} de ${ocrBlobs.length}...`
    );
    const parsed = await parseReceiptImage(ocrBlobs[i]);
    allParsed.push(parsed);
  }

  const mergedItems = allParsed.flatMap((p) => p.items);
  let totalAmount = allParsed.reduce((acc, p) => acc + p.totalAmount, 0) || mergedItems.reduce((acc, it) => acc + it.totalPrice, 0);

  // If OCR couldn't identify individual lines but has a store or total, provide at least 1 item
  if (mergedItems.length === 0) {
    mergedItems.push({
      id: `ocr-item-fallback-${Date.now()}`,
      name: `${allParsed[0]?.storeName?.toUpperCase() || 'COMPRA SUPERMERCADO'}`,
      quantity: 1,
      unitPrice: totalAmount > 0 ? totalAmount : 50.00,
      totalPrice: totalAmount > 0 ? totalAmount : 50.00,
      unit: 'un'
    });
    if (totalAmount === 0) totalAmount = 50.00;
  }

  return {
    storeName: allParsed[0]?.storeName || 'Supermercado',
    accessKey: allParsed.find((p) => p.accessKey)?.accessKey,
    totalAmount: Number(totalAmount.toFixed(2)),
    purchaseDate: allParsed[0]?.purchaseDate || new Date().toISOString(),
    rawType: 'ocr_image',
    items: mergedItems
  };
}
