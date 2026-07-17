import { ArrowLeft, Bell, Grid3x3, Link2, MoreVertical, SquareUserRound, UserPlus } from 'lucide-react';

function formatMetric(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('pt-BR').format(number);
}

export default function InstagramProfileMockup({ client, posts, onPostClick, editable = false, onEdit }) {
  const username = client?.instagram_username || client?.name?.toLowerCase().replace(/[^a-z0-9]+/gi, '') || 'perfil';
  const displayName = client?.instagram_display_name || client?.name || 'Nome do perfil';
  const postsCount = client?.instagram_posts_count ?? posts.length;
  const followers = client?.instagram_followers_count ?? 0;
  const following = client?.instagram_following_count ?? 0;
  const profileLink = client?.instagram_link || '';

  return (
    <div className="w-full max-w-[620px] overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl">
      <div className="flex items-center justify-between px-5 py-4">
        <ArrowLeft size={28} strokeWidth={2.2} />
        <p className="min-w-0 flex-1 truncate px-4 text-center text-[23px] font-bold text-black">{username}</p>
        <div className="flex items-center gap-4">
          <Bell size={27} strokeWidth={2.1} />
          <MoreVertical size={27} strokeWidth={2.1} />
        </div>
      </div>

      {editable && (
        <div className="px-5 pb-2 text-right">
          <button onClick={onEdit} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200">
            Editar perfil do feed
          </button>
        </div>
      )}

      <div className="px-5 pb-4">
        <div className="grid grid-cols-[118px_1fr] items-center gap-5">
          {client?.avatar_data ? (
            <img src={client.avatar_data} alt="" className="h-[112px] w-[112px] rounded-full object-cover" />
          ) : (
            <div className="flex h-[112px] w-[112px] items-center justify-center rounded-full text-4xl font-bold text-white" style={{ backgroundColor: client?.logo_color || '#111827' }}>
              {client?.name?.[0] || '?'}
            </div>
          )}
          <div className="grid grid-cols-3 text-center">
            <div><p className="text-[22px] font-bold text-black">{formatMetric(postsCount)}</p><p className="text-[16px] text-black">Posts</p></div>
            <div><p className="text-[22px] font-bold text-black">{formatMetric(followers)}</p><p className="text-[16px] text-black">Seguidores</p></div>
            <div><p className="text-[22px] font-bold text-black">{formatMetric(following)}</p><p className="text-[16px] text-black">Seguindo</p></div>
          </div>
        </div>

        <div className="mt-4 text-[16px] leading-[1.35] text-black">
          <p className="font-bold">{displayName}</p>
          <p className="whitespace-pre-wrap">{client?.bio || 'Bio do perfil'}</p>
          {profileLink && (
            <a href={profileLink.startsWith('http') ? profileLink : `https://${profileLink}`} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 font-medium text-[#244f9c] hover:underline">
              <Link2 size={21} /> <span className="truncate">{profileLink.replace(/^https?:\/\//, '')}</span>
            </a>
          )}
        </div>

        <div className="mt-4 grid grid-cols-[1fr_1fr_1fr_54px] gap-3">
          {[client?.instagram_primary_action || 'Seguindo', client?.instagram_secondary_action || 'Mensagem', client?.instagram_tertiary_action || 'Contato'].map((label) => (
            <button key={label} className="rounded-md bg-[#ececec] px-2 py-2 text-[16px] font-medium text-black">{label}</button>
          ))}
          <button className="flex items-center justify-center rounded-md bg-[#ececec]"><UserPlus size={22} /></button>
        </div>
      </div>

      <div className="grid grid-cols-3 border-b border-slate-200">
        <div className="flex h-14 items-center justify-center border-b-2 border-black"><Grid3x3 size={29} /></div>
        <div className="flex h-14 items-center justify-center"><div className="rounded-md border-2 border-black p-1"><span className="text-lg font-bold">▶</span></div></div>
        <div className="flex h-14 items-center justify-center"><SquareUserRound size={29} /></div>
      </div>

      {posts.length === 0 ? (
        <p className="px-5 py-16 text-center text-sm text-slate-400">Nenhum post agendado ainda.</p>
      ) : (
        <div className="grid grid-cols-3 gap-[3px] bg-white p-[3px]">
          {posts.map((post) => (
            <button key={post.id} onClick={() => onPostClick?.(post)} className="relative aspect-[4/5] overflow-hidden bg-slate-100">
              {post.media_data ? <img src={post.media_data} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full bg-slate-100" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
