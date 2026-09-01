import React, { useEffect, useState, useRef } from 'react';
import { X, QrCode, Camera, AlertCircle, FlipHorizontal, Loader2 } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

interface QRCodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void;
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
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);

  const stopScanner = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (e) {
        console.warn('Erro ao parar scanner:', e);
      }
    }
  };

  useEffect(() => {
    if (!isOpen) {
      stopScanner();
      return;
    }

    setCameraError(null);
    setIsStarting(true);
    const scannerElementId = 'qr-reader-square-container';

    const timer = setTimeout(async () => {
      try {
        await stopScanner();
        const scanner = new Html5Qrcode(scannerElementId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false
        });
        html5QrCodeRef.current = scanner;

        await scanner.start(
          { facingMode },
          {
            fps: 15,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
              const qrboxSize = Math.floor(minEdge * 0.8);
              return { width: qrboxSize, height: qrboxSize };
            },
            aspectRatio: 1.0
          },
          (decodedText) => {
            scanner.stop().then(() => {
              onScanSuccess(decodedText);
              onClose();
            });
          },
          () => {
            // Frame error - ignore
          }
        );
      } catch (err: any) {
        console.warn('Erro ao inicializar câmera QR:', err);
        setCameraError(
          'Não foi possível abrir a câmera para QR Code. Permita o acesso à câmera ou cole o link abaixo.'
        );
      } finally {
        setIsStarting(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      stopScanner();
    };
  }, [isOpen, facingMode]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      onScanSuccess(manualInput.trim());
      setManualInput('');
      onClose();
    }
  };

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm sm:max-w-md w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150 flex flex-col space-y-3.5">
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
              <p className="text-[11px] text-slate-400">Enquadre o código quadrado do cupom fiscal</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Square Camera Viewport */}
        <div className="relative w-full max-w-[300px] aspect-square mx-auto bg-black rounded-3xl overflow-hidden shadow-inner flex items-center justify-center border-2 border-emerald-500/40">
          <div id="qr-reader-square-container" className="w-full h-full object-cover" />

          {/* High-tech QR Targeting Overlay */}
          {!cameraError && !isStarting && (
            <div className="absolute inset-4 pointer-events-none flex flex-col justify-between p-2">
              <div className="flex justify-between">
                <div className="w-7 h-7 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl shadow-xs" />
                <div className="w-7 h-7 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl shadow-xs" />
              </div>

              {/* Animated Laser Scanning Line */}
              <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_10px_#10b981] animate-pulse" />

              <div className="flex justify-between">
                <div className="w-7 h-7 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl shadow-xs" />
                <div className="w-7 h-7 border-b-4 border-r-4 border-emerald-400 rounded-br-xl shadow-xs" />
              </div>
            </div>
          )}

          {/* Loading View */}
          {isStarting && (
            <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center text-slate-300 space-y-2">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
              <span className="text-xs font-medium">Iniciando câmera...</span>
            </div>
          )}
        </div>

        {/* Camera Switch button */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={toggleCamera}
            className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <FlipHorizontal className="w-3.5 h-3.5" />
            <span>Alternar Câmera ({facingMode === 'environment' ? 'Traseira' : 'Frontal'})</span>
          </button>
        </div>

        {cameraError && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-300 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{cameraError}</span>
          </div>
        )}

        {/* Manual Input Fallback */}
        <form onSubmit={handleManualSubmit} className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
          <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
            Ou cole o link ou chave de 44 dígitos da nota:
          </label>
          <div className="flex space-x-2">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder="https://... ou 3526..."
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

