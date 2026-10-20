import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, FileText, Headphones, Loader2, Minus, NotebookPen,
  Pause, Play, Plus, Quote, Settings2, SkipBack, SkipForward, Square, Trash2, Type, X, RotateCcw, RotateCw,
} from 'lucide-react';
import api from '../api';
import { linesForRange } from '../utils/bookText.js';
import { RATES, useNarration } from '../context/NarrationContext.jsx';

const THEMES = {
  light: { label: 'Claro', page: 'bg-slate-100', text: 'bg-white text-slate-800', filter: 'none' },
  dark: { label: 'Escuro', page: 'bg-slate-950', text: 'bg-slate-900 text-slate-200', filter: 'invert(0.92) hue-rotate(180deg)' },
  sepia: { label: 'Sépia', page: 'bg-amber-100/70', text: 'bg-[#f6ecd8] text-[#3b2f1e]', filter: 'sepia(0.4) brightness(0.97)' },
};
const readLocal = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const writeLocal = (key, value) => { try { localStorage.setItem(key, value); } catch { /* ok */ } };
const fmtRate = (r) => `${String(r).replace('.', ',')}×`;

export default function ZebraLeitorReader() {
  const { id } = useParams();
  const navigate = useNavigate();
  const n = useNarration();
  const { openBook, releaseBook } = n;

  const [meta, setMeta] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState(() => readLocal('zl_mode', 'pdf'));
  const [zoom, setZoom] = useState(1);
  const [textSize, setTextSize] = useState(() => Number(readLocal('zl_textsize', '19')) || 19);
  const [theme, setTheme] = useState(() => readLocal('zl_theme', 'light'));
  const [panel, setPanel] = useState(null); // 'marks' | 'settings' | null
  const [marks, setMarks] = useState([]);
  const [resumeBanner, setResumeBanner] = useState(null);
  const [pageDraft, setPageDraft] = useState('');
  const [selection, setSelection] = useState('');
  const [viewport, setViewport] = useState(null);
  const [pageEntry, setPageEntry] = useState(null);
  const [renderError, setRenderError] = useState('');
  const [rendering, setRendering] = useState(false);
  const [boxWidth, setBoxWidth] = useState(0);

  const boxRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const touchRef = useRef(null);
  const themeCfg = THEMES[theme] || THEMES.light;

  // Em tela cheia no celular: o player ocupa a base da tela, então a navegação inferior do app fica oculta aqui.
  useEffect(() => {
    document.body.classList.add('zl-reader-open');
    return () => document.body.classList.remove('zl-reader-open');
  }, []);

  // ---- carregar livro ----
  useEffect(() => {
    let alive = true;
    setMeta(null); setLoadError('');
    api.get(`/books/${id}`).then(({ data }) => {
      if (!alive) return;
      setMeta(data.book);
      openBook(data.book);
      if ((data.book.current_page || 1) > 1 || data.book.narration_page) {
        setResumeBanner({ page: data.book.current_page || 1, narrationPage: data.book.narration_page });
      }
    }).catch((e) => { if (alive) setLoadError(e.response?.status === 404 ? 'Este livro não existe na sua biblioteca.' : (e.response?.data?.error || 'Não foi possível abrir o livro.')); });
    api.get(`/books/${id}/marks`).then(({ data }) => { if (alive) setMarks(data.marks || []); }).catch(() => {});
    return () => { alive = false; releaseBook(); };
  }, [id, openBook, releaseBook]);

  const doc = n.book && String(n.book.id) === String(id) ? n.doc : null;
  const total = doc?.numPages || meta?.page_count || 0;
  const page = n.viewPage;
  const narrating = n.status !== 'idle';

  useEffect(() => { if (doc) n.queueSave({ current_page: Math.min(page, doc.numPages) }); }, [doc]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPageDraft(String(page)); }, [page]);

  // largura disponível (para "ajustar à largura")
  useEffect(() => {
    if (!boxRef.current) return undefined;
    const el = boxRef.current;
    const update = () => setBoxWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [meta]);

  // ---- renderização da página (PDF) ----
  useEffect(() => {
    if (!doc || mode !== 'pdf' || !boxWidth) return undefined;
    let cancelled = false;
    setRendering(true);
    (async () => {
      try {
        const pdfPage = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
        if (cancelled) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const fit = Math.min(Math.max(200, boxWidth - 8), 900) / base.width;
        const vp = pdfPage.getViewport({ scale: fit * zoom });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(vp.width * dpr);
        canvas.height = Math.floor(vp.height * dpr);
        canvas.style.width = `${Math.floor(vp.width)}px`;
        canvas.style.height = `${Math.floor(vp.height)}px`;
        const context = canvas.getContext('2d');
        if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch { /* ok */ } }
        const task = pdfPage.render({ canvasContext: context, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
        renderTaskRef.current = task;
        await task.promise;
        if (!cancelled) { setViewport(vp); setRenderError(''); }
      } catch (error) {
        if (error?.name !== 'RenderingCancelledException' && !cancelled) setRenderError('Não foi possível desenhar esta página.');
      } finally { if (!cancelled) setRendering(false); }
    })();
    return () => { cancelled = true; };
  }, [doc, page, zoom, mode, boxWidth]);

  // texto da página em exibição (para destaque e modo texto)
  useEffect(() => {
    let alive = true;
    if (!doc) { setPageEntry(null); return undefined; }
    n.getPage(page).then((entry) => { if (alive) setPageEntry(entry); }).catch(() => { if (alive) setPageEntry({ model: { text: '', lines: [], paragraphs: [] }, chunks: [] }); });
    return () => { alive = false; };
  }, [doc, page, n.getPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // trecho em narração (quando está nesta página)
  const activeChunk = useMemo(() => {
    if (!pageEntry || !narrating || n.pos.page !== page) return null;
    return pageEntry.chunks[n.pos.chunk] || null;
  }, [pageEntry, narrating, n.pos, page]);

  const highlightRects = useMemo(() => {
    if (!activeChunk || !viewport || mode !== 'pdf') return [];
    return linesForRange(pageEntry.model.lines, activeChunk.start, activeChunk.end).map((line) => {
      const [x1, y1, x2, y2] = viewport.convertToViewportRectangle([line.x, line.y - line.h * 0.22, line.x1, line.y + line.h * 0.95]);
      return { left: Math.min(x1, x2) - 2, top: Math.min(y1, y2) - 1, width: Math.abs(x2 - x1) + 4, height: Math.abs(y2 - y1) + 2 };
    });
  }, [activeChunk, viewport, mode, pageEntry]);

  useEffect(() => {
    if (!highlightRects.length || !boxRef.current) return;
    const rect = highlightRects[0];
    const el = boxRef.current;
    const canvasTop = canvasRef.current?.offsetTop || 0;
    const y = canvasTop + rect.top;
    if (y < el.scrollTop + 20 || y > el.scrollTop + el.clientHeight - 80) el.scrollTo({ top: Math.max(0, y - el.clientHeight / 3), behavior: 'smooth' });
  }, [highlightRects]);

  // ---- navegação ----
  const goTo = useCallback((value) => { if (total) n.setViewPage(value); }, [n, total]);
  const prev = useCallback(() => goTo(page - 1), [goTo, page]);
  const next = useCallback(() => goTo(page + 1), [goTo, page]);

  useEffect(() => {
    const onKey = (event) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') next();
      else if (event.key === 'ArrowLeft' || event.key === 'PageUp') prev();
      else if (event.key === ' ' && narrating) { event.preventDefault(); (n.status === 'paused' ? n.play : n.pause)(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, narrating, n]);

  const onTouchStart = (e) => { if (zoom <= 1.05 && e.touches.length === 1) touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e) => {
    const start = touchRef.current; touchRef.current = null;
    if (!start || !e.changedTouches[0]) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 45) (dx < 0 ? next : prev)();
  };

  // seleção de texto (modo texto) para salvar trechos
  useEffect(() => {
    const onSelect = () => {
      const text = String(window.getSelection?.()?.toString() || '').trim();
      setSelection(text.length > 3 ? text : '');
    };
    document.addEventListener('selectionchange', onSelect);
    return () => document.removeEventListener('selectionchange', onSelect);
  }, []);

  const changeMode = (value) => { setMode(value); writeLocal('zl_mode', value); };
  const changeTheme = (value) => { setTheme(value); writeLocal('zl_theme', value); };
  const changeTextSize = (delta) => { const v = Math.max(14, Math.min(34, textSize + delta)); setTextSize(v); writeLocal('zl_textsize', String(v)); };

  // ---- marcações ----
  const bookmark = marks.find((m) => m.kind === 'bookmark' && m.page === page);
  const addMark = async (payload) => {
    try {
      const { data } = await api.post(`/books/${id}/marks`, payload);
      setMarks((list) => (list.some((m) => m.id === data.mark.id) ? list : [...list, data.mark].sort((a, b) => a.page - b.page || a.id - b.id)));
      return data.mark;
    } catch (e) { n.setNotice(e.response?.data?.error || 'Não foi possível salvar a marcação.'); return null; }
  };
  const removeMark = async (mark) => {
    try { await api.delete(`/books/${id}/marks/${mark.id}`); setMarks((list) => list.filter((m) => m.id !== mark.id)); }
    catch (e) { n.setNotice(e.response?.data?.error || 'Não foi possível excluir a marcação.'); }
  };
  const toggleBookmark = () => (bookmark ? removeMark(bookmark) : addMark({ kind: 'bookmark', page }));
  const saveQuote = async () => {
    const quote = selection || activeChunk?.text || '';
    if (!quote) { n.setNotice('Selecione um trecho no modo Texto, ou salve enquanto a narração lê o trecho desejado.'); return; }
    const mark = await addMark({ kind: 'highlight', page, quote });
    if (mark) { n.setNotice('Trecho salvo em Marcações.'); window.getSelection?.()?.removeAllRanges(); setSelection(''); }
  };

  if (loadError) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <AlertTriangle className="mx-auto text-amber-500" size={34} />
        <p className="text-sm font-semibold text-slate-700">{loadError}</p>
        <Link to="/leitor" className="inline-flex items-center gap-2 rounded-xl bg-[#0969ff] px-4 py-2.5 text-sm font-bold text-white"><ArrowLeft size={15} /> Voltar à biblioteca</Link>
      </div>
    );
  }
  if (!meta) return <div className="flex min-h-[50vh] items-center justify-center text-slate-400"><Loader2 className="animate-spin" /></div>;

  const noText = (n.book?.text_status || meta.text_status) === 'no_text';
  const playing = n.status === 'playing' || n.status === 'loading';
  const detached = narrating && n.pos.page !== page;
  const dark = theme === 'dark';
  const barBorder = dark ? 'border-slate-800 bg-slate-900/95 text-slate-100' : 'border-slate-200 bg-white/95 text-slate-900';
  const muted = dark ? 'text-slate-400' : 'text-slate-500';
  const iconBtn = `rounded-xl p-2.5 transition disabled:opacity-40 ${dark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`;

  const statusLabel = n.status === 'loading' ? 'Preparando a voz…' : n.status === 'playing' ? `Lendo · trecho ${n.pos.chunk + 1}` : n.status === 'paused' ? 'Pausado' : 'Pronto para ouvir';

  return (
    <div className={`-mx-4 -mt-2 min-h-[calc(100vh-120px)] rounded-none sm:mx-0 sm:rounded-2xl ${themeCfg.page}`}>
      {/* barra superior */}
      <div className={`flex items-center gap-1 border-b px-2 py-2 sm:rounded-t-2xl ${barBorder}`}>
        <button type="button" onClick={() => navigate('/leitor')} className={iconBtn} aria-label="Voltar à biblioteca"><ArrowLeft size={19} /></button>
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-sm font-bold">{meta.title}</p>
          <p className={`truncate text-[11px] ${muted}`}>{meta.author || 'Autor não informado'} · página {page}{total ? ` de ${total}` : ''}</p>
        </div>
        <button type="button" onClick={() => changeMode(mode === 'pdf' ? 'text' : 'pdf')} className={`${iconBtn} flex items-center gap-1 text-xs font-bold`} title={mode === 'pdf' ? 'Ler em modo texto (melhor no celular)' : 'Ver o PDF original'}>
          {mode === 'pdf' ? <><Type size={17} /><span className="hidden sm:inline">Texto</span></> : <><FileText size={17} /><span className="hidden sm:inline">PDF</span></>}
        </button>
        <button type="button" onClick={toggleBookmark} className={iconBtn} aria-label={bookmark ? 'Remover favorito' : 'Favoritar página'} title={bookmark ? 'Remover favorito desta página' : 'Favoritar esta página'}>
          {bookmark ? <BookmarkCheck size={19} className="text-[#0969ff]" /> : <Bookmark size={19} />}
        </button>
        <button type="button" onClick={() => setPanel(panel === 'marks' ? null : 'marks')} className={`${iconBtn} relative`} aria-label="Marcações e anotações" title="Marcações e anotações">
          <NotebookPen size={19} />{marks.length > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#0969ff]" />}
        </button>
        <button type="button" onClick={() => setPanel(panel === 'settings' ? null : 'settings')} className={iconBtn} aria-label="Configurações do leitor" title="Configurações"><Settings2 size={19} /></button>
      </div>

      {/* avisos */}
      <div className="space-y-2 px-3 pt-3">
        {noText && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-900">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span>Este PDF parece <b>digitalizado (só imagens)</b>: não há texto para narrar. Para ouvir, é preciso aplicar OCR no arquivo antes. Você ainda pode ler as páginas normalmente.</span>
          </div>
        )}
        {n.openError && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {n.openError}</div>}
        {n.notice && (
          <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-medium text-blue-900">
            <span className="flex-1">{n.notice}</span>
            <button type="button" onClick={() => n.setNotice('')} aria-label="Dispensar"><X size={14} /></button>
          </div>
        )}
        {resumeBanner && !narrating && doc && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-medium text-emerald-900">
            <span className="flex-1">Retomado na página <b>{resumeBanner.page}</b>.{resumeBanner.narrationPage ? ` Você parou de ouvir na página ${resumeBanner.narrationPage}.` : ''}</span>
            {!noText && <button type="button" onClick={() => { setResumeBanner(null); n.play(); }} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 font-bold text-white">Continuar ouvindo</button>}
            <button type="button" onClick={() => setResumeBanner(null)} aria-label="Dispensar"><X size={14} /></button>
          </div>
        )}
        {detached && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
            <Headphones size={14} className="text-[#0969ff]" />
            <span className="flex-1">A narração está na página {n.pos.page}.</span>
            <button type="button" onClick={n.resumeFollow} className="rounded-lg bg-slate-900 px-2.5 py-1.5 font-bold text-white">Ir para a narração</button>
            <button type="button" onClick={() => n.playFromPage(page)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 font-bold">Ler a partir daqui</button>
          </div>
        )}
      </div>

      {/* área de leitura */}
      <div className="relative">
        <div ref={boxRef} className="max-h-[calc(100vh-290px)] min-h-[360px] overflow-auto px-2 py-3 sm:px-4" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {!doc && !n.openError && <div className="flex min-h-[300px] items-center justify-center text-slate-400"><Loader2 className="animate-spin" /> <span className="ml-2 text-sm">Abrindo o livro…</span></div>}
          {doc && mode === 'pdf' && (
            <div className="relative mx-auto w-fit">
              <canvas ref={canvasRef} className="block rounded bg-white shadow-lg" style={{ filter: themeCfg.filter }} aria-label={`Página ${page}`} />
              {highlightRects.map((r, i) => (
                <div key={i} className="pointer-events-none absolute rounded-sm bg-yellow-300/45 ring-1 ring-yellow-400/70 transition-all duration-150" style={{ left: r.left, top: r.top, width: r.width, height: r.height, mixBlendMode: dark ? 'screen' : 'multiply' }} />
              ))}
              {rendering && <div className="absolute inset-0 flex items-center justify-center bg-white/30"><Loader2 className="animate-spin text-slate-500" /></div>}
              {renderError && <p className="mt-2 text-center text-xs font-semibold text-rose-600">{renderError}</p>}
            </div>
          )}
          {doc && mode === 'text' && (
            <article className={`mx-auto max-w-2xl rounded-2xl px-5 py-6 shadow-sm sm:px-8 ${themeCfg.text}`} style={{ fontSize: textSize, lineHeight: 1.7, fontFamily: 'Georgia, "Times New Roman", serif' }}>
              {!pageEntry ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-slate-400" /></div>
                : !pageEntry.model.text ? <p className="py-10 text-center text-sm text-slate-400" style={{ fontFamily: 'inherit' }}>Esta página não tem texto (imagem ou página em branco).</p>
                : <TextPage model={pageEntry.model} chunk={activeChunk} dark={dark} />}
            </article>
          )}
        </div>

        {/* setas laterais (desktop) */}
        <button type="button" onClick={prev} disabled={page <= 1} className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/45 p-2.5 text-white backdrop-blur hover:bg-black/65 disabled:opacity-0 md:block" aria-label="Página anterior"><ChevronLeft size={22} /></button>
        <button type="button" onClick={next} disabled={!total || page >= total} className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/45 p-2.5 text-white backdrop-blur hover:bg-black/65 disabled:opacity-0 md:block" aria-label="Próxima página"><ChevronRight size={22} /></button>
      </div>

      {/* zoom */}
      {mode === 'pdf' && doc && (
        <div className="flex items-center justify-center gap-1 pb-2 text-xs">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} className={iconBtn} aria-label="Diminuir zoom"><Minus size={16} /></button>
          <button type="button" onClick={() => setZoom(1)} className={`rounded-lg px-2.5 py-1.5 font-bold tabular-nums ${dark ? 'bg-slate-800 text-slate-100' : 'bg-white text-slate-700 shadow-sm'}`} title="Ajustar à largura">{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => setZoom((z) => Math.min(3.5, +(z + 0.25).toFixed(2)))} className={iconBtn} aria-label="Aumentar zoom"><Plus size={16} /></button>
        </div>
      )}
      {mode === 'text' && doc && (
        <div className="flex items-center justify-center gap-1 pb-2 text-xs">
          <button type="button" onClick={() => changeTextSize(-2)} className={iconBtn} aria-label="Diminuir letra"><Minus size={16} /></button>
          <span className={`px-2 font-bold ${muted}`}>Aa {textSize}</span>
          <button type="button" onClick={() => changeTextSize(2)} className={iconBtn} aria-label="Aumentar letra"><Plus size={16} /></button>
        </div>
      )}

      {/* player fixo */}
      <div className={`sticky bottom-0 z-30 mx-auto w-full max-w-3xl border px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 shadow-2xl backdrop-blur md:bottom-3 md:rounded-2xl md:pb-3 ${barBorder}`}>
        <div className="flex items-center gap-2">
          <input type="range" min={1} max={Math.max(1, total)} value={Math.min(page, Math.max(1, total))} onChange={(e) => goTo(Number(e.target.value))} disabled={!total} className="h-1.5 flex-1 accent-[#0969ff]" aria-label="Ir para a página" />
          <form onSubmit={(e) => { e.preventDefault(); const v = parseInt(pageDraft, 10); if (Number.isFinite(v)) goTo(v); else setPageDraft(String(page)); }} className="flex items-center gap-1 text-xs">
            <input value={pageDraft} onChange={(e) => setPageDraft(e.target.value.replace(/\D/g, ''))} onBlur={() => setPageDraft(String(page))} inputMode="numeric" className={`w-12 rounded-lg border px-1.5 py-1 text-center font-bold tabular-nums ${dark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'}`} aria-label="Página atual" />
            <span className={muted}>/ {total || '—'}</span>
          </form>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-1">
          <label className="relative">
            <span className="sr-only">Velocidade</span>
            <select value={n.rate} onChange={(e) => n.setRate(Number(e.target.value))} className={`appearance-none rounded-xl border py-2 pl-3 pr-3 text-xs font-extrabold tabular-nums ${dark ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'}`} aria-label="Velocidade de leitura">
              {RATES.map((r) => <option key={r} value={r}>{fmtRate(r)}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={n.prevPage} disabled={!narrating} className={iconBtn} aria-label="Página anterior da narração" title="Página anterior"><SkipBack size={19} /></button>
            <button type="button" onClick={n.prevChunk} disabled={!narrating} className={iconBtn} aria-label="Voltar um trecho" title="Voltar um trecho"><RotateCcw size={19} /></button>
            <button
              type="button"
              onClick={() => (playing ? n.pause() : n.play())}
              disabled={!doc || (noText && !playing)}
              className="mx-1 flex h-14 w-14 items-center justify-center rounded-full bg-[#0969ff] text-white shadow-lg transition hover:bg-blue-700 active:scale-95 disabled:opacity-40"
              aria-label={playing ? 'Pausar' : (n.status === 'paused' ? 'Continuar' : 'Reproduzir')}
            >
              {n.status === 'loading' ? <Loader2 size={24} className="animate-spin" /> : playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-0.5" />}
            </button>
            <button type="button" onClick={n.nextChunk} disabled={!narrating} className={iconBtn} aria-label="Avançar um trecho" title="Avançar um trecho"><RotateCw size={19} /></button>
            <button type="button" onClick={n.nextPage} disabled={!narrating} className={iconBtn} aria-label="Próxima página da narração" title="Próxima página"><SkipForward size={19} /></button>
          </div>
          <button type="button" onClick={n.stop} disabled={!narrating} className={iconBtn} aria-label="Parar" title="Parar"><Square size={18} /></button>
        </div>
        <p className={`mt-1 text-center text-[11px] font-semibold ${playing ? 'text-[#0969ff]' : muted}`} aria-live="polite">
          {statusLabel}{narrating ? ` · página ${n.pos.page}` : ''}{!n.supported ? ' · seu navegador não oferece voz' : ''}
        </p>
      </div>

      {panel === 'settings' && (
        <SidePanel title="Configurações" onClose={() => setPanel(null)}>
          <Section label="Tema de leitura">
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(THEMES).map(([key, t]) => (
                <button key={key} type="button" onClick={() => changeTheme(key)} className={`rounded-xl border px-3 py-2.5 text-sm font-bold ${theme === key ? 'border-[#0969ff] bg-blue-50 text-[#0969ff]' : 'border-slate-200 text-slate-600'}`}>{t.label}</button>
              ))}
            </div>
          </Section>
          <Section label="Voz de leitura">
            {n.voices.length === 0 ? <p className="text-xs text-slate-500">Nenhuma voz foi detectada neste dispositivo. Instale uma voz em português nas configurações do sistema.</p> : (
              <select value={n.voiceURI} onChange={(e) => n.setVoice(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800">
                <option value="">Automática (português do Brasil)</option>
                {n.voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} — {v.lang}</option>)}
              </select>
            )}
            <p className="mt-1.5 text-[11px] text-slate-400">As vozes vêm do seu dispositivo (gratuitas). A qualidade varia por aparelho.</p>
          </Section>
          <Section label="Controles do sistema (fones e tela de bloqueio)">
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={n.lockScreen} onChange={(e) => n.setLockScreen(e.target.checked)} className="mt-1" />
              <span>Mostrar controles de mídia ao ouvir (fones Bluetooth, notificação).<br /><span className="text-[11px] text-slate-400">Experimental. {n.isIOS ? 'No iPhone vem desligado: ' : ''}a voz do navegador pode ser interrompida pelo sistema quando a tela bloqueia — o app avisa e você retoma de onde parou.</span></span>
            </label>
          </Section>
        </SidePanel>
      )}

      {panel === 'marks' && (
        <SidePanel title="Marcações e anotações" onClose={() => setPanel(null)}>
          <MarksPanel marks={marks} page={page} total={total} quoteAvailable={Boolean(selection || activeChunk)} onSaveQuote={saveQuote} onAddNote={(note) => addMark({ kind: 'note', page, note })}
            onGo={(p) => { goTo(p); setPanel(null); }} onDelete={removeMark}
            onEditNote={async (mark, note) => { try { const { data } = await api.patch(`/books/${id}/marks/${mark.id}`, { note }); setMarks((l) => l.map((m) => (m.id === mark.id ? data.mark : m))); } catch (e) { n.setNotice(e.response?.data?.error || 'Não foi possível salvar a anotação.'); } }} />
        </SidePanel>
      )}
    </div>
  );
}

function TextPage({ model, chunk, dark }) {
  const parts = model.paragraphs.map((para, i) => {
    const text = model.text.slice(para.start, para.end);
    if (!chunk || chunk.end <= para.start || chunk.start >= para.end) return <p key={i} className="mb-4">{text}</p>;
    const a = Math.max(chunk.start, para.start) - para.start;
    const b = Math.min(chunk.end, para.end) - para.start;
    return (
      <p key={i} className="mb-4">
        {text.slice(0, a)}
        <mark ref={(el) => el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })} className={`rounded px-0.5 ${dark ? 'bg-yellow-500/30 text-yellow-100' : 'bg-yellow-200 text-slate-900'}`}>{text.slice(a, b)}</mark>
        {text.slice(b)}
      </p>
    );
  });
  return <>{parts}</>;
}

function SidePanel({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-slate-950/40" onClick={onClose}>
      <aside className="flex h-full w-full max-w-sm flex-col bg-white text-slate-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-base font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto p-4">{children}</div>
      </aside>
    </div>
  );
}

function Section({ label, children }) {
  return <div><p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>{children}</div>;
}

const KIND_LABEL = { bookmark: 'Favorito', highlight: 'Trecho', note: 'Anotação' };

function MarksPanel({ marks, page, total, quoteAvailable, onSaveQuote, onAddNote, onGo, onDelete, onEditNote }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');
  return (
    <>
      <div className="space-y-2">
        <button type="button" onClick={onSaveQuote} disabled={!quoteAvailable} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"><Quote size={15} /> Salvar trecho {quoteAvailable ? '' : '(selecione no modo Texto)'}</button>
        <form onSubmit={async (e) => { e.preventDefault(); if (!note.trim()) return; setBusy(true); const ok = await onAddNote(note.trim()); setBusy(false); if (ok) setNote(''); }} className="space-y-2">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={4000} placeholder={`Anotação da página ${page}${total ? ` de ${total}` : ''}…`} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#0969ff]" />
          <button type="submit" disabled={busy || !note.trim()} className="w-full rounded-xl bg-[#0969ff] px-3 py-2.5 text-sm font-bold text-white disabled:opacity-40">Salvar anotação</button>
        </form>
      </div>
      {marks.length === 0 ? <p className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-400">Nenhuma marcação neste livro ainda. Use a estrela para favoritar páginas.</p> : (
        <ul className="space-y-2">
          {marks.map((mark) => (
            <li key={mark.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                <span>{KIND_LABEL[mark.kind]}</span><span>·</span><button type="button" onClick={() => onGo(mark.page)} className="text-[#0969ff] hover:underline">Página {mark.page}</button>
                <span className="flex-1" />
                {mark.kind === 'note' && <button type="button" onClick={() => { setEditing(mark.id); setDraft(mark.note || ''); }} className="text-slate-400 hover:text-slate-700">Editar</button>}
                <button type="button" onClick={() => onDelete(mark)} className="text-slate-400 hover:text-rose-600" aria-label="Excluir marcação"><Trash2 size={14} /></button>
              </div>
              {mark.quote && <blockquote className="mt-1.5 border-l-2 border-yellow-300 pl-2 text-sm italic text-slate-700">{mark.quote}</blockquote>}
              {editing === mark.id ? (
                <div className="mt-1.5 space-y-1.5">
                  <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                  <div className="flex justify-end gap-2 text-xs font-bold"><button type="button" onClick={() => setEditing(null)} className="text-slate-500">Cancelar</button><button type="button" onClick={() => { onEditNote(mark, draft.trim()); setEditing(null); }} className="text-[#0969ff]">Salvar</button></div>
                </div>
              ) : mark.note && <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-700">{mark.note}</p>}
              {mark.kind === 'bookmark' && !mark.note && <button type="button" onClick={() => onGo(mark.page)} className="mt-1 text-sm font-semibold text-slate-700">Ir para a página {mark.page}</button>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
