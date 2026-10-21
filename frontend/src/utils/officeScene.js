// Nosso Escritório: cena em pixel art desenhada em canvas de baixa resolução (320 de largura),
// ampliada via CSS. Sem imagens, sem bibliotecas, sem leitura de teclado/mouse da pessoa.
export const W = 320;
export const STATUS_LABEL = { available: 'Disponível', focus: 'Concentrado', meeting: 'Em reunião', away: 'Ausente', offline: 'Offline' };
export const STATUS_COLOR = { available: '#5fe08f', focus: '#a78bfa', meeting: '#5aa9ff', away: '#9aa3b8', offline: '#5d6480' };
export const SKINS = ['#f3d2b3', '#e9bd9a', '#c68c63', '#9b6a47', '#6f4630'];
export const HAIRS = ['#14181c', '#3c2a1f', '#7a4a2a', '#c8892f', '#c9d1d8', '#b4366b'];
export const SHIRTS = ['#3b82c4', '#d9625f', '#4aa37a', '#8a6bc9', '#e0a43a', '#3e9aa6'];
export const STYLES = [['short', 'Curto'], ['long', 'Longo'], ['bun', 'Coque'], ['curly', 'Cacheado'], ['bald', 'Raspado']];
export const ACCS = [['none', 'Nenhum'], ['glasses', 'Óculos'], ['cap', 'Boné']];

const COLS = [78, 170, 262];
const ROW_Y = 90;
const ROW_STEP = 52;
const PLANTS_TOP = [[8, 110], [312, 124], [124, 152]];

export function layoutFor(n) {
  const count = Math.max(1, n);
  const rows = Math.max(2, Math.ceil(count / 3));
  const oy = (rows - 2) * ROW_STEP;
  const seats = [];
  for (let i = 0; i < count; i += 1) seats.push([COLS[i % 3], ROW_Y + ROW_STEP * Math.floor(i / 3)]);
  return { rows, oy, H: 220 + oy, seats };
}

function plainFirstName(name) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  return first.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8);
}

// Converte a resposta da API em "moradores" do escritório.
export function prepareTeam(team) {
  return (team || []).map((m, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const partner = col === 0 ? i + 1 : col === 1 ? i - 1 : -1;
    return {
      ...m,
      seat: i,
      first: plainFirstName(m.name) || 'EQUIPE',
      chair: SHIRTS[i % SHIRTS.length],
      partner: partner >= 0 && partner < team.length ? partner : -1,
      side: col === 0 ? 1 : -1,
      off: col < 2 ? row : (i + 1) % 4, // dupla compartilha o ritmo, então as conversas coincidem
    };
  });
}

function R(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x | 0, y | 0, w | 0, h | 0); }
function shade(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  const t = a < 0 ? 0 : 255;
  const p = Math.abs(a);
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round((t - v) * p + v).toString(16).padStart(2, '0')).join('')}`;
}
const FONT = { A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101111011', R: '110101110101101', S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010', Z: '111001010100111' };
function txt(c, s, x, y, col) {
  for (let i = 0; i < s.length; i += 1) {
    const g = FONT[s[i]];
    if (!g) continue;
    for (let k = 0; k < 15; k += 1) if (g[k] === '1') R(c, x + i * 4 + (k % 3), y + ((k / 3) | 0), 1, 1, col);
  }
}
const twidth = (s) => s.length * 4 - 1;

export function timeBucket(date = new Date()) {
  const h = date.getHours();
  return h >= 6 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'dusk' : 'night';
}

function plant(c, x, y, sway) {
  R(c, x - 4, y + 8, 10, 9, '#c1633f'); R(c, x - 5, y + 7, 12, 2, '#d27a54');
  R(c, x - 1, y - 6, 2, 14, '#2a7a43');
  R(c, x - 8 + sway, y - 2, 8, 4, '#3f9a52'); R(c, x + 2 - sway, y - 4, 9, 4, '#3f9a52');
  R(c, x - 5, y - 9, 5, 5, '#4db063'); R(c, x + 1, y - 10, 6, 5, '#2f8a4a');
}

function desk(c, cx, y, u) {
  R(c, cx - 30, y, 60, 14, '#e0b27a'); R(c, cx - 30, y, 60, 1, '#f0cc9a'); R(c, cx - 30, y + 14, 60, 8, '#b98750'); R(c, cx - 30, y + 21, 60, 1, '#8c6238');
  R(c, cx + 16, y + 15, 12, 5, '#a3753f'); R(c, cx + 20, y + 17, 4, 1, '#e8d2a8');
  R(c, cx - 30, y + 22, 3, 5, '#8c6238'); R(c, cx + 27, y + 22, 3, 5, '#8c6238');
  const w = twidth(u.first);
  R(c, (cx - w / 2 - 2) | 0, y + 14, w + 4, 7, '#6b4a2a');
  txt(c, u.first, (cx - w / 2) | 0, y + 15, '#f3ecdf');
  R(c, cx - 9, y + 7, 18, 3, '#e8e2d6');
  for (let i = 0; i < 6; i += 1) R(c, cx - 8 + i * 3, y + 8, 2, 1, '#b9b2a3');
  R(c, cx + 13, y + 8, 3, 4, '#e8e2d6');
}

function look(u) {
  const l = u.look || {};
  return { skin: SKINS[l.skin] || SKINS[0], hair: HAIRS[l.hc] || HAIRS[0], shirt: SHIRTS[l.shirt] || SHIRTS[0], style: l.style, acc: l.acc };
}

export function drawChar(c, cx, y, u, o) {
  const L = look(u);
  const fr = o.f || 0;
  const st = o.status || u.status;
  const skin = L.skin;
  const dk = shade(skin, -0.18);
  const hair = L.hair;
  let hy = y - 27;
  if (o.act === 'look' && (fr >> 2) % 4 === 1) hy += 1;
  if (L.style === 'long') R(c, cx - 6, hy + 1, 12, 14, hair);
  R(c, cx - 8, hy + 10, 16, 7, L.shirt); R(c, cx - 8, hy + 10, 16, 1, shade(L.shirt, 0.2)); R(c, cx - 1, hy + 9, 3, 2, dk);
  R(c, cx - 4, hy, 8, 1, skin); R(c, cx - 5, hy + 1, 10, 7, skin); R(c, cx - 4, hy + 8, 8, 2, skin); R(c, cx - 6, hy + 4, 1, 2, skin); R(c, cx + 5, hy + 4, 1, 2, skin);
  if (L.style === 'short' || L.style === 'bun' || L.style === 'long') { R(c, cx - 5, hy - 1, 10, 3, hair); R(c, cx - 6, hy, 1, 4, hair); R(c, cx + 5, hy, 1, 4, hair); R(c, cx - 5, hy + 2, 3, 1, hair); }
  if (L.style === 'long') { R(c, cx - 6, hy, 2, 12, hair); R(c, cx + 4, hy, 2, 12, hair); }
  if (L.style === 'bun') R(c, cx - 2, hy - 4, 4, 3, hair);
  if (L.style === 'curly') { R(c, cx - 6, hy - 2, 12, 4, hair); R(c, cx - 7, hy, 2, 5, hair); R(c, cx + 5, hy, 2, 5, hair); R(c, cx - 4, hy - 3, 3, 1, hair); R(c, cx + 1, hy - 3, 3, 1, hair); }
  if (L.acc === 'cap') { R(c, cx - 6, hy - 2, 12, 4, '#e9724c'); R(c, cx - 5, hy - 3, 10, 1, '#e9724c'); R(c, cx - 3, hy + 2, 10, 1, '#b24f30'); }
  const ey = hy + 4;
  const dx = o.act === 'look' ? ((fr >> 2) % 2 ? 1 : -1) : 0;
  if (fr % 44 < 2) { R(c, cx - 3 + dx, ey + 1, 2, 1, '#14202a'); R(c, cx + 2 + dx, ey + 1, 2, 1, '#14202a'); } else { R(c, cx - 3 + dx, ey, 1, 2, '#14202a'); R(c, cx + 2 + dx, ey, 1, 2, '#14202a'); }
  const talk = (o.act === 'chat' || o.act === 'meet') && (fr >> 1) % 2 === 0;
  if (talk) R(c, cx - 1, hy + 7, 3, 2, '#7a2e34'); else R(c, cx - 1, hy + 7, 3, 1, '#8a3b3b');
  if (o.act === 'coffee') R(c, cx - 1, hy + 7, 2, 1, '#8a3b3b');
  if (L.acc === 'glasses') { R(c, cx - 4, ey - 1, 4, 3, '#14202a'); R(c, cx + 1, ey - 1, 4, 3, '#14202a'); R(c, cx - 3, ey, 2, 1, '#bfe6ff'); R(c, cx + 2, ey, 2, 1, '#bfe6ff'); R(c, cx, ey, 1, 1, '#14202a'); }
  if (st === 'focus' || st === 'meeting') {
    const led = st === 'focus' ? '#a78bfa' : '#5aa9ff';
    R(c, cx - 6, hy - 2, 12, 1, '#2a2f3a'); R(c, cx - 7, hy - 1, 2, 2, '#2a2f3a'); R(c, cx + 5, hy - 1, 2, 2, '#2a2f3a');
    R(c, cx - 7, hy + 2, 2, 5, '#2a2f3a'); R(c, cx + 5, hy + 2, 2, 5, '#2a2f3a'); R(c, cx - 7, hy + 3, 1, 3, led); R(c, cx + 6, hy + 3, 1, 3, led);
    if (st === 'meeting') { R(c, cx - 7, hy + 7, 1, 2, '#2a2f3a'); R(c, cx - 6, hy + 9, 5, 1, '#2a2f3a'); R(c, cx - 2, hy + 8, 2, 2, '#c9d1d8'); }
  }
  if (!o.bust) { R(c, cx + 7, hy - 4, 5, 5, '#0e1020'); R(c, cx + 8, hy - 3, 3, 3, STATUS_COLOR[st] || STATUS_COLOR.offline); }
  return hy;
}

function monitor(c, cx, y, on) {
  R(c, cx - 14, y - 13, 28, 15, '#2b3340'); R(c, cx - 14, y - 13, 28, 1, '#475266'); R(c, cx - 13, y - 12, 26, 1, '#363f50'); R(c, cx - 14, y + 1, 28, 1, '#1c222c');
  R(c, cx - 3, y - 8, 6, 3, '#3ed6c0'); R(c, cx - 2, y - 7, 4, 1, '#2b3340');
  R(c, cx + 10, y - 1, 2, 2, on ? '#5fe08f' : '#4a5163');
}

function line(c, x0, y0, x1, y1, col) {
  const dx = Math.abs(x1 - x0); const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1; const sy = y0 < y1 ? 1 : -1;
  let e = dx - dy;
  for (let n = 0; n < 40; n += 1) {
    R(c, x0, y0, 1, 1, col);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * e;
    if (e2 > -dy) { e -= dy; x0 += sx; }
    if (e2 < dx) { e += dx; y0 += sy; }
  }
}

function drawStation(c, lay, team, i, fr, hot) {
  const u = team[i];
  const [cx, y] = lay.seats[i];
  const st = u.status;
  const present = st === 'available' || st === 'focus' || st === 'meeting';
  const phase = (((fr / 21) | 0) + u.off) % 4;
  let act = 'type';
  if (st === 'available') {
    act = ['type', 'look', 'coffee', 'chat'][phase];
    if (act === 'chat') {
      const p = u.partner >= 0 ? team[u.partner] : null;
      if (!p || p.status !== 'available') act = 'type';
    }
  }
  if (st === 'focus') act = phase % 2 ? 'type' : 'look';
  if (st === 'meeting') act = 'meet';
  if (hot) { c.strokeStyle = '#ffb454'; c.lineWidth = 1; c.setLineDash([3, 3]); c.strokeRect(cx - 33.5, y - 32.5, 67, 60); c.setLineDash([]); }
  if (present) {
    R(c, cx - 10, y - 25, 20, 21, u.chair); R(c, cx - 9, y - 26, 18, 1, u.chair); R(c, cx - 10, y - 25, 20, 1, shade(u.chair, 0.2));
  } else {
    const ex = cx + (st === 'away' ? 24 : 12);
    const ey = y + (st === 'away' ? -4 : -10);
    R(c, ex, ey, 12, 12, u.chair); R(c, ex, ey, 12, 1, shade(u.chair, 0.2)); R(c, ex + 1, ey + 12, 10, 4, shade(u.chair, -0.3)); R(c, ex + 5, ey + 16, 2, 5, '#2b3340'); R(c, ex + 2, ey + 21, 8, 2, '#2b3340');
  }
  if (present) drawChar(c, cx, y, u, { f: fr, act, status: st });
  monitor(c, cx, y, present);
  if (present) {
    const skin = look(u).skin;
    const ty = act === 'type' || (act === 'meet' && (fr >> 2) % 2 === 0) ? 1 : 0;
    if (act === 'coffee') {
      R(c, cx + 8, y - 14, 4, 4, '#fff'); R(c, cx + 8, y - 14, 4, 1, '#8c5a3a'); R(c, cx + 12, y - 13, 1, 2, '#fff'); R(c, cx + 7, y - 10, 3, 2, skin); R(c, cx + 9, y - 17 - ((fr >> 1) % 2), 1, 2, 'rgba(255,255,255,.55)'); R(c, cx - 8, y + 6, 3, 2, skin);
    } else {
      R(c, cx - 8, y + 6 + (((fr >> 1) % 2) & ty), 3, 2, skin); R(c, cx + 5, y + 6 + ((((fr >> 1) + 1) % 2) & ty), 3, 2, skin);
    }
  }
  if (!(present && act === 'coffee')) { R(c, cx - 24, y + 5, 5, 5, '#fff'); R(c, cx - 23, y + 6, 3, 1, '#8c5a3a'); }
  if (present && st === 'available' && act !== 'coffee' && (fr >> 3) % 5 === 0) R(c, cx - 23, y + 3 - ((fr >> 1) % 2), 1, 2, 'rgba(255,255,255,.5)');
  if (act === 'chat') {
    const bx = cx + (u.side > 0 ? 9 : -23);
    const by = y - 42;
    R(c, bx, by, 16, 10, '#fff'); R(c, bx + (u.side > 0 ? 2 : 12), by + 10, 3, 2, '#fff');
    const d = (fr >> 1) % 3;
    for (let k = 0; k < 3; k += 1) R(c, bx + 3 + k * 4, by + 4 - (d === k ? 1 : 0), 2, 2, '#3a3f56');
  }
  if (st === 'away') { R(c, cx - 6, y - 10, 8, 8, '#ffd166'); R(c, cx - 5, y - 8, 6, 1, '#c69220'); R(c, cx - 5, y - 6, 4, 1, '#c69220'); R(c, cx - 5, y - 4, 5, 1, '#c69220'); }
}

// Cabeça e ombros para a lista e o cartão (32x22).
export function drawBust(canvas, member, status) {
  const c = canvas.getContext('2d');
  canvas.width = 32; canvas.height = 22;
  c.clearRect(0, 0, 32, 22);
  drawChar(c, 16, 29, { ...member, status }, { f: 99, act: 'look', status, bust: true });
}

export function createScene(canvas) {
  const ctx = canvas.getContext('2d');
  const bg = document.createElement('canvas');
  const ov = document.createElement('canvas');
  let team = [];
  let lay = layoutFor(1);
  let bgKey = '';
  let sel = null;
  let hover = null;

  function drawBg(bucket) {
    const c = bg.getContext('2d');
    const b = bucket;
    const H = lay.H;
    bg.width = W; bg.height = H; ov.width = W; ov.height = H;
    canvas.width = W; canvas.height = H;
    ctx.imageSmoothingEnabled = false;
    R(c, 0, 0, W, 56, '#56708a');
    for (let x = 0; x < W; x += 16) R(c, x, 0, 1, 52, '#516a84');
    R(c, 0, 44, W, 8, '#6b86a0'); R(c, 0, 52, W, 4, '#34465a'); R(c, 0, 51, W, 1, '#8aa3bb');
    for (let y = 56; y < H; y += 8) {
      for (let x2 = 0; x2 < W + 32; x2 += 32) {
        const off = ((y - 56) / 8 % 2) * 16;
        const k = (x2 / 32 + (y - 56) / 8) % 3;
        R(c, x2 - off, y, 32, 8, k === 0 ? '#c79a68' : k === 1 ? '#cfa573' : '#bf9160');
        R(c, x2 - off, y, 32, 1, '#a97b4f'); R(c, x2 - off, y, 1, 8, '#a97b4f');
      }
    }
    [[12, 8], [134, 8]].forEach(([wx, wy]) => {
      R(c, wx - 2, wy - 2, 52, 34, '#2b394a');
      R(c, wx, wy, 48, 30, b === 'day' ? '#8fd3ff' : b === 'dusk' ? '#f4a261' : '#16223d');
      if (b === 'day') { R(c, wx + 6, wy + 7, 12, 3, '#fff'); R(c, wx + 9, wy + 5, 8, 3, '#fff'); R(c, wx + 30, wy + 14, 10, 3, '#fff'); }
      if (b === 'dusk') { R(c, wx, wy + 18, 48, 12, '#e76f51'); R(c, wx + 30, wy + 12, 8, 8, '#ffd166'); }
      if (b === 'night') { [[6, 6], [20, 12], [34, 5], [40, 18], [12, 22]].forEach((s) => R(c, wx + s[0], wy + s[1], 1, 1, '#fff7d6')); R(c, wx + 36, wy + 6, 5, 5, '#fdf0b4'); }
      R(c, wx + 23, wy, 2, 30, '#2b394a'); R(c, wx, wy + 14, 48, 2, '#2b394a');
      R(c, wx - 3, wy + 32, 54, 3, '#7d97b0');
    });
    const lg = c.createLinearGradient(0, 56, 0, 120);
    const lc = b === 'day' ? '255,240,190' : b === 'dusk' ? '255,150,80' : '120,150,255';
    lg.addColorStop(0, `rgba(${lc},${b === 'night' ? 0.1 : 0.22})`); lg.addColorStop(1, `rgba(${lc},0)`);
    c.fillStyle = lg; c.fillRect(8, 56, 60, 70); c.fillRect(130, 56, 60, 70);
    R(c, 68, 16, 40, 14, '#1d2433'); R(c, 69, 17, 38, 12, '#232c3f');
    txt(c, 'ZEBRAZUL', (72 + (36 - twidth('ZEBRAZUL')) / 2) | 0, 20, '#3ed6c0');
    R(c, 69, 29, 38, 1, 'rgba(62,214,192,.5)');
    R(c, 114, 10, 20, 20, '#2b394a'); R(c, 116, 12, 16, 16, '#f3ecdf');
    [[196, 12, '#e9724c', '#ffd166'], [224, 12, '#3ed6c0', '#1d2433']].forEach((q) => {
      R(c, q[0] - 2, q[1] - 2, 26, 34, '#3b2d22'); R(c, q[0], q[1], 22, 30, q[2]); R(c, q[0] + 4, q[1] + 6, 14, 10, q[3]);
      R(c, q[0] + 4, q[1] + 20, 14, 2, '#fff'); R(c, q[0] + 4, q[1] + 24, 8, 2, '#fff');
    });
    R(c, 254, 6, 52, 46, '#6a4a2f'); R(c, 256, 8, 48, 42, '#4a3320');
    [[14, '#d9625f', '#3b82c4', '#e0a43a'], [28, '#4aa37a', '#8a6bc9', '#d9625f'], [42, '#3b82c4', '#e0a43a', '#4aa37a']].forEach((r, ri) => {
      const y = 8 + ri * 14;
      R(c, 256, y + 12, 48, 2, '#6a4a2f');
      for (let i = 0; i < 8; i += 1) R(c, 258 + i * 4, y + 2 + (i % 3), 3, 10 - (i % 3), r[1 + (i % 3)]);
    });
    R(c, 296, 32, 6, 8, '#c1633f'); R(c, 297, 26, 4, 6, '#3f9a52');
    PLANTS_TOP.forEach((p) => plant(c, p[0], p[1], 0));
    // lounge, café e luminária descem conforme o número de fileiras de mesas
    c.save(); c.translate(0, lay.oy);
    R(c, 100, 182, 132, 34, '#2c6f76'); R(c, 102, 184, 128, 30, '#3a8f94'); R(c, 106, 188, 120, 22, '#2c6f76');
    for (let i = 0; i < 14; i += 1) { R(c, 110 + i * 8, 190, 4, 2, '#f3ecdf'); R(c, 110 + i * 8, 206, 4, 2, '#f3ecdf'); }
    R(c, 120, 174, 84, 12, '#8c4a3c'); R(c, 116, 182, 92, 18, '#b85d4b'); R(c, 116, 200, 92, 4, '#8c4a3c'); R(c, 116, 182, 8, 18, '#a14f40'); R(c, 200, 182, 8, 18, '#a14f40');
    R(c, 128, 186, 30, 10, '#c96f5c'); R(c, 162, 186, 30, 10, '#c96f5c'); R(c, 130, 188, 8, 6, '#e0a43a'); R(c, 180, 188, 8, 6, '#3ed6c0');
    R(c, 238, 192, 22, 12, '#cfa573'); R(c, 240, 204, 2, 6, '#8c6a44'); R(c, 256, 204, 2, 6, '#8c6a44'); R(c, 242, 188, 6, 5, '#f3ecdf');
    R(c, 4, 176, 38, 34, '#e6d9c3'); R(c, 4, 176, 38, 4, '#fff3da'); R(c, 4, 206, 38, 4, '#a98a64'); R(c, 20, 180, 1, 26, '#cdbd9f');
    R(c, 8, 156, 16, 20, '#2b3340'); R(c, 10, 160, 12, 6, '#1c222c'); R(c, 11, 168, 10, 4, '#d9625f');
    R(c, 28, 166, 12, 10, '#f3ecdf'); R(c, 30, 168, 8, 6, '#8aa3bb');
    plant(c, 308, 190, 0);
    R(c, 276, 182, 2, 26, '#3b2d22'); R(c, 270, 176, 14, 8, '#ffd98a'); R(c, 272, 174, 10, 2, '#f3b95f'); R(c, 272, 208, 10, 3, '#3b2d22');
    c.restore();
    team.forEach((u, i) => desk(c, lay.seats[i][0], lay.seats[i][1], u));
    const o = ov.getContext('2d');
    o.clearRect(0, 0, W, H);
    const g = o.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 230);
    g.addColorStop(0, 'rgba(20,10,30,0)'); g.addColorStop(1, 'rgba(20,10,35,.45)'); o.fillStyle = g; o.fillRect(0, 0, W, H);
    [[277, 177 + lay.oy, 60], [160, 196 + lay.oy, 90], [16, 160 + lay.oy, 40]].forEach((l) => {
      const rg = o.createRadialGradient(l[0], l[1], 2, l[0], l[1], l[2]);
      rg.addColorStop(0, 'rgba(255,196,110,.28)'); rg.addColorStop(1, 'rgba(255,196,110,0)');
      o.fillStyle = rg; o.fillRect(l[0] - l[2], l[1] - l[2], l[2] * 2, l[2] * 2);
    });
    if (b !== 'day') { o.fillStyle = b === 'night' ? 'rgba(18,24,60,.18)' : 'rgba(255,120,60,.07)'; o.fillRect(0, 0, W, H); }
  }

  function ensureBg() {
    const key = `${timeBucket()}|${team.map((u) => `${u.id}:${u.first}`).join(',')}`;
    if (key !== bgKey) { bgKey = key; drawBg(timeBucket()); }
  }

  function draw(f) {
    ensureBg();
    ctx.drawImage(bg, 0, 0);
    const d = new Date();
    const m = d.getMinutes();
    const h = (d.getHours() % 12) + m / 60;
    line(ctx, 124, 20, 124 + Math.round(Math.sin(m / 60 * Math.PI * 2) * 6), 20 - Math.round(Math.cos(m / 60 * Math.PI * 2) * 6), '#2b3340');
    line(ctx, 124, 20, 124 + Math.round(Math.sin(h / 12 * Math.PI * 2) * 3), 20 - Math.round(Math.cos(h / 12 * Math.PI * 2) * 3), '#d9625f');
    R(ctx, 123, 19, 2, 2, '#2b3340');
    const sw = (f >> 3) & 1;
    PLANTS_TOP.forEach((p) => plant(ctx, p[0], p[1], sw));
    plant(ctx, 308, 190 + lay.oy, sw);
    const oy = lay.oy;
    R(ctx, 14 + ((f >> 1) % 3), 150 + oy - ((f >> 1) % 4) * 2, 1, 2, 'rgba(255,255,255,.5)');
    R(ctx, 18, 146 + oy - ((f >> 1) % 3) * 2, 1, 2, 'rgba(255,255,255,.4)');
    R(ctx, 15, 164 + oy, 3, 3, (f >> 3) % 2 ? '#ff7a7a' : '#7a2e34');
    const br = (f >> 3) & 1; // gato dormindo no tapete
    R(ctx, 198, 200 + oy, 16, 8 + br, '#e8a35a'); R(ctx, 200, 198 + oy + br, 6, 5, '#e8a35a'); R(ctx, 200, 197 + oy + br, 2, 2, '#e8a35a'); R(ctx, 204, 197 + oy + br, 2, 2, '#e8a35a'); R(ctx, 206, 202 + oy, 10, 2, '#b9763a'); R(ctx, 202, 201 + oy + br, 3, 1, '#2b3340');
    for (let i = 0; i < team.length; i += 1) drawStation(ctx, lay, team, i, f, sel === team[i].id || hover === team[i].id);
    ctx.drawImage(ov, 0, 0);
  }

  return {
    get height() { return lay.H; },
    setTeam(next) { team = next; lay = layoutFor(next.length); bgKey = ''; },
    setSelected(id) { sel = id; },
    setHover(id) { hover = id; },
    draw,
    hit(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      const x = ((clientX - r.left) / r.width) * W;
      const y = ((clientY - r.top) / r.height) * lay.H;
      for (let i = 0; i < team.length; i += 1) {
        const [sx, sy] = lay.seats[i];
        if (x >= sx - 34 && x <= sx + 34 && y >= sy - 34 && y <= sy + 30) return team[i].id;
      }
      return null;
    },
  };
}
