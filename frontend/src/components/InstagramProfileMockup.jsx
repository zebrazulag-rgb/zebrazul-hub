import { ArrowLeft, Bell, Grid3x3, Images, Link2, MoreVertical, SquareUserRound, UserPlus } from 'lucide-react';
import { coverAnalysisKey, coverStatusMeta, isVideoContent } from './FeedCoverDashboard.jsx';

function formatMetric(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('pt-BR').format(number);
}

export default function InstagramProfileMockup({ client, posts, highlights = [], onPostClick, editable = false, onEdit, coverAnalyses = {}, sourceType = 'planned', showCoverBadges = true }) {
  const username = client?.instagram_username || client?.name?.toLowerCase().replace(/[^a-z0-9]+/gi, '') || 'perfil';
  const displayName = client?.instagram_display_name || client?.name || 'Nome do perfil';
  const postsCount = client?.instagram_posts_count ?? posts.length;
  const followers = client?.instagram_followers_count ?? 0;
  const following = client?.instagram_following_count ?? 0;
  const profileLink = client?.instagram_link || '';

  return (
    <div className="instagram-profile-mockup w-full min-w-0 max-w-[620px] overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-xl sm:rounded-[28px]">
      <div className="flex items-center justify-between px-3 py-3 sm:px-5 sm:py-4">
        <ArrowLeft className="h-6 w-6 shrink-0 sm:h-7 sm:w-7" strokeWidth={2.2} />
        <p className="min-w-0 flex-1 truncate px-2 text-center text-[18px] font-bold text-black sm:px-4 sm:text-[23px]">{username}</p>
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <Bell className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.1} />
          <MoreVertical className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.1} />
        </div>
      </div>

      {editable && (
        <div className="px-3 pb-2 text-right sm:px-5">
          <button onClick={onEdit} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200">
            Editar perfil do feed
          </button>
        </div>
      )}

      <div className="px-3 pb-4 sm:px-5">
        <div className="grid grid-cols-[82px_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[118px_1fr] sm:gap-5">
          {client?.avatar_data ? (
            <img src={client.avatar_data} alt="" className="h-[78px] w-[78px] rounded-full object-cover sm:h-[112px] sm:w-[112px]" />
          ) : (
            <div className="flex h-[78px] w-[78px] items-center justify-center rounded-full text-2xl font-bold text-white sm:h-[112px] sm:w-[112px] sm:text-4xl" style={{ backgroundColor: client?.logo_color || '#111827' }}>
              {client?.name?.[0] || '?'}
            </div>
          )}
          <div className="grid min-w-0 grid-cols-3 gap-1 text-center">
            <div><p className="text-[16px] font-bold text-black sm:text-[22px]">{formatMetric(postsCount)}</p><p className="text-[11px] text-black sm:text-[16px]">Posts</p></div>
            <div><p className="text-[16px] font-bold text-black sm:text-[22px]">{formatMetric(followers)}</p><p className="text-[11px] text-black sm:text-[16px]">Seguidores</p></div>
            <div><p className="text-[16px] font-bold text-black sm:text-[22px]">{formatMetric(following)}</p><p className="text-[11px] text-black sm:text-[16px]">Seguindo</p></div>
          </div>
        </div>

        <div className="mt-3 text-[13px] leading-[1.35] text-black sm:mt-4 sm:text-[16px]">
          <p className="font-bold">{displayName}</p>
          <p className="whitespace-pre-wrap">{client?.bio || 'Bio do perfil'}</p>
          {profileLink && (
            <a href={profileLink.startsWith('http') ? profileLink : `https://${profileLink}`} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 font-medium text-[#244f9c] hover:underline">
              <Link2 size={21} /> <span className="truncate">{profileLink.replace(/^https?:\/\//, '')}</span>
            </a>
          )}
        </div>

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_38px] gap-1.5 sm:mt-4 sm:grid-cols-[1fr_1fr_1fr_54px] sm:gap-3">
          {[client?.instagram_primary_action || 'Seguindo', client?.instagram_secondary_action || 'Mensagem', client?.instagram_tertiary_action || 'Contato'].map((label) => (
            <button key={label} className="min-w-0 truncate rounded-md bg-[#ececec] px-1 py-2 text-[11px] font-medium text-black sm:px-2 sm:text-[16px]">{label}</button>
          ))}
          <button className="flex items-center justify-center rounded-md bg-[#ececec]"><UserPlus size={22} /></button>
        </div>
      </div>

      {highlights.filter((item) => Number(item.visible ?? 1) !== 0).length > 0 && (
        <div className="overflow-x-auto px-3 pb-3 pt-1 sm:px-5 sm:pb-4">
          <div className="flex min-w-max gap-3 sm:gap-4">
            {highlights.filter((item) => Number(item.visible ?? 1) !== 0).map((item) => (
              <div key={item.id} className="w-[68px] shrink-0 text-center sm:w-[78px]">
                <div className="mx-auto h-[62px] w-[62px] rounded-full border-[3px] border-[#d8dbe0] bg-white p-[3px] sm:h-[70px] sm:w-[70px]">
                  <div className="h-full w-full overflow-hidden rounded-full bg-slate-100">
                    {item.cover_data ? (
                      <img src={item.cover_data} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-base font-bold text-slate-400">{item.name?.[0]?.toUpperCase() || '?'}</div>
                    )}
                  </div>
                </div>
                <p className="mt-1.5 truncate text-[10px] font-medium leading-tight text-black sm:text-[11px]" title={item.name}>{item.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 border-b border-slate-200">
        <div className="flex h-14 items-center justify-center border-b-2 border-black"><Grid3x3 size={29} /></div>
        <div className="flex h-14 items-center justify-center"><div className="rounded-md border-2 border-black p-1"><span className="text-lg font-bold">▶</span></div></div>
        <div className="flex h-14 items-center justify-center"><SquareUserRound size={29} /></div>
      </div>

      {posts.length === 0 ? (
        <p className="px-5 py-16 text-center text-sm text-slate-400">Nenhum post agendado ainda.</p>
      ) : (
        <div className="grid grid-cols-3 gap-[3px] bg-white p-[3px]">
          {posts.map((post) => {
            const galleryCount = Array.isArray(post.media_gallery) ? post.media_gallery.length : 0;
            const sourceId = post.id ?? post.content_id;
            const analysis = coverAnalyses[coverAnalysisKey(sourceType, sourceId)];
            const video = isVideoContent(post.content_type);
            const status = coverStatusMeta(analysis?.status);
            const badgeTone = {
              emerald: 'bg-emerald-500 text-white',
              rose: 'bg-rose-500 text-white',
              amber: 'bg-amber-400 text-slate-950',
              slate: 'bg-slate-900/75 text-white',
            }[status.tone] || 'bg-slate-900/75 text-white';
            const mediaSrc = post.media_data || post.thumbnail_url || null;
            return (
              <button key={`${sourceType}-${sourceId}`} onClick={() => onPostClick?.(post)} className="group relative aspect-[4/5] overflow-hidden bg-slate-100 text-left">
                {mediaSrc ? <img src={mediaSrc} alt="" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" /> : <div className="flex h-full w-full items-center justify-center bg-slate-100 px-3 text-center text-[11px] font-semibold text-slate-400">Sem imagem de grade</div>}
                {galleryCount > 1 && (
                  <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold text-white shadow">
                    <Images size={13} /> {galleryCount}
                  </span>
                )}
                {showCoverBadges && video && (
                  <span
                    className={`absolute bottom-2 left-2 max-w-[85%] truncate rounded-full px-2 py-1 text-[9px] font-black tracking-[0.06em] shadow ${badgeTone}`}
                    title={analysis?.summary || status.label}
                  >
                    {status.short || status.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
