import test from 'node:test';
import assert from 'node:assert/strict';
import { videoPlayback, downloadHref } from './videoEmbed.js';

test('arquivo enviado toca direto e baixa com nome legível', () => {
  const v = { media_url: '/api/media/abc.mp4', title: 'Reel', client_name: 'Altus' };
  assert.equal(videoPlayback(v).kind, 'file');
  assert.equal(downloadHref(v), '/api/media/abc.mp4?download=Altus%20-%20Reel.mp4');
});
test('Drive vira player embutido e link de download', () => {
  const p = videoPlayback({ link_url: 'https://drive.google.com/file/d/1AbC_x-9/view?usp=sharing' });
  assert.equal(p.kind, 'iframe'); assert.equal(p.src, 'https://drive.google.com/file/d/1AbC_x-9/preview');
  assert.match(p.download, /uc\?export=download&id=1AbC_x-9/);
});
test('YouTube (watch, youtu.be, shorts) e Vimeo viram embed', () => {
  assert.equal(videoPlayback({ link_url: 'https://www.youtube.com/watch?v=abc123' }).src, 'https://www.youtube.com/embed/abc123');
  assert.equal(videoPlayback({ link_url: 'https://youtu.be/abc123' }).src, 'https://www.youtube.com/embed/abc123');
  assert.equal(videoPlayback({ link_url: 'https://www.youtube.com/shorts/abc123' }).src, 'https://www.youtube.com/embed/abc123');
  assert.equal(videoPlayback({ link_url: 'https://vimeo.com/12345' }).src, 'https://player.vimeo.com/video/12345');
});
test('mp4 direto toca; outro link só abre; inválido é none', () => {
  assert.equal(videoPlayback({ link_url: 'https://x.com/a/b.mp4' }).kind, 'file');
  assert.equal(videoPlayback({ link_url: 'https://wetransfer.com/downloads/x' }).kind, 'link');
  assert.equal(videoPlayback({ link_url: 'javascript:alert(1)' }).kind, 'none');
  assert.equal(videoPlayback({}).kind, 'none');
});
