import { useEffect, useState } from 'react';
import { Download, Share2, X } from 'lucide-react';
import zebraMark from '../assets/zebrazul-mark-dark.png';

const DISMISS_KEY = 'zebrahub.pwa.install.dismissedUntil';
const DISMISS_DAYS = 7;

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const dismissedUntil = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (standalone || dismissedUntil > Date.now()) return undefined;

    const ua = window.navigator.userAgent || '';
    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(ios);

    // iOS/Safari não dispara beforeinstallprompt. Mostramos uma instrução curta.
    if (ios) setVisible(true);

    const onBeforeInstall = (event) => {
      event.preventDefault();
      setInstallEvent(event);
      setVisible(true);
    };
    const onInstalled = () => {
      window.localStorage.removeItem(DISMISS_KEY);
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
    const until = Date.now() + (DISMISS_DAYS * 24 * 60 * 60 * 1000);
    window.localStorage.setItem(DISMISS_KEY, String(until));
    setVisible(false);
  }

  return (
    <div className="fixed inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[90] mx-auto flex max-w-md items-center gap-3 rounded-[22px] border border-black/10 bg-[var(--zh-bg)] p-3 shadow-[0_24px_70px_rgba(23,24,28,0.24)] md:inset-x-auto md:right-5 md:bottom-5 md:w-[410px]">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#17181C] p-1.5">
        <img src={zebraMark} alt="" className="h-full w-full object-contain" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black tracking-tight text-[#17181C]">LEVE O HUB COM VOCÊ.</p>
        {isIOS && !installEvent ? (
          <p className="mt-0.5 text-[11px] leading-4 text-slate-500">No iPhone: <strong>Compartilhar</strong> → <strong>Adicionar à Tela de Início</strong>.</p>
        ) : (
          <p className="mt-0.5 text-[11px] leading-4 text-slate-500">Instale o ZebraHub e abra direto da tela inicial.</p>
        )}
      </div>
      {installEvent ? (
        <button type="button" onClick={install} className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#17181C] px-3 text-xs font-black text-white transition active:scale-[0.98]">
          <Download size={15} /> Instalar
        </button>
      ) : isIOS ? (
        <div className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-bold text-slate-700" aria-label="Use o menu Compartilhar do Safari">
          <Share2 size={15} /> Safari
        </div>
      ) : null}
      <button type="button" onClick={dismiss} aria-label="Fechar" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white hover:text-slate-700">
        <X size={16} />
      </button>
    </div>
  );
}
