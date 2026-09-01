import React, { useEffect, useState, useRef, useCallback } from 'react';
import { X, QrCode, Camera, AlertCircle, FlipHorizontal, Loader2, ImagePlus } from 'lucide-react';
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
  const [scanSuccess, setScanSuccess] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const mountedRef = useRef(true);
  const containerId = 'qr-scanner-viewport';

  // Cleanup scanner safely
  const cleanupScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) return;
    try {
      const state = scanner.getState();
      // state 2 = SCANNING, state 3 = PAUSED
      if (state === 2 || state === 3) {
        await scanner.stop();
      }
      scanner.clear();
    } catch (e) {
      // Ignore cleanup errors
    }
    scannerRef.current = null;
  }, []);

  // Handle successful scan
  const handleScanResult = useCallback((decodedText: string) => {
    if (scanSuccess) return; // prevent double-fire
    setScanSuccess(true);
    
    if ('vibrate' in navigator) {
      try { navigator.vibrate(100); } catch {}
    }

    // Stop scanner first, then notify parent
    const scanner = scannerRef.current;
    if (scanner) {
      try {
        const state = scanner.getState();
        if (state === 2 || state === 3) {
          scanner.stop().catch(() => {}).finally(() => {
            onScanSuccess(decodedText);
            onClose();
          });
          return;
        }
      } catch {}
    }
    onScanSuccess(decodedText);
    onClose();
  }, [scanSuccess, onScanSuccess, onClose]);

  // Start camera scanner
  useEffect(() => {
    if (!isOpen) {
      cleanupScanner();
      setScanSuccess(false);
      return;
    }

    mountedRef.current = true;
    setCameraError(null);
    setIsStarting(true);
    setScanSuccess(false);

    const startTimer = setTimeout(async () => {
      try {
        await cleanupScanner();

        if (!mountedRef.current) return;

        const scanner = new Html5Qrcode(containerId, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false
        });
        scannerRef.current = scanner;

        // Use simple facingMode - this is the most compatible approach
        // Do NOT call getCameras() first, it causes permission issues on mobile
        await scanner.start(
          { facingMode },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            disableFlip: false
          },
          (decodedText) => {
            handleScanResult(decodedText);
          },
          () => {
            // Ignore per-frame errors
          }
        );

        if (mountedRef.current) {
          setIsStarting(false);
        }
      } catch (err: any) {
        console.warn('Camera QR error:', err);
        if (mountedRef.current) {
          setIsStarting(false);
          setCameraError(
            'Câmera indisponível. Use "Foto da Galeria" para ler um QR Code de uma imagem, ou cole o link/chave abaixo.'
          );
        }
      }
    }, 300);

    return () => {
      mountedRef.current = false;
      clearTimeout(startTimer);
      cleanupScanner();
    };
  }, [isOpen, facingMode]);

  // Scan QR from image file
  const handleQrImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsStarting(true);
    setCameraError(null);

    try {
      await cleanupScanner();

      const scanner = new Html5Qrcode(containerId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false
      });

      const decodedText = await scanner.scanFile(file, true);
      scanner.clear();
      
      if (decodedText) {
        handleScanResult(decodedText);
      } else {
        setCameraError('Nenhum QR Code encontrado na imagem.');
      }
    } catch (err: any) {
      console.warn('QR image scan error:', err);
      setCameraError('Não foi possível ler o QR Code desta imagem. Tente outra foto mais nítida.');
    } finally {
      setIsStarting(false);
      e.target.value = '';
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = manualInput.trim();
    if (val) {
      onScanSuccess(val);
      setManualInput('');
      onClose();
    }
  };

  const toggleCamera = async () => {
    await cleanupScanner();
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm sm:max-w-md w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col space-y-3.5">
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
              <p className="text-[11px] text-slate-400">SEFAZ-GO, SP, MG, RJ e todos os estados</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera Viewport */}
        <div className="relative w-full max-w-[280px] aspect-square mx-auto bg-black rounded-2xl overflow-hidden shadow-inner border-2 border-emerald-500/30">
          <div id={containerId} className="w-full h-full" />

          {/* Corner brackets overlay */}
          {!cameraError && !isStarting && (
            <div className="absolute inset-3 pointer-events-none flex flex-col justify-between">
              <div className="flex justify-between">
                <div className="w-6 h-6 border-t-3 border-l-3 border-emerald-400 rounded-tl-lg" />
                <div className="w-6 h-6 border-t-3 border-r-3 border-emerald-400 rounded-tr-lg" />
              </div>
              <div className="flex justify-between">
                <div className="w-6 h-6 border-b-3 border-l-3 border-emerald-400 rounded-bl-lg" />
                <div className="w-6 h-6 border-b-3 border-r-3 border-emerald-400 rounded-br-lg" />
              </div>
            </div>
          )}

          {/* Loading */}
          {isStarting && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white space-y-2">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
              <span className="text-xs">Iniciando câmera...</span>
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

        {/* Error */}
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
              placeholder="https://nfeweb.sefaz.go.gov.br/... ou 5226..."
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
