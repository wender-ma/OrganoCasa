import { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';

export interface QrScannerDebugInfo {
  engine: 'BarcodeDetector (Nativo)' | 'jsQR (Fallback CPU)' | 'Nenhum';
  isSecureContext: boolean;
  videoReadyState: number;
  videoWidth: number;
  videoHeight: number;
  fps: number;
  lastResult: string | null;
  lastError: string | null;
  facingMode: string;
}

export interface UseQrScannerOptions {
  facingMode?: 'environment' | 'user';
  onScanSuccess: (decodedText: string) => void;
  onError?: (error: string) => void;
  throttleMs?: number;
  dedupeDelayMs?: number;
}

/**
 * Detecta se o dispositivo é iOS (iPhone, iPad, iPod)
 */
export function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * Validação não-ingênua de suporte a BarcodeDetector
 * No iOS/WebKit, a API é forçada a retornar false pois é inoperante por padrão
 */
export async function supportsBarcodeDetector(): Promise<boolean> {
  if (isIOS()) {
    return false; // iOS sempre deve usar jsQR
  }
  try {
    if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
      return false;
    }
    const BarcodeDetectorClass = (window as any).BarcodeDetector;
    if (typeof BarcodeDetectorClass.getSupportedFormats !== 'function') {
      return false;
    }
    const formats = await BarcodeDetectorClass.getSupportedFormats();
    return Array.isArray(formats) && formats.includes('qr_code');
  } catch {
    return false;
  }
}

/**
 * Som de beep suave ao ler o código com sucesso
 */
function playBeepSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  } catch {
    // Silencia erros de autoplay de áudio
  }
}

export function useQrScanner({
  facingMode: initialFacingMode = 'environment',
  onScanSuccess,
  onError,
  throttleMs = 120,
  dedupeDelayMs = 2000
}: UseQrScannerOptions) {
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>(initialFacingMode);
  const [isStarting, setIsStarting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannedCode, setScannedCode] = useState<string | null>(null);

  const [debugInfo, setDebugInfo] = useState<QrScannerDebugInfo>({
    engine: 'Nenhum',
    isSecureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
    videoReadyState: 0,
    videoWidth: 0,
    videoHeight: 0,
    fps: 0,
    lastResult: null,
    lastError: null,
    facingMode: initialFacingMode
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanIntervalRef = useRef<any>(null);
  const isProcessingFrameRef = useRef<boolean>(false);
  const barcodeDetectorRef = useRef<any>(null);
  const nativeSupportedRef = useRef<boolean | null>(null);
  const activeRequestIdRef = useRef<number>(0);

  // Controle de FPS e deduplicação
  const frameCountRef = useRef<number>(0);
  const fpsTimerRef = useRef<number>(Date.now());
  const lastDetectedRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });

  // 1. Inicializar detecção de motor (Nativo vs jsQR)
  useEffect(() => {
    let isMounted = true;
    supportsBarcodeDetector().then((supported) => {
      if (!isMounted) return;
      nativeSupportedRef.current = supported;
      if (supported) {
        try {
          barcodeDetectorRef.current = new (window as any).BarcodeDetector({
            formats: ['qr_code']
          });
          setDebugInfo((prev) => ({ ...prev, engine: 'BarcodeDetector (Nativo)' }));
        } catch {
          barcodeDetectorRef.current = null;
          setDebugInfo((prev) => ({ ...prev, engine: 'jsQR (Fallback CPU)' }));
        }
      } else {
        barcodeDetectorRef.current = null;
        setDebugInfo((prev) => ({ ...prev, engine: 'jsQR (Fallback CPU)' }));
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Parar câmera e limpar todas as tracks
  const stop = useCallback(() => {
    activeRequestIdRef.current++;
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    isProcessingFrameRef.current = false;
    setIsScanning(false);
    setIsStarting(false);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // 3. Processar resultado de leitura com deduplicação
  const handleDetected = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) return;

      const now = Date.now();
      if (lastDetectedRef.current.text === clean && now - lastDetectedRef.current.time < dedupeDelayMs) {
        // Ignora duplicata no intervalo de dedupeDelayMs
        return;
      }

      lastDetectedRef.current = { text: clean, time: now };
      setScannedCode(clean);
      setDebugInfo((prev) => ({ ...prev, lastResult: clean }));

      // Feedback sonoro e háptico
      playBeepSound();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(100);
        } catch {}
      }

      onScanSuccess(clean);
    },
    [dedupeDelayMs, onScanSuccess]
  );

  // 4. Processamento de um único frame
  const processFrame = useCallback(async () => {
    if (isProcessingFrameRef.current) return;
    const video = videoRef.current;
    if (!video) return;

    // Atualiza estatísticas de FPS a cada 1 segundo
    frameCountRef.current++;
    const now = Date.now();
    if (now - fpsTimerRef.current >= 1000) {
      const currentFps = frameCountRef.current;
      frameCountRef.current = 0;
      fpsTimerRef.current = now;
      setDebugInfo((prev) => ({
        ...prev,
        fps: currentFps,
        videoReadyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight
      }));
    }

    // Regra crítica para iOS Safari: readyState precisa ser >= HAVE_CURRENT_DATA (2)
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      return;
    }

    isProcessingFrameRef.current = true;

    try {
      const vWidth = video.videoWidth;
      const vHeight = video.videoHeight;

      // CAMINHO 1: BarcodeDetector Nativo (Chrome Android / Desktop)
      if (barcodeDetectorRef.current) {
        try {
          const barcodes = await barcodeDetectorRef.current.detect(video);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            handleDetected(barcodes[0].rawValue);
            isProcessingFrameRef.current = false;
            return;
          }
        } catch (err: any) {
          setDebugInfo((prev) => ({ ...prev, lastError: `BarcodeDetector: ${err.message}` }));
        }
      }

      // CAMINHO 2: jsQR Fallback (iOS Safari, Firefox, Desktop)
      // Otimização óptica: Recorta a região central correspondente ao quadrado do visor na tela
      // Mantém resolução alta (~720-900px) para decodificar até os QR codes densos da NFC-e
      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (ctx) {
        const minDim = Math.min(vWidth, vHeight);
        const targetDim = Math.min(minDim, 800); // 800px oferece densidade ideal para NFC-e

        if (canvas.width !== targetDim || canvas.height !== targetDim) {
          canvas.width = targetDim;
          canvas.height = targetDim;
        }

        // Centro do vídeo (quadrado 1:1)
        const sx = (vWidth - minDim) / 2;
        const sy = (vHeight - minDim) / 2;

        ctx.drawImage(video, sx, sy, minDim, minDim, 0, 0, targetDim, targetDim);
        const imgData = ctx.getImageData(0, 0, targetDim, targetDim);

        let qr = jsQR(imgData.data, targetDim, targetDim, {
          inversionAttempts: 'attemptBoth'
        });

        if (qr && qr.data) {
          handleDetected(qr.data);
          isProcessingFrameRef.current = false;
          return;
        }

        // Se não encontrou no corte central, faz segunda passagem rápida na imagem completa reduzida
        const fullScale = Math.min(1, 720 / Math.max(vWidth, vHeight));
        const fullW = Math.round(vWidth * fullScale);
        const fullH = Math.round(vHeight * fullScale);

        if (canvas.width !== fullW || canvas.height !== fullH) {
          canvas.width = fullW;
          canvas.height = fullH;
        }

        ctx.drawImage(video, 0, 0, fullW, fullH);
        const fullImgData = ctx.getImageData(0, 0, fullW, fullH);

        qr = jsQR(fullImgData.data, fullW, fullH, {
          inversionAttempts: 'dontInvert'
        });

        if (qr && qr.data) {
          handleDetected(qr.data);
          isProcessingFrameRef.current = false;
          return;
        }
      }
    } catch (err: any) {
      setDebugInfo((prev) => ({ ...prev, lastError: `jsQR: ${err.message}` }));
    } finally {
      isProcessingFrameRef.current = false;
    }
  }, [handleDetected]);

  // 5. Iniciar Câmera
  const start = useCallback(async () => {
    stop();

    const requestId = ++activeRequestIdRef.current;
    setIsStarting(true);
    setCameraError(null);
    setScannedCode(null);

    // Validação de contexto seguro (HTTPS)
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      const err = 'O acesso à câmera exige conexão segura (HTTPS). Acesse via HTTPS para escanear.';
      setCameraError(err);
      setIsStarting(false);
      onError?.(err);
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = 'Este navegador não suporta acesso à câmera.';
      setCameraError(err);
      setIsStarting(false);
      onError?.(err);
      return;
    }

    try {
      let stream: MediaStream;
      try {
        // Restrições ideais com foco contínuo
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            advanced: [{ focusMode: 'continuous' } as any]
          },
          audio: false
        });
      } catch {
        // Fallback para dispositivos com restrições rígidas
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: false
        });
      }

      // Previne race conditions no React 18 StrictMode
      if (requestId !== activeRequestIdRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) return;

      // Atributos obrigatórios para Safari/WebKit no iOS
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.setAttribute('muted', 'true');
      video.muted = true;
      video.autoplay = true;

      video.srcObject = stream;

      // Espera explícita de prontidão do vídeo antes de rodar o loop de detecção
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (video.videoWidth > 0 && video.readyState >= 2) {
            resolve();
          } else {
            reject(new Error('Tempo esgotado aguardando sinal da câmera.'));
          }
        }, 3500);

        const onPlaying = () => {
          clearTimeout(timeout);
          video.removeEventListener('playing', onPlaying);
          video.removeEventListener('loadeddata', onPlaying);
          resolve();
        };

        video.addEventListener('playing', onPlaying);
        video.addEventListener('loadeddata', onPlaying);

        video.play().catch((playErr) => {
          clearTimeout(timeout);
          // Trata política de autoplay do iOS sem quebrar o fluxo
          console.warn('Alerta no video.play():', playErr);
          resolve();
        });
      });

      if (requestId !== activeRequestIdRef.current) {
        return;
      }

      // Registra dados no debug
      const track = stream.getVideoTracks()[0];
      const settings = track ? track.getSettings() : undefined;
      setDebugInfo((prev) => ({
        ...prev,
        trackSettings: settings,
        videoReadyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        facingMode
      }));

      setIsStarting(false);
      setIsScanning(true);

      // Inicia loop de detecção estável via setInterval
      scanIntervalRef.current = setInterval(processFrame, throttleMs);
    } catch (err: any) {
      if (requestId !== activeRequestIdRef.current) return;
      console.warn('Erro ao abrir câmera:', err);
      setIsStarting(false);

      let msg = 'Não foi possível iniciar a câmera. Use "Foto da Galeria" ou cole o link abaixo.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Permissão de câmera negada. Permita o acesso nas configurações do Safari/Chrome.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'Nenhuma câmera compatível foi encontrada no dispositivo.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'A câmera está sendo usada por outro aplicativo ou aba do navegador.';
      }

      setCameraError(msg);
      onError?.(msg);
    }
  }, [facingMode, stop, processFrame, throttleMs, onError]);

  // 6. Trocar entre câmera traseira e frontal
  const switchCamera = useCallback(() => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  }, []);

  // 7. Decodificação estática a partir de arquivo de foto (galeria)
  const scanImageFile = useCallback(async (file: File): Promise<string | null> => {
    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      return await new Promise<string | null>((resolve) => {
        img.onload = async () => {
          URL.revokeObjectURL(objectUrl);

          // Escala inteligente para fotos grandes (12-48MP)
          const origW = img.naturalWidth || img.width;
          const origH = img.naturalHeight || img.height;
          const maxDim = 1200;
          const scale = Math.min(1, maxDim / Math.max(origW, origH));
          const targetW = Math.round(origW * scale);
          const targetH = Math.round(origH * scale);

          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });

          if (!ctx) {
            resolve(null);
            return;
          }

          ctx.drawImage(img, 0, 0, targetW, targetH);

          // 1. Tentar BarcodeDetector se disponível
          if (barcodeDetectorRef.current) {
            try {
              const barcodes = await barcodeDetectorRef.current.detect(canvas);
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                resolve(barcodes[0].rawValue);
                return;
              }
            } catch {}
          }

          // 2. Tentar jsQR com inversão dupla
          const imgData = ctx.getImageData(0, 0, targetW, targetH);
          const qr = jsQR(imgData.data, targetW, targetH, {
            inversionAttempts: 'attemptBoth'
          });

          if (qr && qr.data) {
            resolve(qr.data);
            return;
          }

          resolve(null);
        };

        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          resolve(null);
        };

        img.src = objectUrl;
      });
    } catch {
      return null;
    }
  }, []);

  // Cleanup automático no unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    videoRef,
    isStarting,
    isScanning,
    cameraError,
    scannedCode,
    debugInfo,
    start,
    stop,
    switchCamera,
    facingMode,
    scanImageFile,
    handleManualCode: handleDetected
  };
}
