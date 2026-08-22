import { Navigate, NavLink } from 'react-router-dom';
import { BarChart3, Grid3x3, Instagram } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import Feed from './Feed.jsx';
import StoryHub from './StoryHub.jsx';
import Reports from './Reports.jsx';
import { hasPermission } from '../permissions.js';

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
  relatorios: {
    label: 'Relatórios',
    description: 'Desempenho orgânico, Meta Ads e conexões do cliente.',
    icon: BarChart3,
    path: '/social-media/relatorios',
    permission: 'social.reports',
  },
};

export default function SocialMedia({ section = 'feed' }) {
  const { user } = useAuth();
  const visibleSections = Object.entries(SECTIONS).filter(([, item]) => hasPermission(user, item.permission));
  const current = SECTIONS[section];

  if (!current || !hasPermission(user, current.permission)) {
    const firstVisible = visibleSections[0]?.[1]?.path;
    return <Navigate to={firstVisible || '/tarefas'} replace />;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[22px] border border-slate-200/80 bg-white px-4 py-3 shadow-[0_8px_30px_rgba(15,23,42,0.035)] sm:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="hidden min-w-0 sm:block">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
                <Instagram size={17} />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Central</p>
                <h1 className="truncate text-xl font-bold tracking-tight text-slate-900">Social Media</h1>
              </div>
            </div>
          </div>

          <nav className="flex w-full gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1 xl:w-auto" aria-label="Áreas de Social Media">
            {visibleSections.map(([key, item]) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={key}
                  to={item.path}
                  className={({ isActive }) => `flex min-w-max items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/70'
                      : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'
                  }`}
                >
                  <Icon size={16} />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </div>
        <p className="mt-3 hidden text-sm text-slate-500 sm:ml-[46px] sm:block">{current.description}</p>
      </section>

      {section === 'feed' && <Feed />}
      {section === 'stories' && <StoryHub />}
      {section === 'relatorios' && <Reports />}
    </div>
  );
}
