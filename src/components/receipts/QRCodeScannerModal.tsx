import React, { useEffect, useState, useRef, useCallback } from 'react';
import { X, QrCode, Camera, AlertCircle, FlipHorizontal, Loader2, ImagePlus, CheckCircle2 } from 'lucide-react';
import jsQR from 'jsqr';

interface QRCodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
}

function playBeepSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  } catch {
    // Ignore audio context autoplay errors
  }
}

export const QRCodeScannerModal: React.FC<QRCodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess
}) => {
  const [manualInput, setManualInput] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isStarting, setIsStarting] = useState(false);
  const [scannedCode, setScannedCode] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const scanningRef = useRef<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const barcodeDetectorRef = useRef<any>(null);
  const lastScanTimeRef = useRef<number>(0);

  // Initialize Native BarcodeDetector if available
  useEffect(() => {
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
      try {
        barcodeDetectorRef.current = new (window as any).BarcodeDetector({
          formats: ['qr_code']
        });
      } catch {
        barcodeDetectorRef.current = null;
      }
    }
  }, []);

  // Stop camera tracks safely
  const stopCamera = useCallback(() => {
    scanningRef.current = false;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Handle successful scan
  const handleScanResult = useCallback(
    (decodedText: string) => {
      if (scannedCode) return; // Prevent double fire
      const cleanText = decodedText.trim();
      if (!cleanText) return;

      setScannedCode(cleanText);
      stopCamera();

      // Audio & Haptic Feedback
      playBeepSound();
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(100);
        } catch {}
      }

      // Small delay for visual confirmation before notifying parent
      setTimeout(() => {
        onScanSuccess(cleanText);
        onClose();
      }, 350);
    },
    [scannedCode, stopCamera, onScanSuccess, onClose]
  );

  // Scanning loop with throttle (~120ms) for high efficiency without lagging mobile CPU
  const scanLoop = useCallback(async () => {
    if (!scanningRef.current || !videoRef.current) return;
    const video = videoRef.current;
    const now = performance.now();

    if (video.readyState === video.HAVE_ENOUGH_DATA && now - lastScanTimeRef.current >= 120) {
      lastScanTimeRef.current = now;

      // 1. Try Native Hardware BarcodeDetector first (Chromium / Android)
      if (barcodeDetectorRef.current) {
        try {
          const barcodes = await barcodeDetectorRef.current.detect(video);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            handleScanResult(barcodes[0].rawValue);
            return;
          }
        } catch {
          // Fall back to jsQR
        }
      }

      // 2. jsQR Fallback on Canvas frame (iOS Safari, Firefox, Desktop)
      const vWidth = video.videoWidth;
      const vHeight = video.videoHeight;

      if (vWidth > 0 && vHeight > 0) {
        if (!canvasRef.current) {
          canvasRef.current = document.createElement('canvas');
        }
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (ctx) {
          // Scale down to max 640px for fast decoding without losing QR resolution
          const scale = Math.min(1, 640 / Math.max(vWidth, vHeight));
          const targetW = Math.round(vWidth * scale);
          const targetH = Math.round(vHeight * scale);

          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
          }

          ctx.drawImage(video, 0, 0, targetW, targetH);
          const imgData = ctx.getImageData(0, 0, targetW, targetH);

          const qrResult = jsQR(imgData.data, targetW, targetH, {
            inversionAttempts: 'attemptBoth'
          });

          if (qrResult && qrResult.data) {
            handleScanResult(qrResult.data);
            return;
          }
        }
      }
    }

    if (scanningRef.current) {
      animFrameRef.current = requestAnimationFrame(scanLoop);
    }
  }, [handleScanResult]);

  // Start Camera Stream with focusMode if available and fallback constraints
  const startCamera = useCallback(async () => {
    stopCamera();
    setIsStarting(true);
    setCameraError(null);
    setScannedCode(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Navegador não suporta acesso à câmera.');
      }

      let stream: MediaStream;
      try {
        // Preferred high quality constraint with ideal continuous focus
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
        // Fallback for older browsers or strict constraints
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facingMode
          },
          audio: false
        });
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        scanningRef.current = true;
        setIsStarting(false);
        animFrameRef.current = requestAnimationFrame(scanLoop);
      }
    } catch (err: any) {
      console.warn('Erro ao abrir câmera:', err);
      setIsStarting(false);
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Permissão de câmera negada. Permita o acesso nas configurações do seu navegador.'
          : 'Não foi possível iniciar a câmera. Use "Foto da Galeria" ou cole o link abaixo.'
      );
    }
  }, [facingMode, stopCamera, scanLoop]);

  // Lifecycle
  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      setScannedCode(null);
      setCameraError(null);
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode, startCamera, stopCamera]);

  // Handle image upload from gallery with auto-downscaling to prevent memory freeze
  const handleQrImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsStarting(true);
    setCameraError(null);

    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = async () => {
        URL.revokeObjectURL(objectUrl);

        // Downscale high-resolution mobile photos (12-48MP) to max 1024px for quick and safe QR detection
        const origW = img.naturalWidth || img.width;
        const origH = img.naturalHeight || img.height;
        const maxDim = 1024;
        const scale = Math.min(1, maxDim / Math.max(origW, origH));
        const canvasW = Math.round(origW * scale);
        const canvasH = Math.round(origH * scale);

        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (ctx) {
          ctx.drawImage(img, 0, 0, canvasW, canvasH);

          // 1. Try Native BarcodeDetector first
          if (barcodeDetectorRef.current) {
            try {
              const barcodes = await barcodeDetectorRef.current.detect(canvas);
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                setIsStarting(false);
                handleScanResult(barcodes[0].rawValue);
                return;
              }
            } catch {}
          }

          // 2. Try jsQR with attemptBoth
          const imgData = ctx.getImageData(0, 0, canvasW, canvasH);
          const qr = jsQR(imgData.data, canvasW, canvasH, {
            inversionAttempts: 'attemptBoth'
          });

          if (qr && qr.data) {
            setIsStarting(false);
            handleScanResult(qr.data);
            return;
          }
        }

        setIsStarting(false);
        setCameraError('Nenhum QR Code legível foi encontrado nesta foto. Tente uma foto mais nítida ou aproximada.');
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        setIsStarting(false);
        setCameraError('Erro ao abrir o arquivo da imagem.');
      };

      img.src = objectUrl;
    } catch {
      setIsStarting(false);
      setCameraError('Falha ao processar o arquivo.');
    } finally {
      e.target.value = '';
    }
  };



  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = manualInput.trim();
    if (val) {
      handleScanResult(val);
      setManualInput('');
    }
  };

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm sm:max-w-md w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col space-y-3.5 animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-tight">
                Escanear QR Code da NFC-e
              </h3>
              <p className="text-[11px] text-slate-400">SEFAZ Goiás, SP, MG, RJ e todos os estados</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera Viewport (Square 1:1 without distortion) */}
        <div className="relative w-full max-w-[280px] aspect-square mx-auto bg-black rounded-2xl overflow-hidden shadow-inner border-2 border-emerald-500/30 flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover"
          />

          {/* Square Target Brackets Overlay */}
          {!cameraError && !isStarting && !scannedCode && (
            <div className="absolute inset-4 pointer-events-none flex flex-col justify-between p-1">
              <div className="flex justify-between">
                <div className="w-8 h-8 border-t-3 border-l-3 border-emerald-400 rounded-tl-xl" />
                <div className="w-8 h-8 border-t-3 border-r-3 border-emerald-400 rounded-tr-xl" />
              </div>

              {/* Animated Laser Scanning Line */}
              <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_8px_#10b981] animate-pulse" />

              <div className="flex justify-between">
                <div className="w-8 h-8 border-b-3 border-l-3 border-emerald-400 rounded-bl-xl" />
                <div className="w-8 h-8 border-b-3 border-r-3 border-emerald-400 rounded-br-xl" />
              </div>
            </div>
          )}

          {/* Success Overlay */}
          {scannedCode && (
            <div className="absolute inset-0 bg-emerald-950/80 backdrop-blur-xs flex flex-col items-center justify-center text-white space-y-2 z-10">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 animate-bounce" />
              <span className="text-xs font-bold">QR Code Identificado!</span>
            </div>
          )}

          {/* Starting / Loading State */}
          {isStarting && (
            <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center text-white space-y-2 z-10">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
              <span className="text-xs">Iniciando leitor...</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={toggleCamera}
            className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <FlipHorizontal className="w-3.5 h-3.5" />
            <span>Trocar Câmera</span>
          </button>

          <label className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors">
            <ImagePlus className="w-3.5 h-3.5" />
            <span>Foto da Galeria</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleQrImageUpload}
              className="hidden"
            />
          </label>
        </div>

        {/* Error notification */}
        {cameraError && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-300 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{cameraError}</span>
          </div>
        )}

        {/* Manual Input */}
        <form onSubmit={handleManualSubmit} className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
          <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
            Ou cole o link da NFC-e ou chave de 44 dígitos:
          </label>
          <div className="flex space-x-2">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="https://nfeweb.sefaz.go.gov.br/... ou 5224..."
              className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={!manualInput.trim()}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors"
            >
              Ler
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
