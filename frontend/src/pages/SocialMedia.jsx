import { useMemo } from 'react';
import { BarChart3, Instagram, MessageCircle, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Feed from './Feed.jsx';
import StoryHub from './StoryHub.jsx';
import InstagramMessages from './InstagramMessages.jsx';
import Reports from './Reports.jsx';
import TopbarPortal from '../components/TopbarPortal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { hasPermission } from '../permissions.js';

const SECTION_META = {
  messages: { label: 'Mensagens', icon: MessageCircle, path: '/social-media/mensagens' },
  covers: { label: 'Capas', icon: Sparkles, path: '/social-media/capas' },
  stories: { label: 'Stories', icon: Instagram, path: '/social-media/stories' },
  insights: { label: 'Insights', icon: BarChart3, path: '/social-media/insights' },
};

export default function SocialMedia({ section = null }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const available = useMemo(() => [
    hasPermission(user, 'social.messages') && 'messages',
    hasPermission(user, 'social.covers') && 'covers',
    hasPermission(user, 'social.stories') && 'stories',
    hasPermission(user, 'social.reports') && 'insights',
  ].filter(Boolean), [user]);
  const active = section && available.includes(section) ? section : available[0];

  if (!active) {
    return (
      <section className="rounded-[24px] border border-dashed border-slate-300 bg-white p-10 text-center">
        <Instagram className="mx-auto text-[#3A85FD]" size={28} />
        <h1 className="mt-3 text-lg font-black text-[#17181C]">Social Media</h1>
        <p className="mt-1 text-sm text-slate-500">Nenhuma ferramenta de Social Media está liberada para este perfil.</p>
      </section>
    );
  }

  const nav = (
    <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
      {available.map((key) => {
        const item = SECTION_META[key];
        const Icon = item.icon;
        return (
          <button
            key={key}
            type="button"
            onClick={() => navigate(item.path)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold transition ${active === key ? 'bg-white text-[#17181C] shadow-sm' : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'}`}
          >
            <Icon size={14} /> {item.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">
      <TopbarPortal>{nav}</TopbarPortal>
      <div className="lg:hidden">{nav}</div>
      {active === 'messages' && <InstagramMessages />}
      {active === 'covers' && <Feed forcedView="covers" toolMode />}
      {active === 'stories' && <StoryHub />}
      {active === 'insights' && <Reports />}
    </div>
  );
}
