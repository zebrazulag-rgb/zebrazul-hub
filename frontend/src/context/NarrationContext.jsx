import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight, Pause, Play, Square } from 'lucide-react';
import api from '../api';
import { getTenantSlug } from '../tenant';
import { chunkPage } from '../utils/bookText.js';
import { detectRepeatedMargins, extractPageModel, friendlyPdfError, openBookDocument } from '../utils/pdfjs.js';

// Zebra Leitor — estado global do livro aberto e da narração.
// Vive acima das rotas: a voz continua ao navegar pelo ZebraHub (a leitura só para quando o usuário manda).
//
// Arquitetura do áudio: o "motor" de voz é isolado em speakChunk(). Hoje usa a Web Speech API do navegador
// (gratuita). Para a 2ª modalidade (áudio gerado no servidor, tocado em <audio> com Media Session e que
// funciona com a tela bloqueada), basta trocar speakChunk() por um motor que toque a URL do áudio do trecho.
// O restante (extração, trechos, progresso, player, destaque) permanece igual.

export const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];
const NarrationContext = createContext(null);
export const useNarration = () => useContext(NarrationContext);

const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const isIOS = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
const apiBase = import.meta.env.VITE_API_URL || '/api';

function silentWavUrl() {
  const sampleRate = 8000;
  const samples = sampleRate; // 1 s
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const write = (offset, text) => { for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i)); };
  write(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); write(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

function readSetting(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v; } catch { return fallback; }
}
function writeSetting(key, value) { try { localStorage.setItem(key, value); } catch { /* sem armazenamento local */ } }

export function NarrationProvider({ children }) {
  const [book, setBook] = useState(null);
  const [doc, setDoc] = useState(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | playing | paused
  const [pos, setPos] = useState({ page: 1, chunk: 0 });
  const [viewPage, setViewPageState] = useState(1);
  const [follow, setFollow] = useState(true);
  const [rate, setRateState] = useState(1);
  const [voices, setVoices] = useState([]);
  const [voiceURI, setVoiceURI] = useState(() => readSetting('zl_voice', ''));
  const [notice, setNotice] = useState('');
  const [lockScreen, setLockScreenState] = useState(() => readSetting('zl_lockscreen', isIOS ? '0' : '1') === '1');

  const bookRef = useRef(null);
  const docRef = useRef(null);
  const repeatedRef = useRef(new Set());
  const cacheRef = useRef(new Map());
  const tokenRef = useRef(0);
  const statusRef = useRef('idle');
  const posRef = useRef({ page: 1, chunk: 0 });
  const rateRef = useRef(1);
  const voiceRef = useRef('');
  const viewRef = useRef(1);
  const followRef = useRef(true);
  const chunkActiveRef = useRef(false);
  const saveTimerRef = useRef(null);
  const pendingSaveRef = useRef({});
  const openingRef = useRef(null);
  const audioRef = useRef(null);
  const audioUrlRef = useRef('');

  const supported = Boolean(synth);

  const setStatusBoth = (value) => { statusRef.current = value; setStatus(value); };
  const setPosBoth = (value) => { posRef.current = value; setPos(value); };

  // ---------- progresso ----------
  const flushProgress = useCallback((keepalive = false) => {
    const current = bookRef.current;
    const body = pendingSaveRef.current;
    if (saveTimerRef.current) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    if (!current || !Object.keys(body).length) return;
    pendingSaveRef.current = {};
    if (keepalive) {
      try {
        fetch(`${apiBase}/books/${current.id}/progress`, {
          method: 'PUT', keepalive: true,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('zebrazul_token') || ''}`, 'X-Tenant-Slug': getTenantSlug() },
          body: JSON.stringify(body),
        }).catch(() => {});
      } catch { /* melhor esforço */ }
      return;
    }
    api.put(`/books/${current.id}/progress`, body).then(({ data }) => {
      if (bookRef.current?.id === current.id) setBook((prev) => (prev ? { ...prev, ...data.book } : prev));
    }).catch(() => { pendingSaveRef.current = { ...body, ...pendingSaveRef.current }; });
  }, []);

  const queueSave = useCallback((partial) => {
    pendingSaveRef.current = { ...pendingSaveRef.current, ...partial };
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => flushProgress(false), 1800);
  }, [flushProgress]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushProgress(true); };
    const onPageHide = () => flushProgress(true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => { document.removeEventListener('visibilitychange', onHide); window.removeEventListener('pagehide', onPageHide); };
  }, [flushProgress]);

  // ---------- vozes ----------
  useEffect(() => {
    if (!synth) return undefined;
    const load = () => {
      const list = synth.getVoices().map((v) => ({ voiceURI: v.voiceURI, name: v.name, lang: v.lang, localService: v.localService }));
      const rank = (v) => (/^pt[-_]br/i.test(v.lang) ? 0 : /^pt/i.test(v.lang) ? 1 : 2);
      list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
      setVoices(list);
    };
    load();
    synth.addEventListener?.('voiceschanged', load);
    return () => synth.removeEventListener?.('voiceschanged', load);
  }, []);

  useEffect(() => { voiceRef.current = voiceURI; }, [voiceURI]);
  useEffect(() => { rateRef.current = rate; }, [rate]);
  useEffect(() => { followRef.current = follow; }, [follow]);

  const chosenVoice = useCallback(() => {
    if (!synth) return null;
    const all = synth.getVoices();
    return all.find((v) => v.voiceURI === voiceRef.current)
      || all.find((v) => /^pt[-_]br/i.test(v.lang))
      || all.find((v) => /^pt/i.test(v.lang))
      || null;
  }, []);

  // ---------- páginas e trechos ----------
  const getPage = useCallback(async (pageNumber) => {
    const cached = cacheRef.current.get(pageNumber);
    if (cached) return cached;
    const pdf = docRef.current;
    if (!pdf || pageNumber < 1 || pageNumber > pdf.numPages) return { model: { text: '', lines: [], paragraphs: [] }, chunks: [] };
    const { model } = await extractPageModel(pdf, pageNumber, repeatedRef.current);
    const entry = { model, chunks: chunkPage(pageNumber, model.text) };
    cacheRef.current.set(pageNumber, entry);
    if (cacheRef.current.size > 40) cacheRef.current.delete(cacheRef.current.keys().next().value);
    return entry;
  }, []);

  // ---------- abrir / fechar livro ----------
  const closeDoc = useCallback(() => {
    const old = docRef.current;
    docRef.current = null;
    cacheRef.current.clear();
    repeatedRef.current = new Set();
    setDoc(null);
    if (old) { try { old.destroy(); } catch { /* já destruído */ } }
  }, []);

  const stopInternal = useCallback((nextStatus = 'idle') => {
    tokenRef.current += 1;
    chunkActiveRef.current = false;
    if (synth) { try { synth.cancel(); } catch { /* ok */ } }
    setStatusBoth(nextStatus);
    if (audioRef.current) { try { audioRef.current.pause(); } catch { /* ok */ } }
  }, []);

  const openBook = useCallback(async (meta) => {
    if (bookRef.current?.id === meta.id && docRef.current) {
      setBook((prev) => ({ ...prev, ...meta }));
      return docRef.current;
    }
    if (openingRef.current?.id === meta.id) return openingRef.current.promise;
    flushProgress(false);
    stopInternal('idle');
    closeDoc();
    bookRef.current = meta;
    setBook(meta);
    setNotice('');
    setOpenError('');
    setOpening(true);
    const startPage = Math.max(1, meta.current_page || 1);
    viewRef.current = startPage;
    setViewPageState(startPage);
    setFollow(true);
    setRateState(meta.playback_rate || 1);
    rateRef.current = meta.playback_rate || 1;
    setPosBoth({ page: meta.narration_page || startPage, chunk: meta.narration_chunk || 0 });
    const promise = openBookDocument(meta.id).then((pdf) => {
      if (bookRef.current?.id !== meta.id) { pdf.destroy(); return null; }
      docRef.current = pdf;
      setDoc(pdf);
      detectRepeatedMargins(pdf).then((set) => { if (docRef.current === pdf) { repeatedRef.current = set; cacheRef.current.clear(); } }).catch(() => {});
      return pdf;
    }).catch((error) => {
      if (bookRef.current?.id === meta.id) setOpenError(friendlyPdfError(error));
      return null;
    }).finally(() => { if (openingRef.current?.id === meta.id) openingRef.current = null; setOpening(false); });
    openingRef.current = { id: meta.id, promise };
    return promise;
  }, [closeDoc, flushProgress, stopInternal]);

  const releaseBook = useCallback(() => {
    // Chamado ao sair do leitor: se não está narrando, libera a memória do PDF.
    if (statusRef.current === 'idle') {
      flushProgress(false);
      closeDoc();
      bookRef.current = null;
      setBook(null);
    }
  }, [closeDoc, flushProgress]);

  // ---------- navegação de visualização ----------
  const setViewPage = useCallback((n, { manual = true } = {}) => {
    const total = docRef.current?.numPages || bookRef.current?.page_count || 1;
    const page = Math.max(1, Math.min(total, Math.round(n)));
    viewRef.current = page;
    setViewPageState(page);
    if (manual && statusRef.current !== 'idle' && page !== posRef.current.page) { followRef.current = false; setFollow(false); }
    queueSave({ current_page: page });
    return page;
  }, [queueSave]);

  const resumeFollow = useCallback(() => {
    followRef.current = true;
    setFollow(true);
    setViewPage(posRef.current.page, { manual: false });
  }, [setViewPage]);

  // ---------- motor de voz (Web Speech) ----------
  const speakChunk = useCallback((text, token) => new Promise((resolve) => {
    if (!synth) { resolve('unsupported'); return; }
    const utter = new SpeechSynthesisUtterance(text);
    const voice = chosenVoice();
    utter.lang = voice?.lang || 'pt-BR';
    if (voice) utter.voice = voice;
    utter.rate = rateRef.current;
    let started = false;
    const watchdog = window.setTimeout(() => { if (!started && tokenRef.current === token) resolve('no-start'); }, 6000);
    utter.onstart = () => { started = true; window.clearTimeout(watchdog); if (tokenRef.current === token) { chunkActiveRef.current = true; if (statusRef.current === 'loading') setStatusBoth('playing'); } };
    utter.onend = () => { window.clearTimeout(watchdog); chunkActiveRef.current = false; resolve('end'); };
    utter.onerror = (event) => { window.clearTimeout(watchdog); chunkActiveRef.current = false; resolve(event.error === 'interrupted' || event.error === 'canceled' ? 'cancel' : `error:${event.error}`); };
    synth.speak(utter);
  }), [chosenVoice]);

  const runNarration = useCallback(async (startPage, startChunk, token) => {
    let page = startPage;
    let chunkIndex = startChunk;
    let emptyStreak = 0;
    await sleep(80); // evita o descarte do speak() logo após cancel() em alguns navegadores
    while (tokenRef.current === token) {
      const pdf = docRef.current;
      if (!pdf) return;
      if (page > pdf.numPages) {
        stopInternal('idle');
        setPosBoth({ page: pdf.numPages, chunk: 0 });
        setNotice('Fim do livro. Boa leitura!');
        queueSave({ narration_page: null, narration_chunk: null });
        return;
      }
      let entry;
      try { entry = await getPage(page); } catch { entry = { chunks: [] }; }
      if (tokenRef.current !== token) return;
      if (!entry.chunks.length || chunkIndex >= entry.chunks.length) {
        if (!entry.chunks.length) {
          emptyStreak += 1;
          if (emptyStreak > 15) {
            stopInternal('paused');
            setNotice('Não encontrei texto nas próximas páginas. Se o livro é digitalizado (imagens), ele precisa de OCR para ser narrado.');
            return;
          }
        }
        page += 1; chunkIndex = 0; continue;
      }
      emptyStreak = 0;
      setPosBoth({ page, chunk: chunkIndex });
      if (followRef.current) { viewRef.current = page; setViewPageState(page); queueSave({ current_page: page, narration_page: page, narration_chunk: chunkIndex }); }
      else queueSave({ narration_page: page, narration_chunk: chunkIndex });
      getPage(page + 1).catch(() => {}); // pré-carrega a próxima página para não haver pausa entre elas
      const result = await speakChunk(entry.chunks[chunkIndex].text, token);
      if (tokenRef.current !== token) return;
      if (result === 'end') { chunkIndex += 1; continue; }
      if (result === 'unsupported') { stopInternal('idle'); setNotice('Este navegador não oferece leitura em voz alta.'); return; }
      if (result === 'no-start') {
        stopInternal('paused');
        setNotice(voices.length ? 'A voz do navegador não respondeu. Toque em continuar ou escolha outra voz.' : 'Nenhuma voz de leitura foi encontrada neste dispositivo. Instale uma voz em português nas configurações do sistema.');
        return;
      }
      if (result.startsWith('error')) {
        stopInternal('paused');
        setNotice('A voz do dispositivo falhou ao ler este trecho. Toque em continuar para tentar de novo.');
        return;
      }
      return; // cancelado
    }
  }, [getPage, queueSave, speakChunk, stopInternal, voices.length]);

  const unlockSpeech = () => {
    // iOS/Safari só libera a voz dentro do toque do usuário: dispara uma fala muda de forma síncrona.
    if (!synth) return;
    try { synth.cancel(); const u = new SpeechSynthesisUtterance(' '); u.volume = 0; synth.speak(u); } catch { /* ok */ }
  };

  const startAudioSession = () => {
    if (!lockScreen) return;
    try {
      if (!audioRef.current) {
        audioUrlRef.current = silentWavUrl();
        const audio = new Audio(audioUrlRef.current);
        audio.loop = true; audio.volume = 0.01;
        audioRef.current = audio;
      }
      audioRef.current.play().catch(() => {});
    } catch { /* sem áudio de sessão */ }
  };

  const startAt = useCallback((page, chunk = 0) => {
    if (!docRef.current) return;
    if (!synth) { setNotice('Este navegador não oferece leitura em voz alta.'); return; }
    if (bookRef.current?.text_status === 'no_text') {
      setNotice('Este PDF contém apenas imagens (digitalizado), então não há texto para narrar. É preciso aplicar OCR no arquivo para ouvir o livro.');
      return;
    }
    unlockSpeech();
    startAudioSession();
    setNotice('');
    tokenRef.current += 1;
    const token = tokenRef.current;
    setStatusBoth('loading');
    setPosBoth({ page, chunk });
    if (followRef.current) { viewRef.current = page; setViewPageState(page); }
    runNarration(page, chunk, token);
  }, [runNarration, lockScreen]); // eslint-disable-line react-hooks/exhaustive-deps

  const play = useCallback(() => {
    // Toque em "Reproduzir": retoma de onde parou; se estava parado, começa pela página em exibição.
    if (statusRef.current === 'paused') { startAt(posRef.current.page, posRef.current.chunk); return; }
    const view = viewRef.current;
    const saved = bookRef.current;
    const chunk = saved?.narration_page === view ? (saved.narration_chunk || 0) : 0;
    followRef.current = true; setFollow(true);
    startAt(view, chunk);
  }, [startAt]);

  const playFromPage = useCallback((page) => { followRef.current = true; setFollow(true); startAt(page, 0); }, [startAt]);

  const pause = useCallback(() => {
    if (statusRef.current === 'idle') return;
    stopInternal('paused');
    flushProgress(false);
  }, [flushProgress, stopInternal]);

  const stop = useCallback(() => {
    stopInternal('idle');
    queueSave({ narration_page: posRef.current.page, narration_chunk: posRef.current.chunk });
    flushProgress(false);
  }, [flushProgress, queueSave, stopInternal]);

  const jumpTo = useCallback((page, chunk) => {
    if (statusRef.current === 'playing' || statusRef.current === 'loading') startAt(page, chunk);
    else {
      setPosBoth({ page, chunk });
      if (followRef.current) { viewRef.current = page; setViewPageState(page); }
      queueSave({ narration_page: page, narration_chunk: chunk });
    }
  }, [queueSave, startAt]);

  const nextChunk = useCallback(async () => {
    const { page, chunk } = posRef.current;
    const entry = await getPage(page);
    if (chunk + 1 < entry.chunks.length) jumpTo(page, chunk + 1);
    else jumpTo(Math.min((docRef.current?.numPages || page) , page + 1), 0);
  }, [getPage, jumpTo]);

  const prevChunk = useCallback(async () => {
    const { page, chunk } = posRef.current;
    if (chunk > 0) { jumpTo(page, chunk - 1); return; }
    if (page <= 1) { jumpTo(1, 0); return; }
    const entry = await getPage(page - 1);
    jumpTo(page - 1, Math.max(0, entry.chunks.length - 1));
  }, [getPage, jumpTo]);

  const nextPage = useCallback(() => jumpTo(Math.min(docRef.current?.numPages || posRef.current.page, posRef.current.page + 1), 0), [jumpTo]);
  const prevPage = useCallback(() => jumpTo(Math.max(1, posRef.current.page - 1), 0), [jumpTo]);

  const setRate = useCallback((value) => {
    setRateState(value); rateRef.current = value;
    queueSave({ playback_rate: value });
    if (statusRef.current === 'playing' || statusRef.current === 'loading') startAt(posRef.current.page, posRef.current.chunk);
  }, [queueSave, startAt]);

  const setVoice = useCallback((uri) => {
    setVoiceURI(uri); voiceRef.current = uri; writeSetting('zl_voice', uri);
    if (statusRef.current === 'playing' || statusRef.current === 'loading') startAt(posRef.current.page, posRef.current.chunk);
  }, [startAt]);

  const setLockScreen = useCallback((value) => {
    setLockScreenState(value); writeSetting('zl_lockscreen', value ? '1' : '0');
    if (!value && audioRef.current) { try { audioRef.current.pause(); } catch { /* ok */ } }
  }, []);

  // ---------- honestidade quando o sistema interrompe a voz (ex.: iPhone com tela bloqueada) ----------
  useEffect(() => {
    if (!synth || status !== 'playing') return undefined;
    let idleSince = 0;
    const timer = window.setInterval(() => {
      const silent = !synth.speaking && !synth.pending;
      if (chunkActiveRef.current && silent) {
        idleSince = idleSince || Date.now();
        if (Date.now() - idleSince > 3000 && statusRef.current === 'playing') {
          stopInternal('paused');
          setNotice('A leitura foi interrompida pelo sistema (comum no iPhone quando a tela bloqueia ou o app vai para segundo plano). Toque em continuar para retomar de onde parou.');
        }
      } else idleSince = 0;
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status, stopInternal]);

  // ---------- Media Session (fones Bluetooth, tela de bloqueio quando suportado) ----------
  useEffect(() => {
    if (!('mediaSession' in navigator) || !book) return;
    const ms = navigator.mediaSession;
    try {
      const artwork = book.cover_data ? [{ src: book.cover_data, sizes: '360x500', type: 'image/jpeg' }] : [];
      ms.metadata = new window.MediaMetadata({ title: book.title, artist: book.author || 'Zebra Leitor', album: `Página ${pos.page}${book.page_count ? ` de ${book.page_count}` : ''}`, artwork });
      ms.playbackState = status === 'playing' || status === 'loading' ? 'playing' : (status === 'paused' ? 'paused' : 'none');
      ms.setActionHandler('play', () => play());
      ms.setActionHandler('pause', () => pause());
      ms.setActionHandler('stop', () => stop());
      ms.setActionHandler('previoustrack', () => prevPage());
      ms.setActionHandler('nexttrack', () => nextPage());
      ms.setActionHandler('seekbackward', () => prevChunk());
      ms.setActionHandler('seekforward', () => nextChunk());
    } catch { /* ação não suportada neste navegador */ }
  }, [book, pos.page, status, play, pause, stop, prevPage, nextPage, prevChunk, nextChunk]);

  useEffect(() => () => { if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current); }, []);

  const value = useMemo(() => ({
    supported, voices, voiceURI, setVoice, rate, setRate, status, pos, viewPage, follow, notice, setNotice,
    book, doc, opening, openError, lockScreen, setLockScreen, isIOS,
    openBook, releaseBook, getPage, setViewPage, resumeFollow,
    play, pause, stop, playFromPage, nextChunk, prevChunk, nextPage, prevPage, flushProgress, queueSave,
    patchBook: (partial) => { setBook((prev) => (prev ? { ...prev, ...partial } : prev)); bookRef.current = bookRef.current ? { ...bookRef.current, ...partial } : bookRef.current; },
  }), [supported, voices, voiceURI, setVoice, rate, setRate, status, pos, viewPage, follow, notice, book, doc, opening, openError, lockScreen, setLockScreen,
    openBook, releaseBook, getPage, setViewPage, resumeFollow, play, pause, stop, playFromPage, nextChunk, prevChunk, nextPage, prevPage, flushProgress, queueSave]);

  return (
    <NarrationContext.Provider value={value}>
      {children}
      <MiniPlayer />
    </NarrationContext.Provider>
  );
}

// Player flutuante: aparece quando há narração em andamento e o usuário está fora da tela de leitura.
function MiniPlayer() {
  const ctx = useNarration();
  const location = useLocation();
  const [bottom, setBottom] = useState(20);
  const visible = Boolean(ctx?.book) && ctx?.status !== 'idle';
  useEffect(() => {
    if (!visible) return undefined;
    const measure = () => {
      const nav = document.querySelector('.mobile-bottom-nav');
      const shown = nav && getComputedStyle(nav).display !== 'none';
      setBottom(shown ? nav.offsetHeight + 12 : 20);
    };
    measure();
    window.addEventListener('resize', measure);
    const timer = window.setInterval(measure, 1500);
    return () => { window.removeEventListener('resize', measure); window.clearInterval(timer); };
  }, [visible, location.pathname]);
  if (!ctx || !ctx.book || ctx.status === 'idle') return null;
  if (location.pathname.startsWith(`/leitor/${ctx.book.id}`)) return null;
  const playing = ctx.status === 'playing' || ctx.status === 'loading';
  return (
    <div style={{ bottom }} className="fixed inset-x-3 z-[60] mx-auto flex max-w-xl items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2.5 shadow-2xl backdrop-blur md:left-auto md:right-5 md:mx-0">
      <Link to={`/leitor/${ctx.book.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <div className="h-11 w-8 shrink-0 overflow-hidden rounded bg-slate-200">{ctx.book.cover_data && <img src={ctx.book.cover_data} alt="" className="h-full w-full object-cover" />}</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{ctx.book.title}</p>
          <p className="text-[11px] text-slate-500">{playing ? 'Lendo' : 'Pausado'} · página {ctx.pos.page}{ctx.book.page_count ? ` de ${ctx.book.page_count}` : ''}</p>
        </div>
      </Link>
      <button type="button" onClick={() => ctx.prevPage()} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Página anterior"><ChevronsLeft size={18} /></button>
      <button type="button" onClick={() => (playing ? ctx.pause() : ctx.play())} className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0969ff] text-white shadow" aria-label={playing ? 'Pausar' : 'Continuar'}>
        {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
      </button>
      <button type="button" onClick={() => ctx.nextPage()} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Próxima página"><ChevronsRight size={18} /></button>
      <button type="button" onClick={() => ctx.stop()} className="rounded-full p-2 text-slate-400 hover:bg-slate-100" aria-label="Parar"><Square size={16} /></button>
    </div>
  );
}
