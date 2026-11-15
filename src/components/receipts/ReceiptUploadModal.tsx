import React, { useState, useCallback } from 'react';
import {
  X,
  Camera,
  QrCode,
  UploadCloud,
  FileText,
  AlertCircle,
  Sparkles,
  Loader2,
  Key,
  KeyRound,
  Video,
  ExternalLink,
  Clipboard,
  Check,
  ScanBarcode
} from 'lucide-react';
import {
  parseSEFAZXml,
  parseQRCodeUrl,
  parseReceiptTextHeuristics,
  ParsedReceiptData
} from '../../services/receiptParser';
import {
  formatAccessKey,
  inspectAccessKey,
  KeyInspection
} from '../../services/nfceClassifier';
import {
  extractReceiptFromMultipleImages,
  getGeminiApiKey,
  saveGeminiApiKey
} from '../../services/aiReceiptExtractor';
import { QRCodeScannerModal } from './QRCodeScannerModal';
import { CameraReceiptScannerModal } from './CameraReceiptScannerModal';

interface ReceiptUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReceiptParsed: (data: ParsedReceiptData) => void;
}

export const ReceiptUploadModal: React.FC<ReceiptUploadModalProps> = ({
  isOpen,
  onClose,
  onReceiptParsed
}) => {
  const [activeTab, setActiveTab] = useState<'qr' | 'ocr' | 'key' | 'demo'>('qr');
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string>('');
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [isLiveCameraOpen, setIsLiveCameraOpen] = useState(false);
  const [qrTextInput, setQrTextInput] = useState('');

  // Chave de Acesso (44 Dígitos) state
  const [accessKeyInput, setAccessKeyInput] = useState('');
  const [keyInspection, setKeyInspection] = useState<KeyInspection | null>(null);
  const [pastedSefazText, setPastedSefazText] = useState('');
  const [showPastedSection, setShowPastedSection] = useState(false);
  const [copiedKeySuccess, setCopiedKeySuccess] = useState(false);

  // Gemini API Key config
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [geminiKeyInput, setGeminiKeyInput] = useState(getGeminiApiKey());

  // Callbacks memoizados no topo para respeitar as Regras dos Hooks do React (Invariante F)
  const handleProcessQR = useCallback(
    async (qrString: string) => {
      setIsProcessing(true);
      setOcrStatus('Consultando NFC-e na SEFAZ...');
      setErrorMessage(null);

      try {
        console.log('[ReceiptUploadModal] Processando QR Code / Chave:', qrString);
        const parsed = await parseQRCodeUrl(qrString);
        onReceiptParsed(parsed);
        onClose();
      } catch (err: any) {
        console.warn('[ReceiptUploadModal] Erro ao processar QR Code:', err);
        setErrorMessage(
          err.message ||
            'Não foi possível ler os produtos do link da NFC-e. Use a aba "Foto / PDF" para ler o cupom com IA.'
        );
      } finally {
        setIsProcessing(false);
        setOcrStatus('');
      }
    },
    [onReceiptParsed, onClose]
  );

  const handleCloseScanner = useCallback(() => {
    setIsCameraScannerOpen(false);
  }, []);

  const handleSwitchToKey = useCallback(() => {
    setIsCameraScannerOpen(false);
    setActiveTab('key');
  }, []);

  const handleScannerSuccess = useCallback(
    (code: string) => {
      handleProcessQR(code);
    },
    [handleProcessQR]
  );

  const handleProcessFilesList = useCallback(
    async (fileList: File[]) => {
      if (fileList.length === 0) return;

      setIsProcessing(true);
      setErrorMessage(null);
      setOcrProgress(10);

      try {
        // Compatibilidade invisível caso alguém envie um arquivo .xml
        const xmlFile = fileList.find(
          (f) => f.name.toLowerCase().endsWith('.xml') || f.type === 'text/xml' || f.type === 'application/xml'
        );
        if (xmlFile) {
          setOcrStatus('Lendo arquivo XML da nota fiscal...');
          const text = await xmlFile.text();
          const parsedXml = parseSEFAZXml(text);
          if (parsedXml.items.length === 0) {
            throw new Error('Nenhum produto foi encontrado no arquivo XML.');
          }
          onReceiptParsed(parsedXml);
          onClose();
          return;
        }

        const hasPdf = fileList.some(
          (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
        );
        setOcrStatus(
          hasPdf
            ? 'Extraindo produtos do PDF com IA Multimodal...'
            : `Analisando ${fileList.length} foto(s) do cupom com IA Multimodal...`
        );

        const parsedData = await extractReceiptFromMultipleImages(fileList, (prog, status) => {
          setOcrProgress(prog);
          setOcrStatus(status);
        });

        if (parsedData.items.length === 0) {
          if (parsedData.accessKey && parsedData.accessKey.length === 44) {
            const byKey = await parseQRCodeUrl(parsedData.accessKey);
            onReceiptParsed(byKey);
            onClose();
            return;
          }
          throw new Error(
            'Não foi possível identificar os produtos nesta imagem/PDF. Tente aproximar a foto da lista de itens ou enviar um PDF legível.'
          );
        }

        onReceiptParsed(parsedData);
        onClose();
      } catch (err: any) {
        console.warn('Erro na extração de foto/PDF:', err);
        setErrorMessage(err.message || 'Erro no reconhecimento da foto ou PDF da nota fiscal.');
      } finally {
        setIsProcessing(false);
        setOcrProgress(0);
        setOcrStatus('');
      }
    },
    [onReceiptParsed, onClose]
  );

  const handleFallbackPhotoFromQrModal = useCallback(
    (file: File) => {
      setActiveTab('ocr');
      handleProcessFilesList([file]);
    },
    [handleProcessFilesList]
  );

  const handleKeyInputChange = useCallback((val: string) => {
    const formatted = formatAccessKey(val);
    setAccessKeyInput(formatted);
    setKeyInspection(inspectAccessKey(val));
  }, []);

  const handlePasteKey = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        handleKeyInputChange(text);
        setCopiedKeySuccess(true);
        setTimeout(() => setCopiedKeySuccess(false), 2000);
      }
    } catch {}
  }, [handleKeyInputChange]);

  const handleOpenSefazWithCopiedKey = useCallback(() => {
    const cleanKey = accessKeyInput.replace(/\D/g, '');
    if (
      cleanKey.length === 44 &&
      typeof navigator !== 'undefined' &&
      navigator.clipboard?.writeText
    ) {
      navigator.clipboard.writeText(cleanKey).catch(() => {});
      setCopiedKeySuccess(true);
      setTimeout(() => setCopiedKeySuccess(false), 2500);
    }
    window.open(
      'https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfe/consulta-completa',
      '_blank',
      'noopener,noreferrer'
    );
  }, [accessKeyInput]);

  const handleSubmitKey = useCallback(() => {
    const cleanKey = accessKeyInput.replace(/\D/g, '');
    if (cleanKey.length === 44) {
      handleProcessQR(cleanKey);
    }
  }, [accessKeyInput, handleProcessQR]);

  const handleProcessPastedText = useCallback(() => {
    if (!pastedSefazText.trim()) return;
    setIsProcessing(true);
    setErrorMessage(null);
    setOcrStatus('Processando tabela copiada da SEFAZ...');
    try {
      const parsed = parseReceiptTextHeuristics(pastedSefazText);
      const cleanKey = accessKeyInput.replace(/\D/g, '');
      if (cleanKey.length === 44) {
        parsed.accessKey = cleanKey;
      }
      if (parsed.items.length === 0) {
        setErrorMessage(
          'Nenhum produto identificado no texto colado. Copie as linhas com Nome, Qtde e Valor da página da SEFAZ ou envie uma foto do cupom.'
        );
        return;
      }
      onReceiptParsed(parsed);
      onClose();
    } catch (e: any) {
      setErrorMessage(e.message || 'Não foi possível extrair produtos do texto colado.');
    } finally {
      setIsProcessing(false);
      setOcrStatus('');
    }
  }, [pastedSefazText, accessKeyInput, onReceiptParsed, onClose]);

  if (!isOpen) return null;

  const handleImageOrPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    e.target.value = '';
    await handleProcessFilesList(list);
  };

  // Demo sample receipts for quick testing
  const handleLoadDemoReceiptGO = () => {
    const demoData: ParsedReceiptData = {
      storeName: 'Hipermercado Goiás Alimentos (Goiânia - GO)',
      accessKey: '52240901234567000199650010001234561001234564',
      totalAmount: 142.3,
      purchaseDate: new Date().toISOString(),
      rawType: 'qr_code',
      items: [
        {
          name: 'ARROZ CRISTAL TIPO 1 5KG',
          barcode: '7896001234567',
          quantity: 1,
          unitPrice: 32.9,
          totalPrice: 32.9,
          unit: 'pct'
        },
        {
          name: 'FEIJAO CARIOCA BARAO 1KG',
          barcode: '7896001234568',
          quantity: 2,
          unitPrice: 8.5,
          totalPrice: 17.0,
          unit: 'pct'
        },
        {
          name: 'LEITE INTEGRAL PIRACANJUBA 1L',
          barcode: '7896001234569',
          quantity: 6,
          unitPrice: 5.19,
          totalPrice: 31.14,
          unit: 'cx'
        },
        {
          name: 'ACUCAR CRISTAL ITAMARATY 5KG',
          quantity: 1,
          unitPrice: 19.8,
          totalPrice: 19.8,
          unit: 'pct'
        },
        {
          name: 'OLEO DE SOJA SOYA 900ML',
          quantity: 2,
          unitPrice: 6.89,
          totalPrice: 13.78,
          unit: 'un'
        },
        {
          name: 'CAFE RANCHERO TRADICIONAL 500G',
          quantity: 2,
          unitPrice: 13.84,
          totalPrice: 27.68,
          unit: 'pct'
        }
      ]
    };

    onReceiptParsed(demoData);
    onClose();
  };

  const handleLoadDemoReceipt = () => {
    const demoData: ParsedReceiptData = {
      storeName: 'Supermercado Central Gourmet',
      accessKey: '35260812345678000199650010001234561001234563',
      totalAmount: 118.9,
      purchaseDate: new Date().toISOString(),
      rawType: 'qr_code',
      items: [
        {
          name: 'Arroz Branco Tipo 1 5kg',
          barcode: '7891234567890',
          quantity: 1,
          unitPrice: 29.9,
          totalPrice: 29.9,
          unit: 'pct'
        },
        {
          name: 'Feijão Carioca 1kg',
          barcode: '7891234567891',
          quantity: 2,
          unitPrice: 7.99,
          totalPrice: 15.98,
          unit: 'pct'
        },
        {
          name: 'Leite Integral UHT 1L',
          barcode: '7891234567892',
          quantity: 6,
          unitPrice: 4.89,
          totalPrice: 29.34,
          unit: 'cx'
        },
        {
          name: 'Chocolate Barra 90g',
          quantity: 2,
          unitPrice: 6.5,
          totalPrice: 13.0,
          unit: 'un'
        },
        {
          name: 'Sabonete em Barra 90g',
          quantity: 4,
          unitPrice: 2.8,
          totalPrice: 11.2,
          unit: 'un'
        }
      ]
    };

    onReceiptParsed(demoData);
    onClose();
  };

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    saveGeminiApiKey(geminiKeyInput);
    setShowKeyModal(false);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom duration-200">
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <UploadCloud className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Ler Nota Fiscal do Mercado
              </h3>
            </div>
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setShowKeyModal(true)}
                className="p-2 text-slate-400 hover:text-emerald-600 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Chave Personalizada de IA Gemini (Opcional — IA do Servidor já está ativa)"
              >
                <Key className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Simplified Input Methods Tabs (4 Tabs: QR Code, Foto / PDF, Chave 44D, Exemplo) */}
          <div className="grid grid-cols-4 p-2 bg-slate-100 dark:bg-slate-850 gap-1 border-b border-slate-200 dark:border-slate-800">
            <button
              onClick={() => {
                setErrorMessage(null);
                setActiveTab('qr');
              }}
              className={`py-2 px-1 text-center rounded-xl text-[11px] font-bold transition-all flex flex-col items-center justify-center space-y-1 ${
                activeTab === 'qr'
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>QR Code</span>
            </button>

            <button
              onClick={() => {
                setErrorMessage(null);
                setActiveTab('ocr');
              }}
              className={`py-2 px-1 text-center rounded-xl text-[11px] font-bold transition-all flex flex-col items-center justify-center space-y-1 ${
                activeTab === 'ocr'
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>Foto / PDF</span>
            </button>

            <button
              onClick={() => {
                setErrorMessage(null);
                setActiveTab('key');
              }}
              className={`py-2 px-1 text-center rounded-xl text-[11px] font-bold transition-all flex flex-col items-center justify-center space-y-1 ${
                activeTab === 'key'
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              <span>Chave 44D</span>
            </button>

            <button
              onClick={() => {
                setErrorMessage(null);
                setActiveTab('demo');
              }}
              className={`py-2 px-1 text-center rounded-xl text-[11px] font-bold transition-all flex flex-col items-center justify-center space-y-1 ${
                activeTab === 'demo'
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Exemplo</span>
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-5 flex-1 overflow-y-auto space-y-4">
            {errorMessage && (
              <div className="p-3.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-2xl text-rose-800 dark:text-rose-300 text-xs flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {isProcessing ? (
              <div className="py-12 text-center space-y-3">
                <Loader2 className="w-10 h-10 animate-spin text-emerald-500 mx-auto" />
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                    {ocrStatus || 'Processando Nota Fiscal...'}
                  </p>
                  {ocrProgress > 0 && (
                    <div className="w-48 mx-auto bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full transition-all duration-200"
                        style={{ width: `${ocrProgress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                {activeTab === 'qr' && (
                  <div className="space-y-4 text-center">
                    <div className="p-6 bg-emerald-50 dark:bg-emerald-950/40 rounded-3xl border border-dashed border-emerald-300 dark:border-emerald-800 space-y-3">
                      <QrCode className="w-12 h-12 text-emerald-600 dark:text-emerald-400 mx-auto" />
                      <div className="space-y-1">
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                          Escanear com a Câmera do Celular
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                          Aponte para o QR Code impresso no final do cupom da NFC-e (suporta Zoom 2x para foco nítido).
                        </p>
                      </div>
                      <button
                        onClick={() => setIsCameraScannerOpen(true)}
                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 inline-flex items-center space-x-2"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Abrir Leitor de QR Code</span>
                      </button>
                    </div>

                    {/* Quick Jump to Photo/PDF AI Tab when QR is damaged or SEFAZ is down */}
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-2xl flex items-center justify-between text-left">
                      <div className="flex items-center space-x-2.5">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900 rounded-xl text-indigo-600 dark:text-indigo-400 shrink-0">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                          <h5 className="font-bold text-slate-900 dark:text-white text-xs">
                            QR Code amassado ou falhando?
                          </h5>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Tire 1 foto do cupom ou envie o PDF que a IA lê tudo!
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveTab('ocr')}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shrink-0 transition-colors shadow-xs"
                      >
                        Foto / PDF
                      </button>
                    </div>

                    <div className="pt-2 text-left">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Ou digite/cole a URL da NFC-e ou chave de 44 dígitos:
                      </label>
                      <div className="flex space-x-2">
                        <input
                          type="text"
                          value={qrTextInput}
                          onChange={(e) => setQrTextInput(e.target.value)}
                          placeholder="Ex: http://nfce.fazenda... ou 5226..."
                          className="flex-1 px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500"
                        />
                        <button
                          onClick={() => handleProcessQR(qrTextInput)}
                          disabled={!qrTextInput.trim()}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl"
                        >
                          Ler Link
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'ocr' && (
                  <div className="space-y-3 text-center">
                    {/* Live Guided Camera Button */}
                    <div className="p-5 bg-gradient-to-br from-emerald-600 to-teal-700 rounded-3xl text-white space-y-2 shadow-lg shadow-emerald-700/20">
                      <Video className="w-8 h-8 mx-auto" />
                      <h4 className="font-bold text-sm">Tirar Foto do Cupom (IA Automática)</h4>
                      <p className="text-xs text-emerald-100 max-w-xs mx-auto">
                        Fotografe o papel térmico (mesmo amassado ou sem QR Code) e nossa IA extrai todos os produtos automaticamente.
                      </p>
                      <button
                        onClick={() => setIsLiveCameraOpen(true)}
                        className="px-5 py-2.5 bg-white text-emerald-800 rounded-xl text-xs font-bold shadow-md inline-flex items-center space-x-2 active:scale-95 transition-transform"
                      >
                        <Camera className="w-4 h-4 text-emerald-600" />
                        <span>Abrir Câmera do Cupom</span>
                      </button>
                    </div>

                    <div className="relative flex py-1 items-center">
                      <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
                      <span className="flex-shrink mx-3 text-[11px] text-slate-400 uppercase font-semibold">
                        ou envie PDF ou foto salva
                      </span>
                      <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
                    </div>

                    {/* Upload PDF or Image from Gallery / Files */}
                    <label className="block p-5 bg-slate-50 dark:bg-slate-850 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 cursor-pointer transition-colors">
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <FileText className="w-7 h-7 text-emerald-600" />
                        <Camera className="w-7 h-7 text-indigo-600" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-0.5">
                        Enviar PDF da Nota ou Fotos da Galeria
                      </span>
                      <span className="text-[11px] text-slate-400 block mb-2.5">
                        Aceita arquivos <strong>.PDF</strong> (DANFE / apps de mercado) ou 1 ou mais fotos (<strong>JPG, PNG, HEIC</strong>)
                      </span>
                      <span className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-block shadow-xs">
                        Escolher Foto ou PDF
                      </span>
                      <input
                        type="file"
                        multiple
                        accept="image/*,application/pdf,.pdf,.xml,text/xml"
                        onChange={handleImageOrPdfUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}

                {activeTab === 'key' && (
                  <div className="space-y-4 text-left">
                    {/* Quick Camera Action for 44-Digit Key / Barcode / Receipt Photo */}
                    <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-emerald-800 dark:text-emerald-300 font-bold text-xs">
                          <ScanBarcode className="w-4 h-4 text-emerald-600" />
                          <span>Sem digitar 44 números manualmente!</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                        Escaneie o código de barras da chave ou tire 1 foto do cupom para extrair a chave e os produtos de uma só vez:
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setIsCameraScannerOpen(true)}
                          className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                        >
                          <ScanBarcode className="w-3.5 h-3.5" />
                          <span>Ler Código de Barras</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsLiveCameraOpen(true)}
                          className="py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Fotografar Cupom (IA)</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Ou digite/cole a Chave de 44 dígitos:
                        </label>
                        <span
                          className={`text-[11px] font-mono font-bold ${
                            keyInspection?.isValid
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {keyInspection?.digitsCount || 0} / 44 dígitos
                        </span>
                      </div>

                      <div className="relative flex items-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={accessKeyInput}
                          onChange={(e) => handleKeyInputChange(e.target.value)}
                          placeholder="5226 0945 5439 1502 7896 6507 9000 0946 1011 2410 8858"
                          className="w-full pl-3.5 pr-20 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono tracking-wide focus:ring-2 focus:ring-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={handlePasteKey}
                          className="absolute right-2 px-2.5 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors"
                        >
                          {copiedKeySuccess ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-500" />
                              <span>Colado!</span>
                            </>
                          ) : (
                            <>
                              <Clipboard className="w-3 h-3" />
                              <span>Colar</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Live Key Inspector Card */}
                    {keyInspection && keyInspection.digitsCount >= 4 && (
                      <div className="p-3.5 bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-2 text-xs">
                        <span className="font-bold text-slate-700 dark:text-slate-300 text-[11px] uppercase tracking-wide block">
                          Metadados da Nota Fiscal
                        </span>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="p-2 bg-white dark:bg-slate-850 rounded-xl">
                            <span className="text-slate-400 block text-[10px]">Estado (UF)</span>
                            <strong className="text-slate-900 dark:text-slate-100">
                              {keyInspection.stateName || 'Goiás (GO)'}
                            </strong>
                          </div>
                          <div className="p-2 bg-white dark:bg-slate-850 rounded-xl">
                            <span className="text-slate-400 block text-[10px]">Emissão</span>
                            <strong className="text-slate-900 dark:text-slate-100">
                              {keyInspection.emissionMonth
                                ? `${String(keyInspection.emissionMonth).padStart(2, '0')}/${keyInspection.emissionYear}`
                                : '--/----'}
                            </strong>
                          </div>
                          <div className="p-2 bg-white dark:bg-slate-850 rounded-xl">
                            <span className="text-slate-400 block text-[10px]">
                              CNPJ do Estabelecimento
                            </span>
                            <strong className="text-slate-900 dark:text-slate-100 font-mono">
                              {keyInspection.cnpjFormatted || '---'}
                            </strong>
                          </div>
                          <div className="p-2 bg-white dark:bg-slate-850 rounded-xl">
                            <span className="text-slate-400 block text-[10px]">
                              Modelo do Documento
                            </span>
                            <strong className="text-slate-900 dark:text-slate-100">
                              {keyInspection.modelLabel || 'NFC-e'}
                            </strong>
                          </div>
                        </div>
                        {keyInspection.digitsCount === 44 && keyInspection.errorReason && (
                          <div className="p-2.5 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-300 text-[11px] flex items-start space-x-1.5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                            <span>{keyInspection.errorReason}</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="space-y-2 pt-1">
                      <button
                        type="button"
                        onClick={handleSubmitKey}
                        disabled={!keyInspection?.isValid || isProcessing}
                        className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 flex items-center justify-center space-x-2 transition-all"
                      >
                        <KeyRound className="w-4 h-4" />
                        <span>Identificar Nota Fiscal (44 Dígitos)</span>
                      </button>

                      <div className="flex items-center justify-between pt-1 text-[11px]">
                        <span className="text-slate-400">Portal oficial da Fazenda:</span>
                        <button
                          type="button"
                          onClick={handleOpenSefazWithCopiedKey}
                          className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
                          title="Copia a chave e abre o portal da SEFAZ"
                        >
                          <span>Copiar Chave & Abrir SEFAZ-GO</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Collapsible Area for Pasted Table Text */}
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => setShowPastedSection((prev) => !prev)}
                        className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 font-medium"
                      >
                        <span>
                          {showPastedSection ? '▼' : '▶'} Copiou os itens da tela da SEFAZ? Colar aqui
                        </span>
                      </button>

                      {showPastedSection && (
                        <div className="space-y-2 mt-2 pt-1 animate-in slide-in-from-top-2 duration-150">
                          <textarea
                            rows={4}
                            value={pastedSefazText}
                            onChange={(e) => setPastedSefazText(e.target.value)}
                            placeholder="Selecione o texto ou tabela na página da SEFAZ, copie e cole aqui para extrair todos os produtos automaticamente..."
                            className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={handleProcessPastedText}
                            disabled={!pastedSefazText.trim()}
                            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors"
                          >
                            Extrair Produtos do Texto Colado
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'demo' && (
                  <div className="space-y-3">
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-200 dark:border-emerald-800 space-y-2 text-left">
                      <div className="flex items-center space-x-2">
                        <div className="p-1.5 bg-emerald-100 dark:bg-emerald-900 rounded-lg text-emerald-700 dark:text-emerald-300">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                            Cupom Real de Goiás (SEFAZ-GO)
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Arroz Cristal, Feijão Barão, Leite Piracanjuba, Açúcar, Óleo, Café (6 itens - R$ 142,30)
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleLoadDemoReceiptGO}
                        className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 flex items-center justify-center space-x-1.5 transition-all"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Carregar Cupom de Goiás (SEFAZ-GO)</span>
                      </button>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2 text-left">
                      <div className="flex items-center space-x-2">
                        <div className="p-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg text-slate-700 dark:text-slate-300">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                            Cupom Geral Supermercado
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Arroz, Feijão, Leite, Chocolate e Sabonete (5 itens - R$ 118,90)
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleLoadDemoReceipt}
                        className="w-full py-2.5 px-4 bg-slate-700 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-all"
                      >
                        <span>Carregar Cupom Geral</span>
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* QR Camera Modal */}
          <QRCodeScannerModal
            isOpen={isCameraScannerOpen}
            onClose={handleCloseScanner}
            onScanSuccess={handleScannerSuccess}
            onSwitchToKey={handleSwitchToKey}
            onFallbackPhotoExtract={handleFallbackPhotoFromQrModal}
          />

          {/* Live Receipt AI Camera Modal */}
          <CameraReceiptScannerModal
            isOpen={isLiveCameraOpen}
            onClose={() => setIsLiveCameraOpen(false)}
            onReceiptCaptured={(data) => {
              onReceiptParsed(data);
              onClose();
            }}
          />

          {/* Gemini API Key Configuration Modal */}
          {showKeyModal && (
            <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Key className="w-4 h-4 text-emerald-600" />
                    <span>Chave da API Gemini (Opcional)</span>
                  </h4>
                  <button onClick={() => setShowKeyModal(false)} className="text-slate-400">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  A leitura por IA já funciona automaticamente pelo servidor. Se desejar usar uma chave própria do Google AI Studio, informe abaixo:
                </p>
                <form onSubmit={handleSaveKey} className="space-y-3 pt-1">
                  <input
                    type="password"
                    value={geminiKeyInput}
                    onChange={(e) => setGeminiKeyInput(e.target.value)}
                    placeholder="AIzaSy... (deixe em branco para usar o servidor padrão)"
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowKeyModal(false)}
                      className="px-3 py-1.5 text-xs text-slate-500"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-xs"
                    >
                      Salvar Chave
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
