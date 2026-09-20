import { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';

export type ScannerState = 'idle' | 'requesting' | 'waitingVideo' | 'scanning' | 'error';

export interface VideoEventLog {
  event: string;
  time: string;
}

export interface QrScannerDebugInfo {
  state: ScannerState;
  stateTransitions: { state: ScannerState; timestamp: string }[];
  engine: 'BarcodeDetector (Nativo)' | 'jsQR (Fallback CPU)' | 'Nenhum';
  isSecureContext: boolean;
  videoReadyState: number;
  videoReadyStateLabel: string;
  videoWidth: number;
  videoHeight: number;
  fps: number;
  videoError: string | null;
  lastGUMError: { name: string; message: string } | null;
  videoEvents: VideoEventLog[];
  lastResult: string | null;
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

function readyStateToLabel(state: number): string {
  switch (state) {
    case 0: return '0 (HAVE_NOTHING)';
    case 1: return '1 (HAVE_METADATA)';
    case 2: return '2 (HAVE_CURRENT_DATA)';
    case 3: return '3 (HAVE_FUTURE_DATA)';
    case 4: return '4 (HAVE_ENOUGH_DATA)';
    default: return `${state} (DESCONHECIDO)`;
  }
}

/**
 * Padrão Canônico 5.2: Espera de vídeo à prova de race condition
 * Anexa listeners sincronamente ANTES de qualquer await e valida se o vídeo já está pronto.
 */
function waitForVideoReady(
  video: HTMLVideoElement,
  onEvent: (name: string) => void,
  timeoutMs = 8000
): Promise<void> {
  // 1) Se já tem dados prontos (>= HAVE_CURRENT_DATA), resolve imediatamente sem race
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
    onEvent('already_ready');
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearTimeout(timer);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('playing', onReady);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('error', onError);
    };

    const onReady = (e: Event) => {
      onEvent(e.type);
      cleanup();
      resolve();
    };

    const onError = () => {
      onEvent('error');
      cleanup();
      const code = video.error ? video.error.code : 'desconhecido';
      reject(new Error(`Erro no elemento de vídeo (código ${code})`));
    };

    const timer = setTimeout(() => {
      onEvent('timeout');
      cleanup();
      // Se após o timeout o vídeo tem frame pintado, resolve em vez de falhar
      if (video.videoWidth > 0 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        resolve();
      } else {
        reject(new Error(`Timeout aguardando sinal de vídeo (${timeoutMs}ms)`));
      }
    }, timeoutMs);

    // 2) Anexa listeners sincronamente
    video.addEventListener('loadeddata', onReady);
    video.addEventListener('playing', onReady);
    video.addEventListener('canplay', onReady);
    video.addEventListener('error', onError);
  });
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
  const [scannerState, setScannerState] = useState<ScannerState>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scannedCode, setScannedCode] = useState<string | null>(null);

  // Invariante F: Espelhamento de callbacks e opções em refs para estabilidade referencial absoluta
  const onScanSuccessRef = useRef(onScanSuccess);
  onScanSuccessRef.current = onScanSuccess;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const throttleMsRef = useRef(throttleMs);
  throttleMsRef.current = throttleMs;

  const dedupeDelayMsRef = useRef(dedupeDelayMs);
  dedupeDelayMsRef.current = dedupeDelayMs;

  const facingModeRef = useRef(facingMode);
  facingModeRef.current = facingMode;

  // Invariante A, C, D e G: Ciclo de vida estrito e guards
  const activeRequestIdRef = useRef<number>(0);
  const isStartingRef = useRef<boolean>(false);
  const isCancelledRef = useRef<boolean>(false);
  const isIntentionalStopRef = useRef<boolean>(true);
  const retryCountRef = useRef<number>(0);
  const lastRecoveryTimeRef = useRef<number>(0);
  const scannerStateRef = useRef<ScannerState>('idle');

  // Invariante E: Telemetria barata em modelo pull (refs mutáveis + zero setState durante loop)
  const telemetryRef = useRef<QrScannerDebugInfo>({
    state: 'idle',
    stateTransitions: [{ state: 'idle', timestamp: new Date().toLocaleTimeString() }],
    engine: 'Nenhum',
    isSecureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
    videoReadyState: 0,
    videoReadyStateLabel: '0 (HAVE_NOTHING)',
    videoWidth: 0,
    videoHeight: 0,
    fps: 0,
    videoError: null,
    lastGUMError: null,
    videoEvents: [],
    lastResult: null,
    facingMode: initialFacingMode
  });

  const [debugInfo, setDebugInfo] = useState<QrScannerDebugInfo>(telemetryRef.current);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanIntervalRef = useRef<any>(null);
  const isProcessingFrameRef = useRef<boolean>(false);
  const barcodeDetectorRef = useRef<any>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);

  // FPS e deduplicação
  const frameCountRef = useRef<number>(0);
  const fpsTimerRef = useRef<number>(Date.now());
  const lastDetectedRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });

  // Invariante E: logVideoEvent atualiza ref sem disparar setState
  const logVideoEvent = useCallback((event: string) => {
    const now = new Date().toLocaleTimeString();
    telemetryRef.current.videoEvents = [
      ...telemetryRef.current.videoEvents.slice(-5),
      { event, time: now }
    ];
  }, []);

  // Invariante G: transição de estado monotônica com atualização única
  const transitionState = useCallback((newState: ScannerState) => {
    if (scannerStateRef.current === newState) return;
    scannerStateRef.current = newState;
    setScannerState(newState);

    const now = new Date().toLocaleTimeString();
    telemetryRef.current.state = newState;
    telemetryRef.current.stateTransitions = [
      ...telemetryRef.current.stateTransitions.slice(-4),
      { state: newState, timestamp: now }
    ];
  }, []);

  // Invariante E: Polling único a cada 500ms para transferir telemetria para o estado de exibição
  useEffect(() => {
    const interval = setInterval(() => {
      const video = videoRef.current;
      if (video) {
        telemetryRef.current.videoReadyState = video.readyState;
        telemetryRef.current.videoReadyStateLabel = readyStateToLabel(video.readyState);
        telemetryRef.current.videoWidth = video.videoWidth;
        telemetryRef.current.videoHeight = video.videoHeight;
        if (video.error) {
          telemetryRef.current.videoError = String(video.error.code);
        }
      }
      telemetryRef.current.facingMode = facingModeRef.current;
      setDebugInfo({ ...telemetryRef.current });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // 1. Inicializar detecção de motor (Nativo vs jsQR)
  useEffect(() => {
    let isMounted = true;
    supportsBarcodeDetector().then((supported) => {
      if (!isMounted) return;
      if (supported) {
        try {
          barcodeDetectorRef.current = new (window as any).BarcodeDetector({
            formats: ['qr_code']
          });
          telemetryRef.current.engine = 'BarcodeDetector (Nativo)';
        } catch {
          barcodeDetectorRef.current = null;
          telemetryRef.current.engine = 'jsQR (Fallback CPU)';
        }
      } else {
        barcodeDetectorRef.current = null;
        telemetryRef.current.engine = 'jsQR (Fallback CPU)';
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Parar câmera e liberar tracks (Invariante A & F: deps [])
  const stop = useCallback(() => {
    console.count('scanner:cleanup');
    isCancelledRef.current = true;
    isIntentionalStopRef.current = true;
    isStartingRef.current = false;

    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    isProcessingFrameRef.current = false;

    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      activeStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    transitionState('idle');
  }, [transitionState]);

  // 3. Processar resultado de leitura com deduplicação (Invariante F: deps [])
  const handleDetected = useCallback((text: string) => {
    const clean = text.trim();
    if (!clean) return;

    const now = Date.now();
    if (lastDetectedRef.current.text === clean && now - lastDetectedRef.current.time < dedupeDelayMsRef.current) {
      return;
    }

    lastDetectedRef.current = { text: clean, time: now };
    setScannedCode(clean);
    telemetryRef.current.lastResult = clean;

    playBeepSound();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(100);
      } catch {}
    }

    onScanSuccessRef.current(clean);
  }, []);

  // 4. Processamento contínuo de frame (Invariante F: deps estáveis)
  const processFrame = useCallback(async () => {
    if (isProcessingFrameRef.current) return;
    const video = videoRef.current;
    if (!video) return;

    // Atualiza contador de frames para telemetria pull
    frameCountRef.current++;
    const now = Date.now();
    if (now - fpsTimerRef.current >= 1000) {
      telemetryRef.current.fps = frameCountRef.current;
      frameCountRef.current = 0;
      fpsTimerRef.current = now;
    }

    // Invariante A/B: Validação estrita para iOS: precisa de readyState >= 2 e resolução real > 0
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth === 0 || video.videoHeight === 0) {
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
            return;
          }
        } catch {
          // Fallback para jsQR em caso de erro no BarcodeDetector
        }
      }

      // CAMINHO 2: jsQR com recorte óptico central em alta densidade (800px)
      if (!canvasRef.current) {
        canvasRef.current = document.createElement('canvas');
      }
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (ctx) {
        const minDim = Math.min(vWidth, vHeight);
        const targetDim = Math.min(minDim, 800);

        if (canvas.width !== targetDim || canvas.height !== targetDim) {
          canvas.width = targetDim;
          canvas.height = targetDim;
        }

        const sx = (vWidth - minDim) / 2;
        const sy = (vHeight - minDim) / 2;

        ctx.drawImage(video, sx, sy, minDim, minDim, 0, 0, targetDim, targetDim);
        const imgData = ctx.getImageData(0, 0, targetDim, targetDim);

        let qr = jsQR(imgData.data, targetDim, targetDim, {
          inversionAttempts: 'attemptBoth'
        });

        if (qr && qr.data) {
          handleDetected(qr.data);
          return;
        }

        // Segunda passagem rápida no frame inteiro escalado se não detectou no centro
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
          return;
        }
      }
    } finally {
      isProcessingFrameRef.current = false;
    }
  }, [handleDetected]);

  // 5. Iniciar Câmera (Invariantes A, B, C, F e G)
  const start = useCallback(async () => {
    // Invariante A: Bloqueia inits simultâneos concorrentes
    if (isStartingRef.current) {
      return;
    }
    // Se já estiver escaneando com stream ativa e válida, não reinicia
    if (scannerStateRef.current === 'scanning' && activeStreamRef.current && activeStreamRef.current.active) {
      return;
    }

    console.count('scanner:init');
    isStartingRef.current = true;
    isCancelledRef.current = false;
    isIntentionalStopRef.current = false;
    retryCountRef.current = 0;

    const requestId = ++activeRequestIdRef.current;

    // Limpa streams anteriores com segurança
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((t) => {
        try { t.stop(); } catch {}
      });
      activeStreamRef.current = null;
    }
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    setCameraError(null);
    setScannedCode(null);

    // Validação de contexto seguro
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      isStartingRef.current = false;
      const err = 'O acesso à câmera exige conexão segura (HTTPS). Acesse via HTTPS para escanear.';
      setCameraError(err);
      transitionState('error');
      onErrorRef.current?.(err);
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      isStartingRef.current = false;
      const err = 'Este navegador não suporta acesso à câmera.';
      setCameraError(err);
      transitionState('error');
      onErrorRef.current?.(err);
      return;
    }

    transitionState('requesting');

    let stream: MediaStream | null = null;
    try {
      // Padrão 5.1: Constraints brandas (sem exact, sem advanced focusMode)
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: facingModeRef.current },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Invariante C: Guard pós-await getUserMedia
      if (requestId !== activeRequestIdRef.current || isCancelledRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      activeStreamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      // Padrão 5.4: Atributos obrigatórios para Safari/WebKit no iOS antes de atribuir srcObject
      video.setAttribute('playsinline', 'true');
      video.setAttribute('webkit-playsinline', 'true');
      video.setAttribute('muted', 'true');
      video.muted = true;
      video.autoplay = true;

      // Invariante D: Monitoramento com guarda
      const primaryTrack = stream.getVideoTracks()[0];
      if (primaryTrack) {
        primaryTrack.onended = () => {
          logVideoEvent('track_ended');
          if (!isCancelledRef.current && !isIntentionalStopRef.current && retryCountRef.current < 1) {
            retryCountRef.current += 1;
            setTimeout(() => {
              if (!isCancelledRef.current && !isIntentionalStopRef.current) {
                start();
              }
            }, 1500);
          }
        };
      }

      // Invariante B: srcObject atribuído no máximo 1x por montagem (nunca chamar load())
      if (video.srcObject !== stream) {
        console.log('[scanner:setSrcObject]', { videoId: video.id || 'no-id', streamId: stream.id });
        video.srcObject = stream;
      }

      transitionState('waitingVideo');

      // Tenta reproduzir vídeo e captura qualquer erro sem quebrar
      await video.play().catch((playErr) => {
        logVideoEvent(`play_catch: ${playErr.name || playErr.message}`);
      });

      // Invariante C: Guard pós-await play()
      if (requestId !== activeRequestIdRef.current || isCancelledRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      // Padrão 5.2: Espera explícita com timeout seguro de 8s e listeners síncronos
      await waitForVideoReady(video, logVideoEvent, 8000);

      // Invariante C: Guard pós-await waitForVideoReady
      if (requestId !== activeRequestIdRef.current || isCancelledRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      transitionState('scanning');
      isStartingRef.current = false;

      // Inicia loop de leitura de frames com intervalo estável
      scanIntervalRef.current = setInterval(processFrame, throttleMsRef.current);
    } catch (err: any) {
      if (requestId !== activeRequestIdRef.current || isCancelledRef.current) return;
      console.warn('Erro ao abrir câmera:', err);

      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        activeStreamRef.current = null;
      }

      telemetryRef.current.lastGUMError = {
        name: err.name || 'Error',
        message: err.message || 'Desconhecido'
      };

      transitionState('error');

      let msg = 'Não foi possível iniciar a câmera. Use "Foto da Galeria" ou cole o link abaixo.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Permissão de câmera negada. Permita o acesso em Ajustes > Safari > Câmera.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'Nenhuma câmera compatível foi encontrada no dispositivo.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'A câmera está ocupada por outro app ou aba. Feche outros apps com câmera e tente novamente.';
      } else if (err.name === 'OverconstrainedError') {
        msg = 'As configurações de resolução não são suportadas por esta câmera.';
      }

      setCameraError(msg);
      onErrorRef.current?.(msg);
    } finally {
      if (requestId === activeRequestIdRef.current) {
        isStartingRef.current = false;
      }
    }
  }, [transitionState, logVideoEvent, processFrame]);

  // 6. Trocar entre câmera traseira e frontal (Invariante F: deps [])
  const switchCamera = useCallback(() => {
    setFacingMode((prev) => {
      const next = prev === 'environment' ? 'user' : 'environment';
      facingModeRef.current = next;
      return next;
    });
  }, []);

  // 7. Decodificação estática a partir de arquivo de foto (galeria) (Invariante F: deps [])
  const scanImageFile = useCallback(async (file: File): Promise<string | null> => {
    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      return await new Promise<string | null>((resolve) => {
        img.onload = async () => {
          URL.revokeObjectURL(objectUrl);

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

          if (barcodeDetectorRef.current) {
            try {
              const barcodes = await barcodeDetectorRef.current.detect(canvas);
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                resolve(barcodes[0].rawValue);
                return;
              }
            } catch {}
          }

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

  // Invariante D: Recuperação com guarda contra cleanup e debounce >= 1s
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (isIntentionalStopRef.current || isCancelledRef.current) return;

      const now = Date.now();
      if (now - lastRecoveryTimeRef.current < 1000 || retryCountRef.current >= 1) {
        return;
      }

      if (scannerStateRef.current === 'scanning') {
        const video = videoRef.current;
        if (video && (video.paused || video.readyState < 2)) {
          lastRecoveryTimeRef.current = now;
          retryCountRef.current += 1;
          logVideoEvent('visibility_resume');
          video.play().catch(() => {});
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [logVideoEvent]);

  // Cleanup automático ao desmontar
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    videoRef,
    scannerState,
    isStarting: scannerState === 'requesting' || scannerState === 'waitingVideo',
    isScanning: scannerState === 'scanning',
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
