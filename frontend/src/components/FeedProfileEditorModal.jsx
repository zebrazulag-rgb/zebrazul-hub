import { useRef, useState } from 'react';
import api from '../api';
import ModalBackdrop from './ModalBackdrop.jsx';
import AvatarUpload from './AvatarUpload.jsx';
import FeedHighlightsManager from './FeedHighlightsManager.jsx';
import { formChanged } from '../utils/formState.js';

function Field({ label, value, onChange, placeholder = '', type = 'text' }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      <input type={type} className="input-field" value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

function buildDraft(client, postsCount) {
  return {
    instagram_username: client?.instagram_username || client?.name?.toLowerCase().replace(/[^a-z0-9]+/gi, '') || '',
    instagram_display_name: client?.instagram_display_name || client?.name || '',
    bio: client?.bio || '',
    instagram_posts_count: client?.instagram_posts_count ?? postsCount ?? 0,
    instagram_followers_count: client?.instagram_followers_count ?? 0,
    instagram_following_count: client?.instagram_following_count ?? 0,
    instagram_link: client?.instagram_link || '',
    instagram_primary_action: client?.instagram_primary_action || 'Seguindo',
    instagram_secondary_action: client?.instagram_secondary_action || 'Mensagem',
    instagram_tertiary_action: client?.instagram_tertiary_action || 'Contato',
    avatar_data: client?.avatar_data || null,
    avatar_mime: client?.avatar_mime || null,
  };
}

/**
 * Editor do perfil do Instagram (foto, nome, usuário, bio, link, contadores,
 * botões e destaques). Grava em PUT /clients/:id/feed-profile, a mesma rota do Feed.
 * Fecha ao salvar; ao fechar com alterações pendentes, salva automaticamente
 * (mesmo comportamento do editor do Feed).
 */
export default function FeedProfileEditorModal({
  client,
  postsCount,
  highlights,
  onHighlightsChange,
  onSaved,
  onClose,
}) {
  const initialRef = useRef(buildDraft(client, postsCount));
  const [draft, setDraft] = useState(initialRef.current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (value) => setDraft((current) => ({ ...current, [key]: value }));
  const setCount = (key) => (value) => setDraft((current) => ({ ...current, [key]: Number(value) || 0 }));

  async function save() {
    if (!client?.id) return false;
    setSaving(true);
    setError('');
    try {
      await api.put(`/clients/${client.id}/feed-profile`, draft);
      onSaved?.({ ...client, ...draft });
      onClose();
      return true;
    } catch (err) {
      const status = err.response?.status;
      setError(`${err.response?.data?.error || 'Não foi possível salvar o perfil.'}${status ? ` (HTTP ${status})` : ''}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function requestClose() {
    if (saving) return;
    if (!formChanged(initialRef.current, draft)) {
      onClose();
      return;
    }
    await save();
  }

  return (
    <ModalBackdrop onClose={requestClose} disabled={saving} className="bg-black/45">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Editar perfil</h2>
            <p className="text-sm text-slate-500">As informações abaixo aparecem na prévia do Instagram.</p>
          </div>
          <button type="button" onClick={requestClose} className="text-2xl text-slate-400" aria-label="Fechar">×</button>
        </div>

        <div className="mb-5 flex items-center gap-4">
          <AvatarUpload
            imageSrc={draft.avatar_data}
            fallbackText={client?.name}
            fallbackColor={client?.logo_color}
            size={86}
            onChange={(data, mime) => setDraft((current) => ({ ...current, avatar_data: data, avatar_mime: mime }))}
          />
          <p className="text-sm text-slate-500">Clique na foto para alterar o avatar do perfil.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Usuário do Instagram" value={draft.instagram_username} onChange={set('instagram_username')} placeholder="nomedoperfil" />
          <Field label="Nome exibido" value={draft.instagram_display_name} onChange={set('instagram_display_name')} placeholder="Nome | Cidade" />
          <Field label="Posts" type="number" value={draft.instagram_posts_count} onChange={setCount('instagram_posts_count')} />
          <Field label="Seguidores" type="number" value={draft.instagram_followers_count} onChange={setCount('instagram_followers_count')} />
          <Field label="Seguindo" type="number" value={draft.instagram_following_count} onChange={setCount('instagram_following_count')} />
          <Field label="Link da bio" value={draft.instagram_link} onChange={set('instagram_link')} placeholder="linktr.ee/perfil" />
          <Field label="Botão 1" value={draft.instagram_primary_action} onChange={set('instagram_primary_action')} />
          <Field label="Botão 2" value={draft.instagram_secondary_action} onChange={set('instagram_secondary_action')} />
          <Field label="Botão 3" value={draft.instagram_tertiary_action} onChange={set('instagram_tertiary_action')} />
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Bio</label>
            <textarea className="input-field min-h-[110px]" value={draft.bio || ''} onChange={(e) => set('bio')(e.target.value)} />
          </div>
        </div>

        <FeedHighlightsManager clientId={client?.id} highlights={highlights} onHighlightsChange={onHighlightsChange} />

        {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="mt-6 flex gap-3 border-t border-slate-100 pt-4">
          <button type="button" onClick={onClose} disabled={saving} className="btn-secondary flex-1">Cancelar</button>
          <button type="button" onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Salvando...' : 'Salvar perfil'}</button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
