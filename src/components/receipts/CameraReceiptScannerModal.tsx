import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Camera,
  RefreshCw,
  Sparkles,
  AlertCircle,
  Loader2,
  FlipHorizontal,
  Plus,
  Trash2,
  CheckCircle2,
  Image as ImageIcon,
  ArrowRight
} from 'lucide-react';
import { ParsedReceiptData } from '../../services/receiptParser';
import { extractReceiptFromMultipleImages } from '../../services/aiReceiptExtractor';

interface CapturedPhoto {
  id: string;
  blob: Blob;
  previewUrl: string;
  approved: boolean;
}

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

  // Multi-photo list state
  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhoto[]>([]);

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
      setCapturedPhotos([]);
    }

    return () => {
      stopStream();
    };
  }, [isOpen, facingMode]);

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  // 1. Capture photo from live video stream
  const handleSnapPhoto = () => {
    if (!videoRef.current || isProcessing) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const newPhoto: CapturedPhoto = {
          id: `photo-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          blob,
          previewUrl: URL.createObjectURL(blob),
          approved: true
        };
        setCapturedPhotos((prev) => [...prev, newPhoto]);
      },
      'image/jpeg',
      0.95
    );
  };

  // 2. Add photos from local gallery files
  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newPhotos: CapturedPhoto[] = Array.from(files).map((f) => ({
      id: `photo-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      blob: f,
      previewUrl: URL.createObjectURL(f),
      approved: true
    }));

    setCapturedPhotos((prev) => [...prev, ...newPhotos]);
    e.target.value = '';
  };

  const handleToggleApproved = (id: string) => {
    setCapturedPhotos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, approved: !p.approved } : p))
    );
  };

  const handleDeletePhoto = (id: string) => {
    setCapturedPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  // 3. Process all approved photos with AI / OCR
  const handleProcessAllPhotos = async () => {
    const approved = capturedPhotos.filter((p) => p.approved);
    if (approved.length === 0) {
      setCameraError('Selecione ao menos 1 foto com status OK para processar.');
      return;
    }

    try {
      setIsProcessing(true);
      setCameraError(null);
      setProgressPercent(10);
      setProgressStatus(`Preparando ${approved.length} foto(s)...`);

      const parsedData = await extractReceiptFromMultipleImages(
        approved.map((p) => p.blob),
        (progress, status) => {
          setProgressPercent(progress);
          setProgressStatus(status);
        }
      );

      if (parsedData.items.length === 0) {
        throw new Error(
          'Não foi possível identificar os produtos nas fotos. Verifique a iluminação e nitidez do texto.'
        );
      }

      onReceiptCaptured(parsedData);
      onClose();
    } catch (error: any) {
      console.error('Erro ao processar fotos do cupom:', error);
      setCameraError(error.message || 'Falha ao processar as fotos do cupom fiscal.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  const approvedCount = capturedPhotos.filter((p) => p.approved).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-4 sm:p-5 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col space-y-3 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base leading-tight">
                Tirar Fotos do Cupom Fiscal
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Tire 1 ou mais fotos de partes do cupom (topo, meio, total)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video stream viewport */}
        <div className="relative w-full aspect-4/3 max-h-[36vh] bg-black rounded-2xl overflow-hidden flex items-center justify-center border border-slate-700">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="w-full h-full object-cover"
          />

          {/* Scanner Overlay Guide */}
          {!cameraError && !isStartingCamera && !isProcessing && (
            <div className="absolute inset-3 border-2 border-emerald-500/40 border-dashed rounded-xl pointer-events-none flex flex-col justify-between p-2">
              <div className="flex justify-between">
                <div className="w-4 h-4 border-t-2 border-l-2 border-emerald-400" />
                <div className="w-4 h-4 border-t-2 border-r-2 border-emerald-400" />
              </div>
              <div className="text-center bg-black/60 backdrop-blur-xs text-emerald-300 text-[10px] font-medium py-0.5 px-2.5 rounded-full mx-auto shadow-sm">
                Enquadre o texto do cupom com boa iluminação
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
            <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center space-y-3 z-10">
              <Sparkles className="w-10 h-10 text-emerald-400 animate-pulse" />
              <div className="space-y-1">
                <h4 className="font-semibold text-sm text-white">Analisando Cupom com IA</h4>
                <p className="text-xs text-slate-400">{progressStatus || 'Processando itens...'}</p>
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

        {/* Snap Photo & Camera Controls */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <button
            type="button"
            onClick={toggleCamera}
            disabled={isProcessing || isStartingCamera}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl transition-colors"
            title="Alternar Câmera"
          >
            <FlipHorizontal className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleSnapPhoto}
            disabled={isProcessing || isStartingCamera || !!cameraError}
            className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center space-x-1.5 transition-all active:scale-98"
          >
            <Camera className="w-4 h-4" />
            <span>+ Capturar Foto ({capturedPhotos.length + 1}ª)</span>
          </button>

          <label className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl cursor-pointer transition-colors" title="Galeria de Fotos">
            <ImageIcon className="w-4 h-4" />
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileAttach}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={startCamera}
            disabled={isProcessing || isStartingCamera}
            className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl transition-colors"
            title="Recarregar Câmera"
          >
            <RefreshCw className={`w-4 h-4 ${isStartingCamera ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Captured Photos Gallery Strip */}
        <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800 dark:text-slate-200">
              Fotos Capturadas ({capturedPhotos.length})
            </span>
            <span className="text-[11px] text-slate-400">
              {approvedCount} selecionada(s) para análise
            </span>
          </div>

          {capturedPhotos.length === 0 ? (
            <div className="p-3 bg-slate-50 dark:bg-slate-850 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-center text-xs text-slate-400">
              Nenhuma foto capturada ainda. Aponte a câmera e clique em <strong>+ Capturar Foto</strong>.
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-36 overflow-y-auto p-1 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800">
              {capturedPhotos.map((photo, index) => (
                <div
                  key={photo.id}
                  className={`relative rounded-xl overflow-hidden border-2 transition-all group ${
                    photo.approved
                      ? 'border-emerald-500 shadow-xs'
                      : 'border-slate-300 opacity-60'
                  }`}
                >
                  <img
                    src={photo.previewUrl}
                    alt={`Foto ${index + 1}`}
                    className="w-full h-20 object-cover"
                  />

                  {/* Top Badges */}
                  <span className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/70 text-white rounded text-[10px] font-bold">
                    #{index + 1}
                  </span>

                  {/* Actions overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1.5 transition-opacity">
                    <button
                      type="button"
                      onClick={() => handleToggleApproved(photo.id)}
                      className={`p-1 rounded-lg text-white ${
                        photo.approved ? 'bg-emerald-600' : 'bg-slate-600'
                      }`}
                      title={photo.approved ? 'Desmarcar' : 'Aprovar'}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePhoto(photo.id)}
                      className="p-1 bg-rose-600 hover:bg-rose-700 rounded-lg text-white"
                      title="Excluir Foto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Selection footer toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggleApproved(photo.id)}
                    className={`w-full py-1 text-[10px] font-bold block text-center ${
                      photo.approved
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {photo.approved ? '✓ OK' : 'Ignorar'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Error Notification */}
        {cameraError && (
          <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-800 dark:text-rose-300 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{cameraError}</span>
          </div>
        )}

        {/* Process All Photos Button */}
        <div className="pt-1">
          <button
            type="button"
            onClick={handleProcessAllPhotos}
            disabled={isProcessing || approvedCount === 0}
            className="w-full py-3 px-5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 text-white rounded-2xl font-bold text-xs sm:text-sm shadow-lg shadow-emerald-600/25 flex items-center justify-center space-x-2 transition-all active:scale-98"
          >
            <Sparkles className="w-4 h-4" />
            <span>Processar {approvedCount} Foto(s) Selecionada(s)</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};