import React, { useEffect, useState } from 'react';
import { X, QrCode, Camera, AlertCircle } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

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

  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;

    if (isOpen) {
      setCameraError(null);
      const scannerElementId = 'qr-reader-container';

      // Give DOM time to mount
      const timer = setTimeout(() => {
        try {
          html5QrCode = new Html5Qrcode(scannerElementId);
          html5QrCode
            .start(
              { facingMode: 'environment' },
              {
                fps: 10,
                qrbox: { width: 250, height: 250 }
              },
              (decodedText) => {
                html5QrCode?.stop().then(() => {
                  onScanSuccess(decodedText);
                  onClose();
                });
              },
              () => {
                // Ignore scanning failures per frame
              }
            )
            .catch((err) => {
              console.warn('Erro ao inicializar câmera QR:', err);
              setCameraError('Câmera indisponível. Você pode colar o link ou chave de 44 dígitos abaixo.');
            });
        } catch (e) {
          setCameraError('Não foi possível iniciar o leitor de câmera.');
        }
      }, 300);

      return () => {
        clearTimeout(timer);
        if (html5QrCode && html5QrCode.isScanning) {
          html5QrCode.stop().catch((e) => console.error(e));
        }
      };
    }
  }, [isOpen]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      onScanSuccess(manualInput.trim());
      setManualInput('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <QrCode className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Escanear QR Code da NFC-e
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera container */}
        <div className="space-y-3">
          <div
            id="qr-reader-container"
            className="w-full h-64 bg-slate-950 rounded-2xl overflow-hidden relative flex items-center justify-center text-slate-400"
          >
            {!cameraError && (
              <div className="text-center text-xs space-y-1">
                <Camera className="w-8 h-8 mx-auto animate-pulse text-emerald-500" />
                <p>Aponte a câmera para o QR Code da Nota Fiscal...</p>
              </div>
            )}
          </div>

          {cameraError && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-300 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{cameraError}</span>
            </div>
          )}

          {/* Manual Input Fallback */}
          <form onSubmit={handleManualSubmit} className="space-y-2 pt-2">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Ou cole o link / chave de acesso (44 dígitos):
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="https://... ou 352408..."
                className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                disabled={!manualInput.trim()}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors"
              >
                Processar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

