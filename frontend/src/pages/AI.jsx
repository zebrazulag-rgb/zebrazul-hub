import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Instagram, Sparkles } from 'lucide-react';
import Feed from './Feed.jsx';
import StoryHub from './StoryHub.jsx';
import TopbarPortal from '../components/TopbarPortal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { hasPermission } from '../permissions.js';

export default function AIPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const canCovers = hasPermission(user, 'social.covers');
  const canStories = hasPermission(user, 'social.stories');
  const available = useMemo(() => [
    canCovers && ['covers', 'Capas', Sparkles],
    canStories && ['stories', 'Stories', Instagram],
  ].filter(Boolean), [canCovers, canStories]);

  const requested = searchParams.get('view');
  const active = available.some(([key]) => key === requested) ? requested : available[0]?.[0];

  if (!active) {
    return (
      <section className="rounded-[24px] border border-dashed border-slate-300 bg-white p-10 text-center">
        <Sparkles className="mx-auto text-blue-600" size={28} />
        <h1 className="mt-3 text-lg font-bold text-slate-900">IA</h1>
        <p className="mt-1 text-sm text-slate-500">Nenhuma ferramenta de IA está liberada para este perfil.</p>
      </section>
    );
  }

  const nav = (
    <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
      {available.map(([key, label, Icon]) => (
        <button
          key={key}
          type="button"
          onClick={() => setSearchParams({ view: key }, { replace: true })}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold transition ${active === key ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'}`}
        >
          <Icon size={14} /> {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      <TopbarPortal>{nav}</TopbarPortal>
      <div className="lg:hidden">{nav}</div>
      {active === 'covers' && <Feed forcedView="covers" toolMode />}
      {active === 'stories' && <StoryHub />}
    </div>
  );
}
