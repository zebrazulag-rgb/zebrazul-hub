import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

function normalizeGallery(images, imageSrc) {
  let source = images;

  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      source = [];
    }
  }

  const normalized = Array.isArray(source)
    ? source
        .map((item) => {
          if (!item) return null;
          if (typeof item === 'string') return { data: item };
          if (typeof item === 'object' && item.data) return item;
          if (typeof item === 'object' && item.url) return { ...item, data: item.url };
          return null;
        })
        .filter(Boolean)
    : [];

  if (!normalized.length && imageSrc) normalized.push({ data: imageSrc });
  return normalized;
}

export default function InstagramPreview({
  clientName = 'sua_marca',
  clientColor = '#2563eb',
  imageSrc,
  images = [],
  caption,
  contentType = 'feed',
}) {
  const initial = clientName?.[0]?.toUpperCase() || 'Z';
  const gallery = useMemo(() => normalizeGallery(images, imageSrc), [images, imageSrc]);
  const [activeIndex, setActiveIndex] = useState(0);
  const pointerStartX = useRef(null);

  useEffect(() => {
    setActiveIndex(0);
  }, [gallery.length, imageSrc]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (gallery.length <= 1) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setActiveIndex((current) => Math.max(0, current - 1));
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setActiveIndex((current) => Math.min(gallery.length - 1, current + 1));
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gallery.length]);

  const activeImage = gallery[activeIndex]?.data;
  const hasPrevious = activeIndex > 0;
  const hasNext = activeIndex < gallery.length - 1;

  function goPrevious() {
    if (hasPrevious) setActiveIndex((current) => current - 1);
  }

  function goNext() {
    if (hasNext) setActiveIndex((current) => current + 1);
  }

  function handlePointerDown(event) {
    pointerStartX.current = event.clientX;
  }

  function handlePointerUp(event) {
    if (pointerStartX.current === null || gallery.length <= 1) return;
    const distance = event.clientX - pointerStartX.current;
    pointerStartX.current = null;
    if (Math.abs(distance) < 45) return;
    if (distance < 0) goNext();
    else goPrevious();
  }

  return (
    <div className="w-full max-w-[420px] min-w-0 mx-auto bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ring-2 ring-offset-1"
            style={{ backgroundColor: clientColor, ringColor: clientColor }}
          >
            {initial}
          </div>
          <span className="text-sm font-semibold text-slate-800 truncate min-w-0">
            {clientName?.toLowerCase().replace(/\s+/g, '_') || 'sua_marca'}
          </span>
          {contentType === 'reels' && (
            <span className="text-[10px] uppercase tracking-wide text-slate-400 font-medium shrink-0">Reels</span>
          )}
        </div>
        <MoreHorizontal size={18} className="text-slate-400" />
      </div>

      <div
        className="relative w-full aspect-[4/5] bg-slate-100 flex items-center justify-center overflow-hidden touch-pan-y select-none"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { pointerStartX.current = null; }}
      >
        {activeImage ? (
          <img src={activeImage} alt={`Slide ${activeIndex + 1} do post`} className="w-full h-full object-contain bg-black" draggable="false" />
        ) : (
          <div className="text-center px-6">
            <p className="text-sm text-slate-400">Nenhuma imagem anexada ainda</p>
            <p className="text-xs text-slate-300 mt-1">A prévia aparece aqui ao anexar uma imagem</p>
          </div>
        )}

        {gallery.length > 1 && (
          <>
            {hasPrevious && (
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); goPrevious(); }}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/55 text-white flex items-center justify-center shadow-lg hover:bg-black/70 transition-colors"
                aria-label="Slide anterior"
              >
                <ChevronLeft size={24} />
              </button>
            )}
            {hasNext && (
              <button
                type="button"
                onClick={(event) => { event.stopPropagation(); goNext(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/55 text-white flex items-center justify-center shadow-lg hover:bg-black/70 transition-colors"
                aria-label="Próximo slide"
              >
                <ChevronRight size={24} />
              </button>
            )}
            <span className="absolute top-3 right-3 bg-black/65 text-white rounded-full px-2.5 py-1 text-[11px] font-semibold">
              {activeIndex + 1}/{gallery.length}
            </span>
          </>
        )}
      </div>

      {gallery.length > 1 && (
        <div className="flex justify-center gap-1.5 py-2.5" aria-label="Slides do carrossel">
          {gallery.map((_, index) => (
            <button
              type="button"
              key={index}
              onClick={() => setActiveIndex(index)}
              className={`rounded-full transition-all ${
                index === activeIndex ? 'w-2 h-2 bg-zebrazul-600' : 'w-1.5 h-1.5 bg-slate-300 hover:bg-slate-400'
              }`}
              aria-label={`Ver slide ${index + 1}`}
              aria-current={index === activeIndex ? 'true' : undefined}
            />
          ))}
        </div>
      )}

      <div className="px-3 pt-2.5 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <Heart size={22} className="text-slate-700" />
          <MessageCircle size={22} className="text-slate-700" />
          <Send size={20} className="text-slate-700" />
        </div>
        <Bookmark size={20} className="text-slate-700" />
      </div>

      <div className="px-3 pb-3 text-sm text-slate-700">
        <p className="font-semibold text-xs text-slate-800 mb-0.5">124 curtidas</p>
        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-snug">
          <span className="font-semibold mr-1.5">
            {clientName?.toLowerCase().replace(/\s+/g, '_') || 'sua_marca'}
          </span>
          {caption || <span className="text-slate-300">A legenda aparece aqui conforme você escreve...</span>}
        </p>
      </div>
    </div>
  );
}
