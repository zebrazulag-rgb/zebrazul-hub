import { Navigate, NavLink } from 'react-router-dom';
import { Grid3x3, Instagram } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import Feed from './Feed.jsx';
import StoryHub from './StoryHub.jsx';
import { hasPermission } from '../permissions.js';
import TopbarPortal from '../components/TopbarPortal.jsx';

const SECTIONS = {
  feed: {
    label: 'Feed',
    description: 'Planejamento, calendário e visualização dos conteúdos do cliente.',
    icon: Grid3x3,
    path: '/social-media/feed',
    permission: 'social.feed',
  },
  stories: {
    label: 'Stories',
    description: 'Menções, repostagens e acompanhamento dos Stories.',
    icon: Instagram,
    path: '/social-media/stories',
    permission: 'social.stories',
  },
};

function SocialNav({ visibleSections, compact = false }) {
  return (
    <nav className={`flex gap-1 ${compact ? 'rounded-xl bg-slate-100 p-1' : 'w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm'}`} aria-label="Áreas de Social Media">
      {visibleSections.map(([key, item]) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={key}
            to={item.path}
            className={({ isActive }) => `flex min-w-max items-center gap-2 font-semibold transition ${compact ? 'rounded-lg px-3 py-2 text-[11px]' : 'rounded-xl px-4 py-2.5 text-sm'} ${
              isActive
                ? compact ? 'bg-white text-slate-900 shadow-sm' : 'bg-slate-950 text-white shadow-sm'
                : 'text-slate-500 hover:bg-white hover:text-slate-800'
            }`}
          >
            <Icon size={compact ? 14 : 16} />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

export default function SocialMedia({ section = 'feed' }) {
  const { user } = useAuth();
  const visibleSections = Object.entries(SECTIONS).filter(([, item]) => hasPermission(user, item.permission));
  const current = SECTIONS[section];

  if (!current || !hasPermission(user, current.permission)) {
    const firstVisible = visibleSections[0]?.[1]?.path;
    return <Navigate to={firstVisible || '/tarefas'} replace />;
  }

  return (
    <div className="space-y-4">
      <TopbarPortal><SocialNav visibleSections={visibleSections} compact /></TopbarPortal>
      <div className="lg:hidden"><SocialNav visibleSections={visibleSections} /></div>
      {section === 'feed' && <Feed />}
      {section === 'stories' && <StoryHub />}
    </div>
  );
}
