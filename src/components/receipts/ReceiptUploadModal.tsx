import React, { useState } from 'react';
import {
  X,
  FileCode,
  Camera,
  QrCode,
  UploadCloud,
  FileText,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Loader2,
  Key,
  Video
} from 'lucide-react';
import {
  parseSEFAZXml,
  parseQRCodeUrl,
  ParsedReceiptData
} from '../../services/receiptParser';
import {
  extractReceiptWithAI,
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
  const [activeTab, setActiveTab] = useState<'qr' | 'xml' | 'ocr' | 'demo'>('qr');
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrStatus, setOcrStatus] = useState<string>('');
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [isLiveCameraOpen, setIsLiveCameraOpen] = useState(false);
  const [qrTextInput, setQrTextInput] = useState('');

  // Gemini API Key config
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [geminiKeyInput, setGeminiKeyInput] = useState(getGeminiApiKey());

  if (!isOpen) return null;

  // 1. Process XML File
  const handleXmlUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const text = await file.text();
      const parsedData = parseSEFAZXml(text);
      if (parsedData.items.length === 0) {
        throw new Error('Nenhum produto foi encontrado no XML.');
      }
      onReceiptParsed(parsedData);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao processar o arquivo XML.');
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Process Receipt Image via AI / OCR
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setErrorMessage(null);
    setOcrProgress(10);
    setOcrStatus('Preparando imagem do cupom...');

    try {
      const parsedData = await extractReceiptWithAI(file, (prog, status) => {
        setOcrProgress(prog);
        setOcrStatus(status);
      });

      if (parsedData.items.length === 0) {
        throw new Error('Não foi possível identificar os produtos na foto. Tente uma imagem mais nítida ou use o QR Code.');
      }

      onReceiptParsed(parsedData);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro no reconhecimento da foto do cupom.');
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. Process QR Code text / URL
  const handleProcessQR = async (qrString: string) => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const parsed = await parseQRCodeUrl(qrString);
      onReceiptParsed(parsed);
      onClose();
    } catch (err: any) {
      setErrorMessage('Erro ao processar o link da NFC-e.');
    } finally {
      setIsProcessing(false);
    }
  };

  // 4. Demo sample receipt for quick testing
  const handleLoadDemoReceipt = () => {
    const demoData: ParsedReceiptData = {
      storeName: 'Supermercado Central Gourmet',
      accessKey: '35260812345678000199650010001234561001234567',
      totalAmount: 118.90,
      purchaseDate: new Date().toISOString(),
      rawType: 'qr_code',
      items: [
        {
          name: 'Arroz Branco Tipo 1 5kg',
          barcode: '7891234567890',
          quantity: 1,
          unitPrice: 29.90,
          totalPrice: 29.90,
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
          unitPrice: 6.50,
          totalPrice: 13.00,
          unit: 'un'
        },
        {
          name: 'Sabonete em Barra 90g',
          quantity: 4,
          unitPrice: 2.80,
          totalPrice: 11.20,
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
                title="Configurar Chave de IA Gemini (Opcional)"
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

          {/* Input Methods Tabs */}
          <div className="grid grid-cols-4 p-2 bg-slate-100 dark:bg-slate-850 gap-1 border-b border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setActiveTab('qr')}
              className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center space-y-1 ${
                activeTab === 'qr'
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <QrCode className="w-4 h-4" />
              <span>QR Code</span>
            </button>

            <button
              onClick={() => setActiveTab('ocr')}
              className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center space-y-1 ${
                activeTab === 'ocr'
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>Foto / IA</span>
            </button>

            <button
              onClick={() => setActiveTab('xml')}
              className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center space-y-1 ${
                activeTab === 'xml'
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <FileCode className="w-4 h-4" />
              <span>XML NF-e</span>
            </button>

            <button
              onClick={() => setActiveTab('demo')}
              className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition-all flex flex-col items-center justify-center space-y-1 ${
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
                          Aponte para o QR Code impresso no final do cupom da NFC-e da SEFAZ.
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

                    <div className="pt-2 text-left">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Ou digite/cole a URL da NFC-e ou chave de 44 dígitos:
                      </label>
                      <div className="flex space-x-2">
                        <input
                          type="text"
                          value={qrTextInput}
                          onChange={(e) => setQrTextInput(e.target.value)}
                          placeholder="Ex: http://nfce.fazenda... ou 3524..."
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
                      <h4 className="font-bold text-sm">Scanner Guiado com Câmera</h4>
                      <p className="text-xs text-emerald-100 max-w-xs mx-auto">
                        Enquadre o cupom diretamente com guias visuais e capture para processamento com IA.
                      </p>
                      <button
                        onClick={() => setIsLiveCameraOpen(true)}
                        className="px-5 py-2.5 bg-white text-emerald-800 rounded-xl text-xs font-bold shadow-md inline-flex items-center space-x-2 active:scale-95 transition-transform"
                      >
                        <Camera className="w-4 h-4 text-emerald-600" />
                        <span>Abrir Câmera Guiada</span>
                      </button>
                    </div>

                    <div className="relative flex py-1 items-center">
                      <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
                      <span className="flex-shrink mx-3 text-[11px] text-slate-400 uppercase font-semibold">
                        ou envie uma foto salva
                      </span>
                      <div className="flex-grow border-t border-slate-200 dark:border-slate-700"></div>
                    </div>

                    {/* Upload from Gallery / File */}
                    <label className="block p-5 bg-slate-50 dark:bg-slate-850 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 cursor-pointer transition-colors">
                      <Camera className="w-8 h-8 text-emerald-600 mx-auto mb-1" />
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-0.5">
                        Escolher Foto da Galeria
                      </span>
                      <span className="text-[11px] text-slate-400 block mb-2">
                        JPG, PNG com otimização automática de nitidez
                      </span>
                      <span className="px-4 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-semibold inline-block">
                        Carregar Imagem
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}

                {activeTab === 'xml' && (
                  <div className="space-y-4 text-center">
                    <label className="block p-8 bg-slate-50 dark:bg-slate-800/80 rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 cursor-pointer transition-colors">
                      <FileCode className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm mb-1">
                        Selecionar Arquivo .XML da SEFAZ
                      </h4>
                      <p className="text-xs text-slate-400 max-w-xs mx-auto mb-3">
                        Envie o arquivo oficial da NF-e / NFC-e fornecido pelo mercado.
                      </p>
                      <span className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-xs inline-block">
                        Escolher Arquivo XML
                      </span>
                      <input
                        type="file"
                        accept=".xml,text/xml"
                        onChange={handleXmlUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}

                {activeTab === 'demo' && (
                  <div className="space-y-4 text-center">
                    <div className="p-6 bg-teal-50 dark:bg-teal-950/40 rounded-3xl border border-teal-200 dark:border-teal-800 space-y-3">
                      <Sparkles className="w-10 h-10 text-teal-600 dark:text-teal-400 mx-auto" />
                      <div className="space-y-1">
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                          Testar com Cupom de Demonstração
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                          Simula a leitura de uma compra real de supermercado para testar a tela de conciliação de itens comprados, esquecidos e compras extras.
                        </p>
                      </div>
                      <button
                        onClick={handleLoadDemoReceipt}
                        className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-md shadow-teal-600/20 inline-flex items-center space-x-2"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>Carregar Nota de Teste</span>
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
            onClose={() => setIsCameraScannerOpen(false)}
            onScanSuccess={(code) => handleProcessQR(code)}
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
            <div className="fixed inset-0 z-60 bg-black/70 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Key className="w-4 h-4 text-emerald-600" />
                    <span>Chave da API Gemini (Grátis)</span>
                  </h4>
                  <button onClick={() => setShowKeyModal(false)} className="text-slate-400">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Insira sua chave gratuita do Google AI Studio para turbinar a extração de fotos com IA Multimodal de alta precisão.
                </p>
                <form onSubmit={handleSaveKey} className="space-y-3 pt-1">
                  <input
                    type="password"
                    value={geminiKeyInput}
                    onChange={(e) => setGeminiKeyInput(e.target.value)}
                    placeholder="AIzaSy..."
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
