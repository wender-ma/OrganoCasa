import { ParsedReceiptData } from './receiptParser';
import { preprocessReceiptImage } from './imagePreprocessor';
import { parseReceiptImage } from './receiptParser';

export function getGeminiApiKey(): string {
  return (
    localStorage.getItem('organocasa_gemini_api_key') ||
    import.meta.env.VITE_GEMINI_API_KEY ||
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
  const apiKey = getGeminiApiKey();

  // 1. Pre-process image on Canvas for best clarity
  onProgress?.(15, 'Otimizando nitidez e contraste da imagem...');
  let processedBlob: Blob;

  if (typeof imageFileOrUrl === 'string') {
    const res = await fetch(imageFileOrUrl);
    const blob = await res.blob();
    const processed = await preprocessReceiptImage(blob);
    processedBlob = processed.blob;
  } else {
    const processed = await preprocessReceiptImage(imageFileOrUrl);
    processedBlob = processed.blob;
  }

  // 2. If Gemini API key is configured and online, use Gemini Flash Vision
  if (apiKey && navigator.onLine) {
    try {
      onProgress?.(45, 'Analisando cupom com IA Multimodal...');
      const base64Data = await fileToBase64(processedBlob);

      const prompt = `Você é um especialista em leitura e extração de Cupons Fiscais (NFC-e / SAT / Danfe) de supermercados e mercados do Brasil.
Analise a imagem deste cupom fiscal e extraia com máxima precisão todas as informações no formato JSON estrito abaixo:

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

Regras:
1. Extraia todos os produtos listados, calculando o preço unitário e valor total real com descontos já subtraídos.
2. Identifique corretamente unidades de peso (kg, g) e unidades simples (un, pct, cx).
3. Retorne APENAS o JSON válido sem marcações markdown ao redor.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inline_data: {
                      mime_type: 'image/jpeg',
                      data: base64Data
                    }
                  }
                ]
              }
            ],
            generationConfig: {
              response_mime_type: 'application/json',
              temperature: 0.1
            }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`Erro na API Gemini: ${response.statusText}`);
      }

      const data = await response.json();
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!textResponse) {
        throw new Error('Nenhuma resposta retornada pela IA.');
      }

      const parsedJson = JSON.parse(textResponse.trim());

      onProgress?.(100, 'Cupom processado com sucesso!');

      return {
        storeName: parsedJson.storeName || 'Supermercado',
        accessKey: parsedJson.accessKey || undefined,
        totalAmount: Number((parsedJson.totalAmount || 0).toFixed(2)),
        purchaseDate: parsedJson.purchaseDate || new Date().toISOString(),
        rawType: 'ocr_image',
        items: (parsedJson.items || []).map((it: any, idx: number) => ({
          id: `ai-item-${idx}-${Date.now()}`,
          name: it.name,
          barcode: it.barcode || undefined,
          quantity: Number(it.quantity) || 1,
          unitPrice: Number(it.unitPrice) || 0,
          totalPrice: Number(it.totalPrice) || Number(it.quantity || 1) * Number(it.unitPrice || 0),
          unit: it.unit || 'un'
        }))
      };
    } catch (aiError) {
      console.warn('Falha na IA Gemini, acionando fallback OCR local:', aiError);
      onProgress?.(50, 'Acionando motor OCR local...');
    }
  }

  // 3. Fallback: Local Tesseract.js OCR
  onProgress?.(60, 'Lendo texto via motor OCR local...');
  return await parseReceiptImage(processedBlob, onProgress);
}

