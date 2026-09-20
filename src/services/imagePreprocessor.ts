/**
 * Client-side image pre-processing on Canvas for supermarket thermal receipts.
 * Optimizes image dimensions, maintains sharp text readability, and prepares clean images for AI and OCR.
 */

export interface PreprocessingOptions {
  enhanceForOCR?: boolean; // If true, applies grayscale & contrast boost (best for Tesseract OCR)
  contrast?: number; // 0 to 200 (default 125)
  brightness?: number; // -100 to 100 (default 10)
  maxWidth?: number; // default 1800
  maxHeight?: number; // default 2600
  quality?: number; // JPEG quality (default 0.92)
}

export async function preprocessReceiptImage(
  imageSource: File | Blob | string,
  options: PreprocessingOptions = {}
): Promise<{ blob: Blob; dataUrl: string }> {
  const {
    enhanceForOCR = false,
    contrast = 125,
    brightness = 10,
    maxWidth = 1800,
    maxHeight = 2600,
    quality = 0.92
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    let objectUrlToRevoke: string | null = null;

    // Only set crossOrigin for remote HTTP(S) URLs.
    // Setting crossOrigin on blob: or data: URLs causes SecurityError in Safari / WebKit.
    if (typeof imageSource === 'string' && (imageSource.startsWith('http://') || imageSource.startsWith('https://'))) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }

      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      // Scale down if oversized while maintaining aspect ratio
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d', { willReadFrequently: enhanceForOCR });
      if (!ctx) {
        reject(new Error('Não foi possível inicializar o processador de imagem.'));
        return;
      }

      // Fill white background for transparent PNGs
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Draw original resized cleanly
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      // Apply grayscale + contrast filter ONLY if explicitly requested for traditional OCR
      // Vision AI (Gemini) performs significantly better with natural color images.
      if (enhanceForOCR) {
        try {
          const imageData = ctx.getImageData(0, 0, width, height);
          const data = imageData.data;
          const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Grayscale luminance
            let gray = 0.299 * r + 0.587 * g + 0.114 * b;
            gray += brightness;
            gray = factor * (gray - 128) + 128;
            gray = Math.max(0, Math.min(255, gray));

            data[i] = gray;
            data[i + 1] = gray;
            data[i + 2] = gray;
          }

          ctx.putImageData(imageData, 0, 0);
        } catch (filterError) {
          console.warn('Filtro de contraste ignorado:', filterError);
        }
      }

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Erro ao converter foto processada.'));
            return;
          }
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve({ blob, dataUrl });
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      if (objectUrlToRevoke) {
        URL.revokeObjectURL(objectUrlToRevoke);
      }
      reject(new Error('Não foi possível carregar a imagem selecionada. Verifique o formato do arquivo.'));
    };

    if (typeof imageSource === 'string') {
      img.src = imageSource;
    } else {
      objectUrlToRevoke = URL.createObjectURL(imageSource);
      img.src = objectUrlToRevoke;
    }
  });
}
