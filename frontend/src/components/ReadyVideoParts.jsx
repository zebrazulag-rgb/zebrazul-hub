import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck, Check, Copy, Download, ExternalLink, Film, Loader2, Maximize2, Play, Plus, Search, Trash2, Undo2, Upload, X } from 'lucide-react';
import ModalBackdrop from './ModalBackdrop.jsx';
import { videoPlayback } from '../utils/videoEmbed.js';

export const PLATFORMS = [['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['facebook', 'Facebook'], ['linkedin', 'LinkedIn'], ['other', 'Outro']];
export const platformLabel = (k) => (PLATFORMS.find(([key]) => key === k) || [k, k || '—'])[1];
export const fmtDate = (v) => { if (!v) return '—'; const d = new Date(String(v).includes('T') || String(v).includes('Z') ? v : `${String(v).replace(' ', 'T')}Z`); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('pt-BR'); };
export const fmtSize = (b) => (b ? `${(b / 1048576).toFixed(b > 10485760 ? 0 : 1)} MB` : '');

function PlayerMedia({ video, p, big, vertical }) {
  if (p.kind === 'iframe') {
    const box = big ? 'h-[80vh] w-full' : vertical ? 'h-[520px] w-full' : 'aspect-video w-full';
    return <iframe title={video.title} src={p.src} allow="autoplay; fullscreen" allowFullScreen className={`${box} rounded-xl border-0 bg-black`} />;
  }
  // Arquivo: mantém a proporção original (vertical ou horizontal), sem cortar.
  return <video src={p.src} controls autoPlay={!big} playsInline preload="metadata" className={`mx-auto block w-auto max-w-full rounded-xl bg-black ${big ? 'max-h-[85vh]' : 'max-h-[460px]'}`} />;
}

export function Player({ video }) {
  const [open, setOpen] = useState(false);
  const [big, setBig] = useState(false);
  const [vertical, setVertical] = useState(false);
  const p = videoPlayback(video);
  if (p.kind === 'none') return null;
  if (p.kind === 'link') {
    return <a href={p.open} target="_blank" rel="noreferrer" className="mt-3 flex aspect-video items-center justify-center gap-2 rounded-xl bg-slate-100 text-xs font-bold text-[#3A85FD]"><ExternalLink size={14} /> Abrir link do vídeo</a>;
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="group relative mt-3 flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl bg-[#17181C]">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#C9FF2F] text-[#17181C] transition group-hover:scale-110"><Play size={20} fill="currentColor" /></span>
        <span className="absolute bottom-2 left-3 text-[10px] font-bold uppercase tracking-wider text-white/60">Assistir aqui</span>
      </button>
    );
  }
  return (
    <div className="mt-3">
      <PlayerMedia video={video} p={p} vertical={vertical} />
      <div className="mt-2 flex items-center justify-end gap-2">
        {p.kind === 'iframe' && <button type="button" onClick={() => setVertical((v) => !v)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-500 hover:text-[#3A85FD]">{vertical ? 'Formato horizontal' : 'Formato vertical'}</button>}
        <button type="button" onClick={() => setBig(true)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-500 hover:text-[#3A85FD]"><Maximize2 size={11} /> Ampliar</button>
      </div>
      {big && (
        <ModalBackdrop onClose={() => setBig(false)}>
          <div className="w-full max-w-5xl rounded-[24px] border border-slate-200 bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-3"><h2 className="truncate text-sm font-black text-slate-950">{video.client_name} · {video.title}</h2><button type="button" onClick={() => setBig(false)} className="rounded-xl bg-slate-50 p-2 text-slate-400 hover:text-slate-700"><X size={16} /></button></div>
            <PlayerMedia video={video} p={p} big />
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}

export function EditableTitle({ video, canEdit, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(video.title);
  useEffect(() => { setValue(video.title); }, [video.title]);
  async function commit() {
    const next = value.trim();
    setEditing(false);
    if (!next || next === video.title) { setValue(video.title); return; }
    await onSave(video, { title: next });
  }
  if (editing) {
    return <input autoFocus value={value} maxLength={160} onChange={(e) => setValue(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setValue(video.title); setEditing(false); } }} className="mt-1 w-full rounded-lg border border-[#3A85FD] px-2 py-1 text-sm font-black text-slate-950 outline-none" />;
  }
  return (
    <h3 className={`mt-1 line-clamp-2 text-sm font-black leading-5 text-slate-950 ${canEdit ? 'cursor-text rounded-md hover:bg-slate-50' : ''}`} title={canEdit ? 'Clique para editar o título' : undefined} onClick={() => canEdit && setEditing(true)}>{video.title}</h3>
  );
}

export function CaptionBox({ video, canEdit, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(video.caption || '');
  const [copied, setCopied] = useState(false);
  useEffect(() => { setValue(video.caption || ''); }, [video.caption]);
  async function save() { setEditing(false); if (value !== (video.caption || '')) await onSave(video, { caption: value }); }
  async function copy() {
    try { await navigator.clipboard.writeText(video.caption || ''); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* sem permissão de área de transferência */ }
  }
  if (editing) {
    return (
      <div className="mt-3">
        <textarea autoFocus value={value} onChange={(e) => setValue(e.target.value)} rows={6} maxLength={5000} placeholder="Escreva a legenda com CTA e hashtags…" className="w-full rounded-xl border border-[#3A85FD] px-3 py-2 text-xs leading-5 outline-none" />
        <div className="mt-1.5 flex justify-end gap-2">
          <button type="button" onClick={() => { setValue(video.caption || ''); setEditing(false); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-500">Cancelar</button>
          <button type="button" onClick={save} className="inline-flex items-center gap-1 rounded-lg bg-[#17181C] px-3 py-1.5 text-[11px] font-bold text-white"><Check size={12} /> Salvar legenda</button>
        </div>
      </div>
    );
  }
  if (!video.caption) {
    return canEdit ? <button type="button" onClick={() => setEditing(true)} className="mt-3 w-full rounded-xl border border-dashed border-slate-300 px-3 py-2 text-left text-[11px] font-bold text-slate-400 hover:border-[#3A85FD] hover:text-[#3A85FD]">+ Adicionar legenda</button> : null;
  }
  return (
    <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Legenda</p>
        <div className="flex gap-1.5">
          <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-slate-500 hover:text-[#3A85FD]">{copied ? <Check size={11} /> : <Copy size={11} />}{copied ? 'Copiada' : 'Copiar'}</button>
          {canEdit && <button type="button" onClick={() => setEditing(true)} className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-slate-500 hover:text-[#3A85FD]">Editar</button>}
        </div>
      </div>
      <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-line text-[11px] leading-5 text-slate-600">{video.caption}</p>
    </div>
  );
}

export function Modal({ title, subtitle, onClose, children, busy }) {
  return (
    <ModalBackdrop onClose={onClose} disabled={busy}>
      <div className="w-full max-w-lg rounded-[26px] border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div><h2 className="text-lg font-bold text-slate-950">{title}</h2>{subtitle && <p className="mt-1 text-xs leading-5 text-slate-400">{subtitle}</p>}</div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-xl bg-slate-50 p-2 text-slate-400 hover:text-slate-700"><X size={17} /></button>
        </div>
        {children}
      </div>
    </ModalBackdrop>
  );
}
export const inputCls = 'mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#3A85FD]';
