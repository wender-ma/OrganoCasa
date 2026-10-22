/**
 * Compresses and resizes an image File using an HTML5 Canvas before converting to Base64 Data URL.
 * Prevents multi-megabyte camera photos from bloating IndexedDB (Dexie) and Supabase payloads.
 */
export async function compressImageFile(
  file: File,
  maxDimension: number = 400,
  quality: number = 0.75
): Promise<string> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return readFileAsDataURL(file);
  }

  return new Promise<string>((resolve, reject) => {
    const objectUrl =
      typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(file)
        : null;

    const cleanup = () => {
      if (objectUrl && typeof URL.revokeObjectURL === 'function') {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // ignore
        }
      }
    };

    const img = new Image();

    img.onload = () => {
      try {
        let width = img.naturalWidth || img.width || maxDimension;
        let height = img.naturalHeight || img.height || maxDimension;

        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.max(1, Math.round((height * maxDimension) / width));
            width = maxDimension;
          } else {
            width = Math.max(1, Math.round((width * maxDimension) / height));
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          readFileAsDataURL(file).then(resolve).catch(reject);
          return;
        }

        // Fill white background for transparent PNGs converted to JPEG
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        cleanup();
        resolve(dataUrl);
      } catch {
        cleanup();
        readFileAsDataURL(file).then(resolve).catch(reject);
      }
    };

    img.onerror = () => {
      cleanup();
      readFileAsDataURL(file).then(resolve).catch(reject);
    };

    if (objectUrl) {
      img.src = objectUrl;
    } else {
      readFileAsDataURL(file)
        .then((dataUrl) => {
          img.src = dataUrl;
        })
        .catch(reject);
    }
  });
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === 'string') {
        resolve(e.target.result);
      } else {
        reject(new Error('Falha ao ler arquivo de imagem'));
      }
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo de imagem'));
    reader.readAsDataURL(file);
  });
}
