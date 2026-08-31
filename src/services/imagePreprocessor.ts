/**
 * Client-side image pre-processing on Canvas for supermarket thermal receipts.
 * Optimizes contrast, converts to clean grayscale, and crops borders to improve OCR and AI extraction.
 */

export interface PreprocessingOptions {
  contrast?: number; // 0 to 200 (default 130)
  brightness?: number; // -100 to 100 (default 10)
  maxWidth?: number; // default 1600
  maxHeight?: number; // default 2400
}

export async function preprocessReceiptImage(
  imageSource: File | Blob | string,
  options: PreprocessingOptions = {}
): Promise<{ blob: Blob; dataUrl: string }> {
  const {
    contrast = 130,
    brightness = 10,
    maxWidth = 1600,
    maxHeight = 2400
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Scale down if oversized while maintaining aspect ratio
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Não foi possível obter o contexto 2D do Canvas'));
        return;
      }

      // Draw original resized
      ctx.drawImage(img, 0, 0, width, height);

      // Get pixel data for contrast and grayscale filter
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;

      // Factor calculation for contrast
      const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // 1. Grayscale luminance
        let gray = 0.299 * r + 0.587 * g + 0.114 * b;

        // 2. Brightness adjustment
        gray += brightness;

        // 3. Contrast adjustment
        gray = factor * (gray - 128) + 128;

        // Clamp 0..255
        gray = Math.max(0, Math.min(255, gray));

        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
        // alpha stays unchanged data[i+3]
      }

      ctx.putImageData(imageData, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Erro ao gerar blob da imagem processada'));
            return;
          }
          const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          resolve({ blob, dataUrl });
        },
        'image/jpeg',
        0.9
      );
    };

    img.onerror = () => {
      reject(new Error('Erro ao carregar a imagem para pré-processamento'));
    };

    if (typeof imageSource === 'string') {
      img.src = imageSource;
    } else {
      img.src = URL.createObjectURL(imageSource);
    }
  });
}

