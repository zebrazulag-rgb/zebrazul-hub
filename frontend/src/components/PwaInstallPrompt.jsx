import { useEffect, useState } from 'react';
import { Download, Share2, X } from 'lucide-react';

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const dismissed = sessionStorage.getItem('zebrahub.pwa.install.dismissed') === '1';
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (standalone || dismissed) return undefined;

    const ua = window.navigator.userAgent || '';
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(ios);

    // iOS/Safari does not fire beforeinstallprompt. Show our own instructions.
    if (ios) setVisible(true);

    const onBeforeInstall = (event) => {
      event.preventDefault();
      setInstallEvent(event);
      setVisible(true);
    };
    const onInstalled = () => {
      setVisible(false);
      setInstallEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!visible) return null;

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice;
    setVisible(false);
    setInstallEvent(null);
  }

  function dismiss() {
    sessionStorage.setItem('zebrahub.pwa.install.dismissed', '1');
    setVisible(false);
  }

  return (
    <div className="fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-[100] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-[390px]">
      <img src="/icons/icon-192.png" alt="" className="h-11 w-11 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900">Instalar ZebraHub</p>
        {isIOS && !installEvent ? (
          <p className="text-xs leading-4 text-slate-500">No iPhone, toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</p>
        ) : (
          <p className="text-xs text-slate-500">Abra em tela cheia direto pelo celular.</p>
        )}
      </div>
      {installEvent ? (
        <button type="button" onClick={install} className="flex h-10 items-center gap-1.5 rounded-xl bg-[#121620] px-3 text-xs font-bold text-white">
          <Download size={15} /> Instalar
        </button>
      ) : isIOS ? (
        <div className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-slate-100 px-3 text-xs font-bold text-slate-700" aria-label="Use o menu Compartilhar do Safari">
          <Share2 size={15} /> Compartilhar
        </div>
      ) : null}
      <button type="button" onClick={dismiss} aria-label="Fechar" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
        <X size={16} />
      </button>
    </div>
  );
}
