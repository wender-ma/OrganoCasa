import React from 'react';
import { createPortal } from 'react-dom';
import { X, Smartphone, Download, Share, PlusSquare, CheckCircle2 } from 'lucide-react';

interface InstallPwaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InstallPwaModal: React.FC<InstallPwaModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const isIOS =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto pt-[max(env(safe-area-inset-top),1rem)] pb-[max(env(safe-area-inset-bottom),1rem)]">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-200 space-y-4 my-auto shrink-0">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Smartphone className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Instalar App no Celular
            </h3>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Instale o <strong>OrganoCasa</strong> na tela inicial do seu celular para abrir instantaneamente em tela cheia e usar 100% offline no supermercado.
        </p>

        {/* Steps */}
        {isIOS ? (
          /* iOS Safari Guide */
          <div className="space-y-2.5 p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs">
            <span className="font-bold text-slate-800 dark:text-slate-200 block mb-1">
              📱 No iPhone / iPad (Safari):
            </span>
            <div className="flex items-center space-x-2.5">
              <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center font-bold text-xs shrink-0">
                1
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                Toque no botão <strong>Compartilhar</strong> (ícone <Share className="w-3.5 h-3.5 inline mx-0.5" /> no rodapé do Safari).
              </p>
            </div>
            <div className="flex items-center space-x-2.5">
              <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center font-bold text-xs shrink-0">
                2
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                Role para baixo e selecione <strong>"Adicionar à Tela de Início"</strong> (<PlusSquare className="w-3.5 h-3.5 inline mx-0.5" />).
              </p>
            </div>
            <div className="flex items-center space-x-2.5">
              <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center font-bold text-xs shrink-0">
                3
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                Toque em <strong>"Adicionar"</strong> no canto superior direito.
              </p>
            </div>
          </div>
        ) : (
          /* Android Chrome Guide */
          <div className="space-y-2.5 p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs">
            <span className="font-bold text-slate-800 dark:text-slate-200 block mb-1">
              🤖 No Android (Google Chrome):
            </span>
            <div className="flex items-center space-x-2.5">
              <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center font-bold text-xs shrink-0">
                1
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                Toque no menu de <strong>três pontos (⋮)</strong> no canto superior do navegador.
              </p>
            </div>
            <div className="flex items-center space-x-2.5">
              <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center font-bold text-xs shrink-0">
                2
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                Selecione <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>.
              </p>
            </div>
            <div className="flex items-center space-x-2.5">
              <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center font-bold text-xs shrink-0">
                3
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                Confirme a instalação. O ícone aparecerá junto aos seus aplicativos!
              </p>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors"
        >
          Entendi, fechar
        </button>
      </div>
    </div>,
    document.body
  );
};
