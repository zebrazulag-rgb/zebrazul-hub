export default function SettingsSectionHeader({ title, description, actions, children }) {
  return (
    <section className="settings-section-header border-b border-slate-200/80 pb-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
          {description && <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-4 flex flex-wrap gap-2">{children}</div>}
    </section>
  );
}
