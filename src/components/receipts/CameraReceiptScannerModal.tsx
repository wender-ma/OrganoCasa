import React, { useEffect, useRef, useState } from 'react';
import { X, Camera, RefreshCw, Sparkles, AlertCircle, Loader2, FlipHorizontal } from 'lucide-react';
import { ParsedReceiptData } from '../../services/receiptParser';
import { extractReceiptWithAI } from '../../services/aiReceiptExtractor';

interface CameraReceiptScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReceiptCaptured: (data: ParsedReceiptData) => void;
}

export const CameraReceiptScannerModal: React.FC<CameraReceiptScannerModalProps> = ({
  isOpen,
  onClose,
  onReceiptCaptured
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startCamera = async () => {
    stopStream();
    setIsStartingCamera(true);
    setCameraError(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Acesso à câmera não é suportado pelo seu navegador.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: any) {
      console.error('Erro ao acessar a câmera:', err);
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Permissão de câmera negada. Permita o acesso nas configurações do navegador.'
          : 'Não foi possível acessar a câmera do dispositivo.'
      );
    } finally {
      setIsStartingCamera(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopStream();
      setIsProcessing(false);
      setProgressStatus('');
      setProgressPercent(0);
    }

    return () => {
      stopStream();
    };
  }, [isOpen, facingMode]);

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const handleCapture = async () => {
    if (!videoRef.current || isProcessing) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          setCameraError('Erro ao capturar imagem da câmera.');
          return;
        }

        try {
          setIsProcessing(true);
          setProgressPercent(10);
          setProgressStatus('Imagem capturada! Processando com IA...');

          const parsedData = await extractReceiptWithAI(blob, (progress, status) => {
            setProgressPercent(progress);
            setProgressStatus(status);
          });

          onReceiptCaptured(parsedData);
          onClose();
        } catch (error: any) {
          console.error('Erro ao extrair dados do cupom:', error);
          setCameraError(error.message || 'Falha ao processar o cupom fiscal.');
        } finally {
          setIsProcessing(false);
        }
      },
      'image/jpeg',
      0.92
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col space-y-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Fotografar Cupom Fiscal
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Enquadre o cupom para leitura automática via IA
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video stream viewport */}
        <div className="relative w-full aspect-3/4 max-h-[50vh] bg-black rounded-2xl overflow-hidden flex items-center justify-center border border-slate-700">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover"
          />

          {/* Scanner Overlay Guide */}
          {!cameraError && !isStartingCamera && !isProcessing && (
            <div className="absolute inset-4 border-2 border-emerald-500/50 border-dashed rounded-xl pointer-events-none flex flex-col justify-between p-3">
              <div className="flex justify-between">
                <div className="w-4 h-4 border-t-2 border-l-2 border-emerald-400" />
                <div className="w-4 h-4 border-t-2 border-r-2 border-emerald-400" />
              </div>
              <div className="text-center bg-black/60 backdrop-blur-xs text-emerald-300 text-[11px] font-medium py-1 px-3 rounded-full mx-auto shadow-sm">
                Posicione o cupom dentro da moldura
              </div>
              <div className="flex justify-between">
                <div className="w-4 h-4 border-b-2 border-l-2 border-emerald-400" />
                <div className="w-4 h-4 border-b-2 border-r-2 border-emerald-400" />
              </div>
            </div>
          )}

          {/* Loading Camera State */}
          {isStartingCamera && (
            <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center text-slate-400 space-y-2">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
              <span className="text-xs">Iniciando câmera...</span>
            </div>
          )}

          {/* Processing with AI State */}
          {isProcessing && (
            <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center space-y-3 z-10">
              <div className="relative">
                <Sparkles className="w-10 h-10 text-emerald-400 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-sm text-white">Processando Cupom Fiscal</h4>
                <p className="text-xs text-slate-400">{progressStatus || 'Analisando itens...'}</p>
              </div>
              <div className="w-48 bg-slate-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${Math.max(progressPercent, 10)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Error Notification */}
        {cameraError && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-300 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span>{cameraError}</span>
              <button
                onClick={startCamera}
                className="mt-1 block underline font-semibold text-emerald-600 dark:text-emerald-400"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        )}

        {/* Actions Bottom Bar */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={toggleCamera}
            disabled={isProcessing || isStartingCamera}
            className="p-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-2xl transition-colors disabled:opacity-40"
            title="Trocar Câmera"
          >
            <FlipHorizontal className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={handleCapture}
            disabled={isProcessing || isStartingCamera || !!cameraError}
            className="flex-1 py-3 px-5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl font-bold text-sm shadow-lg shadow-emerald-600/25 flex items-center justify-center space-x-2 transition-all active:scale-98"
          >
            <Camera className="w-5 h-5" />
            <span>Tirar Foto e Analisar</span>
          </button>

          <button
            type="button"
            onClick={startCamera}
            disabled={isProcessing || isStartingCamera}
            className="p-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-2xl transition-colors disabled:opacity-40"
            title="Recarregar Câmera"
          >
            <RefreshCw className={`w-5 h-5 ${isStartingCamera ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </div>
  );
};