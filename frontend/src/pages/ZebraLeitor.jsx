import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, BookOpen, CheckCircle2, Headphones, Loader2, MoreVertical, Pencil, Plus, Search, Trash2, UploadCloud, X } from 'lucide-react';
import api from '../api';
import { friendlyPdfError, inspectPdfFile } from '../utils/pdfjs.js';

const FILTERS = [
  { key: 'recent', label: 'Recentes' },
  { key: 'progress', label: 'Em andamento' },
  { key: 'done', label: 'Concluídos' },
];

const PALETTES = [['#0b3d91', '#0969ff'], ['#3b1d6e', '#7c3aed'], ['#0f5132', '#16a34a'], ['#7c2d12', '#ea580c'], ['#1e293b', '#475569'], ['#831843', '#db2777']];
const paletteFor = (title) => PALETTES[[...String(title)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % PALETTES.length];

export function BookCover({ book, className = '' }) {
  const [from, to] = paletteFor(book.title);
  if (book.cover_data) return <img src={book.cover_data} alt={`Capa de ${book.title}`} className={`h-full w-full object-cover ${className}`} />;
  return (
    <div className={`flex h-full w-full flex-col justify-between p-4 text-white ${className}`} style={{ background: `linear-gradient(155deg, ${from}, ${to})` }}>
      <BookOpen size={20} className="opacity-70" />
      <div>
        <p className="line-clamp-4 font-serif text-lg font-bold leading-snug">{book.title}</p>
        {book.author && <p className="mt-2 line-clamp-2 text-xs uppercase tracking-wider text-white/75">{book.author}</p>}
      </div>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  return bytes >= 1024 * 1024 * 1024 ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB` : `${Math.max(0.1, bytes / 1024 / 1024).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function ProgressBar({ percent }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
      <div className="h-full rounded-full bg-[#0969ff] transition-all" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
    </div>
  );
}

function BookCard({ book, onEdit, onDelete }) {
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menu]);
  const done = book.percent >= 100;
  return (
    <article className="group relative">
      <Link to={`/leitor/${book.id}`} className="block">
        <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-slate-100 shadow-md ring-1 ring-slate-200 transition group-hover:-translate-y-0.5 group-hover:shadow-xl">
          <BookCover book={book} />
          {done && <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white shadow"><CheckCircle2 size={11} /> Concluído</span>}
          {book.text_status === 'no_text' && <span title="PDF digitalizado: sem texto para narrar" className="absolute bottom-2 left-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white shadow">Sem texto</span>}
        </div>
        <h3 className="mt-2.5 line-clamp-2 text-sm font-bold leading-snug text-slate-900">{book.title}</h3>
        <p className="line-clamp-1 text-xs text-slate-500">{book.author || 'Autor não informado'}</p>
        <div className="mt-2 flex items-center gap-2">
          <ProgressBar percent={book.percent} />
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-500">{book.percent}%</span>
        </div>
        <p className="mt-0.5 text-[11px] text-slate-400">{book.page_count ? `${book.page_count} páginas` : 'Páginas não identificadas'}</p>
      </Link>
      <div className="absolute right-1.5 top-1.5">
        <button type="button" aria-label="Opções do livro" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenu((v) => !v); }} className="rounded-full bg-black/45 p-1.5 text-white opacity-100 backdrop-blur transition hover:bg-black/65 md:opacity-0 md:group-hover:opacity-100">
          <MoreVertical size={15} />
        </button>
        {menu && (
          <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-8 z-20 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-xl">
            <button type="button" onClick={() => { setMenu(false); onEdit(book); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50"><Pencil size={14} /> Editar</button>
            <button type="button" onClick={() => { setMenu(false); onDelete(book); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-rose-600 hover:bg-rose-50"><Trash2 size={14} /> Excluir</button>
          </div>
        )}
      </div>
    </article>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/50 p-3 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Fechar"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function ZebraLeitor() {
  const navigate = useNavigate();
  const fileInput = useRef(null);
  const [books, setBooks] = useState([]);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('recent');
  const [uploads, setUploads] = useState([]); // {id, name, state: reading|uploading|done|error, progress, message}
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/books');
      setBooks(data.books || []);
      setUsage(data.usage || null);
      setError('');
    } catch (e) {
      setError(e.response?.data?.error || 'Não foi possível carregar sua biblioteca.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const patchUpload = (id, patch) => setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)));

  async function handleFiles(fileList) {
    const files = [...fileList];
    for (const file of files) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setUploads((list) => [...list, { id, name: file.name, state: 'reading', progress: 0, message: 'Lendo o PDF…' }]);
      if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { patchUpload(id, { state: 'error', message: 'Escolha um arquivo PDF.' }); continue; }
      if (usage && file.size > usage.max_file_bytes) { patchUpload(id, { state: 'error', message: `O arquivo passa do limite de ${formatBytes(usage.max_file_bytes)}.` }); continue; }
      try {
        const info = await inspectPdfFile(file);
        patchUpload(id, { state: 'uploading', message: 'Enviando…' });
        const form = new FormData();
        form.append('file', file, file.name);
        form.append('title', info.title || file.name.replace(/\.pdf$/i, '').replace(/[_]+/g, ' '));
        form.append('author', info.author || '');
        form.append('page_count', String(info.pageCount));
        form.append('text_status', info.textStatus);
        if (info.cover) form.append('cover_data', info.cover);
        const { data } = await api.post('/books', form, { onUploadProgress: (e) => patchUpload(id, { progress: e.total ? Math.round((e.loaded / e.total) * 100) : 0 }), timeout: 0 });
        setBooks((list) => [data.book, ...list]);
        patchUpload(id, { state: 'done', progress: 100, message: info.textStatus === 'no_text' ? 'Adicionado. Atenção: PDF digitalizado, sem texto para narrar (precisa de OCR).' : 'Livro adicionado!' });
        window.setTimeout(() => setUploads((list) => list.filter((u) => u.id !== id)), info.textStatus === 'no_text' ? 9000 : 3500);
        load();
      } catch (e) {
        const serverMessage = e.response?.data?.error;
        patchUpload(id, { state: 'error', message: serverMessage || friendlyPdfError(e) });
      }
    }
  }

  async function saveEdit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.patch(`/books/${editing.id}`, { title: editing.title, author: editing.author });
      setBooks((list) => list.map((b) => (b.id === data.book.id ? data.book : b)));
      setEditing(null);
    } catch (e) { setError(e.response?.data?.error || 'Não foi possível salvar.'); setEditing(null); }
    finally { setSaving(false); }
  }

  async function confirmDelete() {
    setSaving(true);
    try {
      await api.delete(`/books/${deleting.id}`);
      setBooks((list) => list.filter((b) => b.id !== deleting.id));
      load();
    } catch (e) { setError(e.response?.data?.error || 'Não foi possível excluir o livro.'); }
    finally { setSaving(false); setDeleting(null); }
  }

  const continueReading = useMemo(() => books.find((b) => b.last_opened_at && b.percent < 100) || null, [books]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = books.filter((b) => !q || `${b.title} ${b.author}`.toLowerCase().includes(q));
    if (filter === 'progress') list = list.filter((b) => b.percent > 0 && b.percent < 100);
    if (filter === 'done') list = list.filter((b) => b.percent >= 100);
    return list;
  }, [books, query, filter]);

  const counts = useMemo(() => ({
    recent: books.length,
    progress: books.filter((b) => b.percent > 0 && b.percent < 100).length,
    done: books.filter((b) => b.percent >= 100).length,
  }), [books]);

  return (
    <div
      className="space-y-6 pb-24"
      onDragOver={(e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files); }}
    >
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[65] flex items-center justify-center bg-[#0969ff]/15 backdrop-blur-sm">
          <div className="rounded-3xl border-2 border-dashed border-[#0969ff] bg-white px-10 py-8 text-center shadow-2xl">
            <UploadCloud size={36} className="mx-auto text-[#0969ff]" />
            <p className="mt-2 text-lg font-bold text-slate-900">Solte o PDF para adicionar à biblioteca</p>
          </div>
        </div>
      )}

      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0969ff]">Minha biblioteca</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-950"><Headphones size={24} className="text-[#0969ff]" /> Zebra Leitor</h1>
          <p className="mt-1 text-sm text-slate-500">Leia seus PDFs e ouça em voz alta, com o progresso salvo em cada livro.</p>
        </div>
        <div>
          <input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }} />
          <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0969ff] px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700 sm:w-auto"><Plus size={17} /> Adicionar livro</button>
        </div>
      </section>

      {error && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700"><AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}</div>}

      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((u) => (
            <div key={u.id} className={`rounded-xl border px-4 py-3 text-sm ${u.state === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : u.state === 'done' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-blue-100 bg-blue-50 text-blue-800'}`}>
              <div className="flex items-center gap-2">
                {u.state === 'error' ? <AlertTriangle size={15} /> : u.state === 'done' ? <CheckCircle2 size={15} /> : <Loader2 size={15} className="animate-spin" />}
                <span className="min-w-0 flex-1 truncate font-semibold">{u.name}</span>
                {u.state === 'error' && <button type="button" onClick={() => setUploads((l) => l.filter((x) => x.id !== u.id))} aria-label="Dispensar"><X size={14} /></button>}
              </div>
              <p className="mt-0.5 text-xs">{u.message}{u.state === 'uploading' ? ` ${u.progress}%` : ''}</p>
              {u.state === 'uploading' && <div className="mt-1.5"><ProgressBar percent={u.progress} /></div>}
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[260px] items-center justify-center text-slate-400"><Loader2 className="animate-spin" /></div>
      ) : books.length === 0 ? (
        <div className="flex min-h-[340px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-[#0969ff]"><BookOpen size={28} /></div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">Sua biblioteca está vazia</h2>
          <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">Adicione um livro em PDF (pelo computador ou celular) para ler e ouvir em português. Seus livros são privados: só você tem acesso.</p>
          <button type="button" onClick={() => fileInput.current?.click()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#0969ff] px-4 py-3 text-sm font-bold text-white hover:bg-blue-700"><Plus size={16} /> Adicionar primeiro livro</button>
        </div>
      ) : (
        <>
          {continueReading && !query && (
            <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 to-[#0b3d91] p-4 text-white shadow-lg sm:p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-200">Continuar lendo</p>
              <div className="mt-3 flex gap-4">
                <div className="aspect-[3/4] w-24 shrink-0 overflow-hidden rounded-lg shadow-xl ring-1 ring-white/20 sm:w-28"><BookCover book={continueReading} /></div>
                <div className="flex min-w-0 flex-1 flex-col justify-between">
                  <div>
                    <h2 className="line-clamp-2 text-lg font-bold leading-snug sm:text-xl">{continueReading.title}</h2>
                    <p className="text-sm text-blue-100/80">{continueReading.author || 'Autor não informado'}</p>
                    <p className="mt-2 text-xs text-blue-100/70">Parou na página {continueReading.current_page}{continueReading.page_count ? ` de ${continueReading.page_count}` : ''} · {continueReading.percent}% lido</p>
                    <div className="mt-2 h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-white" style={{ width: `${continueReading.percent}%` }} /></div>
                  </div>
                  <button type="button" onClick={() => navigate(`/leitor/${continueReading.id}`)} className="mt-3 inline-flex w-fit items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-blue-50"><BookOpen size={16} /> Continuar de onde parei</button>
                </div>
              </div>
            </section>
          )}

          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="inline-flex self-start rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                {FILTERS.map((f) => (
                  <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition ${filter === f.key ? 'bg-slate-950 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                    {f.label}
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${filter === f.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>{counts[f.key]}</span>
                  </button>
                ))}
              </div>
              <div className="relative sm:w-72">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por título ou autor" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-[#0969ff] focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>

            {visible.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
                {query ? 'Nenhum livro encontrado para essa busca.' : filter === 'progress' ? 'Nenhum livro em andamento.' : 'Nenhum livro concluído ainda.'}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                {visible.map((book) => <BookCard key={book.id} book={book} onEdit={(b) => setEditing({ id: b.id, title: b.title, author: b.author })} onDelete={setDeleting} />)}
              </div>
            )}
          </section>
          {usage && <p className="text-center text-[11px] text-slate-400">Biblioteca: {formatBytes(usage.used_bytes)} de {formatBytes(usage.max_bytes)} · cada PDF até {formatBytes(usage.max_file_bytes)}</p>}
        </>
      )}

      {editing && (
        <Modal title="Editar livro" onClose={() => setEditing(null)}>
          <form onSubmit={saveEdit} className="space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Título
              <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} maxLength={200} required className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-[#0969ff]" />
            </label>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Autor
              <input value={editing.author} onChange={(e) => setEditing({ ...editing, author: e.target.value })} maxLength={200} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-slate-900 outline-none focus:border-[#0969ff]" />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditing(null)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50">Cancelar</button>
              <button type="submit" disabled={saving || !editing.title.trim()} className="inline-flex items-center gap-2 rounded-xl bg-[#0969ff] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving && <Loader2 size={14} className="animate-spin" />} Salvar</button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal title="Excluir livro?" onClose={() => setDeleting(null)}>
          <p className="text-sm leading-6 text-slate-600">“{deleting.title}” será removido da sua biblioteca, junto com o arquivo, o progresso e todas as marcações e anotações. Essa ação não pode ser desfeita.</p>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setDeleting(null)} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50">Cancelar</button>
            <button type="button" onClick={confirmDelete} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving && <Loader2 size={14} className="animate-spin" />} Excluir definitivamente</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
