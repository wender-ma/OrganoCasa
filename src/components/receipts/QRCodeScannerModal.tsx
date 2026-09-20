import React, { useEffect, useState, useMemo } from 'react';
import { X, QrCode, Camera, AlertCircle, FlipHorizontal, Loader2, ImagePlus, CheckCircle2, Bug } from 'lucide-react';
import { useQrScanner } from '../../hooks/useQrScanner';

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
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);

  // Ativa overlay de diagnóstico via URL (?debugScanner=1) ou localStorage
  const isDebugMode = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('debugScanner') === '1' || window.localStorage.getItem('debugScanner') === '1';
  }, []);

  const {
    videoRef,
    isStarting,
    cameraError,
    scannedCode,
    debugInfo,
    start,
    stop,
    switchCamera,
    scanImageFile,
    handleManualCode
  } = useQrScanner({
    facingMode: 'environment',
    onScanSuccess: (decodedText) => {
      // Delay visual para exibir confirmação em verde
      setTimeout(() => {
        onScanSuccess(decodedText);
        onClose();
      }, 350);
    }
  });

  // Controle de ciclo de vida do modal
  useEffect(() => {
    if (isOpen) {
      start();
    } else {
      stop();
      setGalleryError(null);
      setManualInput('');
    }
  }, [isOpen, start, stop]);

  // Upload de imagem da galeria
  const handleQrImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setGalleryLoading(true);
    setGalleryError(null);

    try {
      const result = await scanImageFile(file);
      setGalleryLoading(false);
      if (result) {
        handleManualCode(result);
      } else {
        setGalleryError('Nenhum QR Code legível foi encontrado nesta foto. Aproxime ou tente uma foto mais nítida.');
      }
    } catch {
      setGalleryLoading(false);
      setGalleryError('Falha ao processar arquivo da foto.');
    } finally {
      e.target.value = '';
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = manualInput.trim();
    if (val) {
      handleManualCode(val);
      setManualInput('');
    }
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

        {/* Viewport da Câmera (Quadrado 1:1 sem distorção) */}
        <div className="relative w-full max-w-[280px] aspect-square mx-auto bg-black rounded-2xl overflow-hidden shadow-inner border-2 border-emerald-500/30 flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover"
          />

          {/* Mira e Guias Visuais do Quadrado */}
          {!cameraError && !isStarting && !scannedCode && !galleryLoading && (
            <div className="absolute inset-4 pointer-events-none flex flex-col justify-between p-1">
              <div className="flex justify-between">
                <div className="w-8 h-8 border-t-3 border-l-3 border-emerald-400 rounded-tl-xl" />
                <div className="w-8 h-8 border-t-3 border-r-3 border-emerald-400 rounded-tr-xl" />
              </div>

              {/* Linha Laser Animada */}
              <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_8px_#10b981] animate-pulse" />

              <div className="flex justify-between">
                <div className="w-8 h-8 border-b-3 border-l-3 border-emerald-400 rounded-bl-xl" />
                <div className="w-8 h-8 border-b-3 border-r-3 border-emerald-400 rounded-br-xl" />
              </div>
            </div>
          )}

          {/* Feedback de Sucesso */}
          {scannedCode && (
            <div className="absolute inset-0 bg-emerald-950/85 backdrop-blur-xs flex flex-col items-center justify-center text-white space-y-2 z-20">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 animate-bounce" />
              <span className="text-xs font-bold">QR Code Identificado!</span>
            </div>
          )}

          {/* Estado de Carregamento / Inicialização */}
          {(isStarting || galleryLoading) && (
            <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center text-white space-y-2 z-20">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
              <span className="text-xs font-medium">
                {galleryLoading ? 'Analisando foto da galeria...' : 'Iniciando câmera...'}
              </span>
            </div>
          )}

          {/* Overlay de Diagnóstico em Tempo Real (?debugScanner=1) */}
          {isDebugMode && (
            <div className="absolute top-2 left-2 right-2 p-2 bg-black/85 backdrop-blur-xs rounded-xl border border-emerald-500/40 text-[10px] text-white font-mono space-y-0.5 z-30 pointer-events-none">
              <div className="flex items-center justify-between text-emerald-400 font-bold border-b border-white/10 pb-0.5 mb-1">
                <span className="flex items-center gap-1">
                  <Bug className="w-3 h-3" /> Scanner Debug
                </span>
                <span>{debugInfo.fps} FPS</span>
              </div>
              <div>Motor: <span className="text-amber-300">{debugInfo.engine}</span></div>
              <div>HTTPS: <span className={debugInfo.isSecureContext ? 'text-emerald-400' : 'text-rose-400'}>{debugInfo.isSecureContext ? 'Sim' : 'Não (Inseguro)'}</span></div>
              <div>ReadyState: <span className="text-cyan-300">{debugInfo.videoReadyState}</span> ({debugInfo.videoReadyState >= 2 ? 'OK' : 'Aguardando'})</div>
              <div>Resolução: <span className="text-cyan-300">{debugInfo.videoWidth}x{debugInfo.videoHeight}</span></div>
              {debugInfo.lastError && (
                <div className="text-rose-400 truncate">Erro: {debugInfo.lastError}</div>
              )}
            </div>
          )}
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={switchCamera}
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

        {/* Notificação de Erros */}
        {(cameraError || galleryError) && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-300 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{cameraError || galleryError}</span>
          </div>
        )}

        {/* Entrada Manual de Link ou Chave */}
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
