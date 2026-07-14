import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal } from 'lucide-react';

export default function InstagramPreview({ clientName = 'sua_marca', clientColor = '#2563eb', imageSrc, caption, contentType = 'feed' }) {
  const initial = clientName?.[0]?.toUpperCase() || 'Z';

  return (
    <div className="w-full max-w-[380px] min-w-0 mx-auto bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Header */}
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

      {/* Imagem */}
      <div className="w-full aspect-square bg-slate-100 flex items-center justify-center overflow-hidden">
        {imageSrc ? (
          <img src={imageSrc} alt="Preview do post" className="w-full h-full object-cover" />
        ) : (
          <div className="text-center px-6">
            <p className="text-sm text-slate-400">Nenhuma imagem anexada ainda</p>
            <p className="text-xs text-slate-300 mt-1">A prévia aparece aqui ao anexar uma imagem</p>
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="px-3 pt-2.5 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <Heart size={22} className="text-slate-700" />
          <MessageCircle size={22} className="text-slate-700" />
          <Send size={20} className="text-slate-700" />
        </div>
        <Bookmark size={20} className="text-slate-700" />
      </div>

      {/* Legenda */}
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
