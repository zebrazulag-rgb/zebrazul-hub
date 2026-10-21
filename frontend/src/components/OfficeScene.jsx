import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../api';
import {
  ACCS, HAIRS, SHIRTS, SKINS, STATUS_COLOR, STATUS_LABEL, STYLES, W,
  createScene, drawBust, prepareTeam,
} from '../utils/officeScene.js';

// "Nosso Escritório": presença leve da equipe no Painel.
// Online = app aberto (batimento que já existe). Status = escolhido pela própria pessoa.
// Não mede teclado, mouse nem páginas visitadas, e não toca em tarefas ou aprovações.
const POLL_MS = 20000;
const TICK_MS = 125;
const PICKABLE = ['available', 'focus', 'meeting', 'away'];
const NOTES = {
  offline: 'Estação vazia: esta pessoa está offline.',
  away: 'Saiu da mesa por um momento.',
  focus: 'Concentrado. Prefira deixar uma mensagem.',
  meeting: 'Em reunião agora.',
  available: 'Disponível para conversar.',
};

const CSS = `
.zo{--bg:#171a2b;--panel:#20243a;--panel2:#2a2f4a;--line:#383e5e;--fg:#f3ecdf;--muted:#aab0c8;--warm:#ffb454;color:var(--fg);background:var(--bg);border-radius:20px;padding:16px;font-family:"Instrument Sans",system-ui,-apple-system,"Segoe UI",sans-serif;font-size:14px;line-height:1.45}
.zo *{box-sizing:border-box}
.zo button{font:inherit;color:inherit;cursor:pointer}
.zo :focus-visible{outline:2px solid var(--warm);outline-offset:2px;border-radius:6px}
.zo-hd{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:flex-end;justify-content:space-between;margin-bottom:12px}
.zo h2,.zo h3{font-family:"Pixelify Sans","Courier New",monospace;margin:0;font-weight:700}
.zo-hd h2{font-size:28px;line-height:1;color:var(--warm)}
.zo-hd p{margin:6px 0 0;color:var(--muted)}
.zo-priv{border:1px dashed var(--line);border-radius:10px;padding:5px 10px;font-size:12px;color:var(--muted);max-width:420px}
.zo-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:14px;align-items:start}
.zo-stage{display:flex;flex-direction:column;gap:10px;min-width:0}
.zo-frame{background:#0e1020;border:3px solid #0b0c18;border-radius:14px;padding:8px;box-shadow:0 0 0 2px var(--line);display:flex;justify-content:center}
.zo-cv{display:block;image-rendering:pixelated;image-rendering:crisp-edges;border-radius:6px;max-width:100%}
.zo-me{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:8px 10px}
.zo-lb{font-family:"Pixelify Sans","Courier New",monospace;color:var(--muted)}
.zo-seg{display:flex;flex-wrap:wrap;gap:6px}
.zo-st{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);background:var(--panel2);border-radius:999px;padding:5px 12px;min-height:36px}
.zo-st i,.zo-chip i{width:10px;height:10px;border-radius:50%;background:var(--c);display:inline-block;flex:none}
.zo-st[aria-pressed="true"]{border-color:var(--warm);background:#3a3350;box-shadow:inset 0 0 0 1px var(--warm)}
.zo-chk{display:inline-flex;gap:7px;align-items:center;color:var(--muted);margin-left:auto}
.zo-side{display:flex;flex-direction:column;gap:12px;min-width:0}
.zo-box{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:10px}
.zo-box h3{font-size:17px;margin-bottom:6px}
.zo-team{display:flex;flex-direction:column;gap:2px;margin:0;padding:0;list-style:none}
.zo-team button{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:transparent;border:1px solid transparent;border-radius:10px;padding:4px 8px;min-height:44px}
.zo-team button:hover{background:var(--panel2)}
.zo-team button[aria-pressed="true"]{border-color:var(--warm);background:#2d2b44}
.zo-team canvas{width:44px;height:30px;image-rendering:pixelated;background:#2a2f4a;border-radius:8px;flex:none}
.zo-n{display:block;font-weight:600;line-height:1.2}
.zo-r{display:block;font-size:12.5px;color:var(--muted)}
.zo-chip{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;border:1px solid var(--line);border-radius:999px;padding:2px 10px;background:var(--panel2)}
.zo-chip i{width:9px;height:9px}
.zo-top{display:flex;gap:12px;align-items:center}
.zo-top canvas{width:96px;height:64px;image-rendering:pixelated;background:#2a2f4a;border-radius:10px;flex:none}
.zo-top h3{font-size:20px;color:var(--warm)}
.zo-muted{color:var(--muted)}
.zo-box p{margin:8px 0 0;color:var(--muted);font-size:13px}
.zo-cust{display:flex;flex-direction:column;gap:8px;margin-top:10px;border-top:1px solid var(--line);padding-top:10px}
.zo-sw{display:flex;flex-wrap:wrap;gap:6px}
.zo-sw button{width:30px;height:30px;border-radius:8px;border:2px solid var(--line);background:var(--c)}
.zo-sw button[aria-pressed="true"]{border-color:var(--warm);box-shadow:0 0 0 2px #0e1020 inset}
.zo-sw .zo-tx{width:auto;padding:0 10px;background:var(--panel2);font-size:13px}
.zo-note{font-size:12.5px;color:var(--muted)}
.zo-err{color:var(--muted);font-size:13px}
.zo-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:980px){.zo-grid{grid-template-columns:minmax(0,1fr)}.zo-chk{margin-left:0}}
`;

function ensureAssets() {
  if (typeof document === 'undefined') return;
  if (!document.getElementById('zo-font')) {
    const link = document.createElement('link');
    link.id = 'zo-font'; link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@500;700&family=Instrument+Sans:wght@400;500;600&display=swap';
    document.head.appendChild(link);
  }
}

function Bust({ member, status }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) drawBust(ref.current, member, status); }, [member, status]);
  return <canvas ref={ref} aria-hidden="true" />;
}

function Chip({ status }) {
  return <span className="zo-chip" style={{ '--c': STATUS_COLOR[status] }}><i />{STATUS_LABEL[status]}</span>;
}

export default function OfficeScene() {
  const [raw, setRaw] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | hidden | error
  const [sel, setSel] = useState(null);
  const [live, setLive] = useState('');
  const cvRef = useRef(null);
  const frameRef = useRef(null);
  const sceneRef = useRef(null);
  const lastStatus = useRef('available');
  const fRef = useRef(0);
  const team = useMemo(() => prepareTeam(raw || []), [raw]);
  const me = team.find((m) => m.is_me) || null;
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/office');
      setRaw(data.team || []);
      setState('ok');
    } catch (err) {
      const code = err?.response?.status;
      if (code === 403 || code === 404) setState('hidden');
      else setState((prev) => (prev === 'ok' ? 'ok' : 'error')); // falha passageira não apaga o que já está na tela
    }
  }, []);

  useEffect(() => {
    ensureAssets();
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVis); };
  }, [load]);

  const fit = useCallback(() => {
    const cv = cvRef.current;
    const host = frameRef.current;
    const scene = sceneRef.current;
    if (!cv || !host || !scene) return;
    const avail = Math.max(260, host.clientWidth - 22);
    const s = Math.min(3.6, avail / W);
    cv.style.width = `${Math.round(W * s)}px`;
    cv.style.height = `${Math.round(scene.height * s)}px`;
  }, []);

  // cena: cria uma vez; reconstrói o cenário quando a equipe muda
  useEffect(() => {
    if (state !== 'ok' || !cvRef.current) return undefined;
    if (!sceneRef.current) sceneRef.current = createScene(cvRef.current);
    const scene = sceneRef.current;
    scene.setTeam(team);
    scene.setSelected(sel);
    fit();
    scene.draw(fRef.current);
    if (reduce) return undefined;
    const timer = setInterval(() => {
      if (document.hidden) return;
      fRef.current += 1;
      scene.draw(fRef.current);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [state, team, sel, reduce, fit]);

  useEffect(() => {
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);

  const announce = (msg) => { setLive(''); setTimeout(() => setLive(msg), 30); };

  const save = async (patch) => {
    // aplica na hora; se o servidor recusar, recarrega o estado real
    setRaw((prev) => (prev || []).map((m) => {
      if (!m.is_me) return m;
      const declared = patch.status || m.declared_status;
      return { ...m, declared_status: declared, status: m.online ? declared : 'offline', look: patch.look || m.look };
    }));
    try {
      const { data } = await api.put('/office/me', patch);
      if (data?.me) setRaw((prev) => (prev || []).map((m) => (m.id === data.me.id ? data.me : m)));
      return true;
    } catch {
      announce('Não foi possível salvar agora. Tente de novo.');
      load();
      return false;
    }
  };

  const pickStatus = async (key) => {
    lastStatus.current = key;
    if (await save({ status: key })) announce(`Seu status: ${STATUS_LABEL[key]}`);
  };
  const toggleOffline = async (checked) => {
    if (checked) {
      if (me && me.declared_status !== 'offline') lastStatus.current = me.declared_status;
      if (await save({ status: 'offline' })) announce('Você está aparecendo offline');
    } else if (await save({ status: lastStatus.current || 'available' })) {
      announce('Você voltou ao escritório');
    }
  };
  const pickLook = (key, value) => { if (me) save({ look: { ...me.look, [key]: value } }); };

  const choose = (id) => {
    setSel(id);
    const m = team.find((x) => x.id === id);
    if (m) announce(`${m.name}, ${m.role_label}, ${STATUS_LABEL[m.status]}`);
  };
  const onClick = (e) => {
    const id = sceneRef.current?.hit(e.clientX, e.clientY);
    if (id) choose(id); else setSel(null);
  };
  const onMove = (e) => {
    const scene = sceneRef.current;
    if (!scene) return;
    const id = scene.hit(e.clientX, e.clientY);
    scene.setHover(id);
    e.currentTarget.style.cursor = id ? 'pointer' : 'default';
    if (reduce) scene.draw(fRef.current);
  };
  const onLeave = () => { sceneRef.current?.setHover(null); if (reduce) sceneRef.current?.draw(fRef.current); };

  if (state === 'hidden' || state === 'loading') return null;
  const online = team.filter((m) => m.status !== 'offline').length;
  const chosen = team.find((m) => m.id === sel) || null;
  const offlineChecked = !!me && me.declared_status === 'offline';

  return (
    <section className="zo" aria-label="Nosso Escritório">
      <style>{CSS}</style>
      <header className="zo-hd">
        <div>
          <h2>Nosso Escritório</h2>
          <p>{state === 'ok' ? `${online} de ${team.length} no escritório agora` : 'Equipe'}</p>
        </div>
        <div className="zo-priv" role="note">Presença = app aberto + o status que cada pessoa escolhe. Não registramos teclado, mouse nem páginas visitadas.</div>
      </header>

      {state === 'error' && <p className="zo-err">O escritório não carregou agora. O resto do Painel segue normal.</p>}

      {state === 'ok' && (
        <div className="zo-grid">
          <div className="zo-stage">
            <div className="zo-frame" ref={frameRef}>
              <canvas
                ref={cvRef}
                className="zo-cv"
                role="img"
                aria-label={`Escritório em pixel art com ${team.length} estações de trabalho. Use a lista de pessoas para ver detalhes.`}
                onClick={onClick}
                onMouseMove={onMove}
                onMouseLeave={onLeave}
              />
            </div>
            {me && (
              <div className="zo-me" role="group" aria-label="Seu status">
                <span className="zo-lb">Seu status</span>
                <div className="zo-seg">
                  {PICKABLE.map((k) => (
                    <button key={k} type="button" className="zo-st" style={{ '--c': STATUS_COLOR[k] }} aria-pressed={!offlineChecked && me.declared_status === k} onClick={() => pickStatus(k)}>
                      <i />{STATUS_LABEL[k]}
                    </button>
                  ))}
                </div>
                <label className="zo-chk"><input type="checkbox" checked={offlineChecked} onChange={(e) => toggleOffline(e.target.checked)} /> Aparecer offline</label>
              </div>
            )}
            <p className="zo-note">Clique em uma pessoa no escritório ou na lista. Quem está offline deixa a estação vazia.</p>
          </div>

          <aside className="zo-side">
            <div className="zo-box">
              <h3>Equipe</h3>
              <ul className="zo-team">
                {team.map((m) => (
                  <li key={m.id}>
                    <button type="button" aria-pressed={sel === m.id} onClick={() => choose(m.id)}>
                      <Bust member={m} status={m.status} />
                      <span>
                        <span className="zo-n">{m.name}{m.is_me ? ' (você)' : ''}</span>
                        <span className="zo-r">{m.role_label} · {STATUS_LABEL[m.status]}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="zo-box" aria-live="polite">
              {!chosen && (<><h3>Quem é quem</h3><p className="zo-muted">Clique em uma pessoa para ver nome, função e status.</p></>)}
              {chosen && (
                <>
                  <div className="zo-top">
                    <Bust member={chosen} status={chosen.status} />
                    <div>
                      <h3>{chosen.name}</h3>
                      <div className="zo-muted">{chosen.role_label}</div>
                      <div style={{ marginTop: 6 }}><Chip status={chosen.status} /></div>
                    </div>
                  </div>
                  <p>{NOTES[chosen.status]}</p>
                  {chosen.is_me && (
                    <div className="zo-cust">
                      <h3 style={{ fontSize: 14 }} className="zo-lb">Personalizar meu avatar</h3>
                      <Swatches label="Pele" colors={SKINS} value={chosen.look.skin} onPick={(v) => pickLook('skin', v)} />
                      <Choices label="Cabelo" items={STYLES} value={chosen.look.style} onPick={(v) => pickLook('style', v)} />
                      <Swatches label="Cor do cabelo" colors={HAIRS} value={chosen.look.hc} onPick={(v) => pickLook('hc', v)} />
                      <Swatches label="Camisa" colors={SHIRTS} value={chosen.look.shirt} onPick={(v) => pickLook('shirt', v)} />
                      <Choices label="Acessório" items={ACCS} value={chosen.look.acc} onPick={(v) => pickLook('acc', v)} />
                      <p className="zo-note" style={{ margin: 0 }}>Seu avatar fica salvo no seu usuário do ZebraHub.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>
        </div>
      )}
      <div className="zo-sr" aria-live="polite">{live}</div>
    </section>
  );
}

function Swatches({ label, colors, value, onPick }) {
  return (
    <div>
      <div className="zo-note">{label}</div>
      <div className="zo-sw">
        {colors.map((c, i) => (
          <button key={c} type="button" style={{ '--c': c }} aria-label={`${label} ${i + 1}`} aria-pressed={value === i} onClick={() => onPick(i)} />
        ))}
      </div>
    </div>
  );
}

function Choices({ label, items, value, onPick }) {
  return (
    <div>
      <div className="zo-note">{label}</div>
      <div className="zo-sw">
        {items.map(([key, text]) => (
          <button key={key} type="button" className="zo-tx" aria-pressed={value === key} onClick={() => onPick(key)}>{text}</button>
        ))}
      </div>
    </div>
  );
}
