import { Clapperboard, Facebook, Instagram, Linkedin, MapPin, Music2, Pin, Twitter, Youtube, CircleDot, Check } from 'lucide-react';

export const PLATFORMS = [
  { key: 'instagram_feed', label: 'Instagram Feed', short: 'Feed', Icon: Instagram, color: '#E1306C' },
  { key: 'instagram_stories', label: 'Instagram Stories', short: 'Stories', Icon: CircleDot, color: '#C13584' },
  { key: 'instagram_reels', label: 'Instagram Reels', short: 'Reels', Icon: Clapperboard, color: '#833AB4' },
  { key: 'facebook', label: 'Facebook', short: 'Facebook', Icon: Facebook, color: '#1877F2' },
  { key: 'tiktok', label: 'TikTok', short: 'TikTok', Icon: Music2, color: '#111827' },
  { key: 'linkedin', label: 'LinkedIn', short: 'LinkedIn', Icon: Linkedin, color: '#0A66C2' },
  { key: 'youtube', label: 'YouTube', short: 'YouTube', Icon: Youtube, color: '#FF0000' },
  { key: 'x', label: 'X (Twitter)', short: 'X', Icon: Twitter, color: '#0F1419' },
  { key: 'pinterest', label: 'Pinterest', short: 'Pinterest', Icon: Pin, color: '#E60023' },
  { key: 'google', label: 'Google Meu Negócio', short: 'Google', Icon: MapPin, color: '#34A853' },
];

const BY_KEY = Object.fromEntries(PLATFORMS.map((p) => [p.key, p]));

// Selos com ícone coloridos. compact = só o ícone (miniaturas da grade).
export function PlatformBadges({ platforms = [], compact = false, className = '' }) {
  const list = (platforms || []).map((key) => BY_KEY[key]).filter(Boolean);
  if (!list.length) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {list.map(({ key, label, short, Icon, color }) => (
        compact ? (
          <span key={key} title={`Agendado em: ${label}`} className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow ring-1 ring-black/10" style={{ color }}>
            <Icon size={12} strokeWidth={2.4} />
          </span>
        ) : (
          <span key={key} title={label} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold text-white" style={{ backgroundColor: color }}>
            <Icon size={12} strokeWidth={2.4} /> {short}
          </span>
        )
      ))}
    </span>
  );
}

// Seletor: botões de ícone que ligam/desligam cada lugar.
export function PlatformPicker({ value = [], onChange, disabled = false }) {
  const selected = new Set(value || []);
  function toggle(key) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange(PLATFORMS.map((p) => p.key).filter((k) => next.has(k)));
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {PLATFORMS.map(({ key, label, short, Icon, color }) => {
        const on = selected.has(key);
        return (
          <button
            key={key}
            type="button"
            title={label}
            disabled={disabled}
            aria-pressed={on}
            onClick={() => toggle(key)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50 ${on ? 'border-transparent text-white shadow-sm' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
            style={on ? { backgroundColor: color } : undefined}
          >
            {on ? <Check size={12} strokeWidth={3} /> : <Icon size={12} style={{ color }} />} {short}
          </button>
        );
      })}
    </div>
  );
}
