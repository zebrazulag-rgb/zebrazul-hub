import { useState, useEffect } from 'react';
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';

export default function InstagramPreview({
  clientName = 'sua_marca',
  clientColor = '#2563eb',
  imageSrc,
  images = [],
  caption,
  contentType = 'feed'
}) {
  const initial = clientName?.[0]?.toUpperCase() || 'Z';
  const gallery = images?.length ? images : (imageSrc ? [{ data: imageSrc }] : []);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (activeIndex >= gallery.length) setActiveIndex(0);
  }, [gallery.length, activeIndex]);

  const activeImage = gallery[activeIndex]?.data;

  return (
    <div className="w-full max-w-[380px] min-w-0 mx-auto bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
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

      <div className="relative w-full aspect-[4/5] bg-slate-100 flex items-center justify-center overflow-hidden">
        {activeImage ? (
          <img src={activeImage} alt="Preview do post" className="w-full h-full object-cover" />
        ) : (
          <div className="text-center px-6">
            <p className="text-sm text-slate-400">Nenhuma imagem anexada ainda</p>
            <p className="text-xs text-slate-300 mt-1">A prévia aparece aqui ao anexar uma imagem</p>
          </div>
        )}

        {gallery.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => setActiveIndex((current) => (current - 1 + gallery.length) % gallery.length)}
              className="absolute left-2 w-8 h-8 rounded-full bg-black/45 text-white flex items-center justify-center"
              aria-label="Imagem anterior"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => setActiveIndex((current) => (current + 1) % gallery.length)}
              className="absolute right-2 w-8 h-8 rounded-full bg-black/45 text-white flex items-center justify-center"
              aria-label="Próxima imagem"
            >
              <ChevronRight size={18} />
            </button>
            <span className="absolute top-2 right-2 bg-black/60 text-white rounded-full px-2 py-1 text-[10px]">
              {activeIndex + 1}/{gallery.length}
            </span>
          </>
        )}
      </div>

      {gallery.length > 1 && (
        <div className="flex justify-center gap-1.5 py-2">
          {gallery.map((_, index) => (
            <button
              type="button"
              key={index}
              onClick={() => setActiveIndex(index)}
              className={`w-1.5 h-1.5 rounded-full ${index === activeIndex ? 'bg-zebrazul-600' : 'bg-slate-300'}`}
              aria-label={`Ver imagem ${index + 1}`}
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
