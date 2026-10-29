// Decide como assistir/baixar um vídeo sem sair do ZebraHub.
export function videoPlayback(video) {
  if (video?.media_url) return { kind: 'file', src: video.media_url };
  const url = String(video?.link_url || '').trim();
  if (!/^https?:\/\//i.test(url)) return { kind: 'none' };
  let u;
  try { u = new URL(url); } catch { return { kind: 'none' }; }
  const host = u.hostname.replace(/^www\./, '');
  if (host === 'drive.google.com' || host === 'docs.google.com') {
    const id = (u.pathname.match(/\/file\/d\/([\w-]+)/) || [])[1] || u.searchParams.get('id');
    if (id) return { kind: 'iframe', src: `https://drive.google.com/file/d/${id}/preview`, download: `https://drive.google.com/uc?export=download&id=${id}`, open: url };
  }
  if (host === 'youtu.be' || host.endsWith('youtube.com')) {
    const id = host === 'youtu.be' ? u.pathname.slice(1) : (u.searchParams.get('v') || (u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]+)/) || [])[1]);
    if (id) return { kind: 'iframe', src: `https://www.youtube.com/embed/${id}`, open: url };
  }
  if (host.endsWith('vimeo.com')) {
    const id = (u.pathname.match(/\/(\d+)/) || [])[1];
    if (id) return { kind: 'iframe', src: `https://player.vimeo.com/video/${id}`, open: url };
  }
  if (/\.(mp4|mov|webm|m4v)$/i.test(u.pathname)) return { kind: 'file', src: url, external: true };
  return { kind: 'link', open: url };
}

export function downloadHref(video) {
  if (video?.media_url) {
    const ext = (video.media_url.match(/\.(\w+)$/) || [])[1] || 'mp4';
    const name = `${(video.client_name || 'cliente')} - ${video.title || 'video'}.${ext}`;
    return `${video.media_url}?download=${encodeURIComponent(name)}`;
  }
  const p = videoPlayback(video);
  return p.download || p.src || p.open || null;
}
