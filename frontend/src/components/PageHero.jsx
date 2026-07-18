export default function PageHero({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
  children,
  compact = false,
}) {
  return (
    <section className={`relative overflow-hidden rounded-[30px] bg-[#121620] text-white shadow-[0_20px_65px_rgba(18,22,32,0.16)] ${compact ? 'px-6 py-6 lg:px-8' : 'px-7 py-7 lg:px-9 lg:py-8'}`}>
      <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-[#0969ff]/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 h-44 w-44 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="relative">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl min-w-0">
            <div className="mb-4 flex items-center gap-3">
              {Icon && (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] text-[#6fa8ff]">
                  <Icon size={21} strokeWidth={2.1} />
                </span>
              )}
              {eyebrow && (
                <span className="rounded-full border border-white/10 bg-white/[0.055] px-3 py-1.5 text-xs font-medium text-white/60">
                  {eyebrow}
                </span>
              )}
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white lg:text-[34px]">{title}</h1>
            {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-white/52 lg:text-[15px]">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
        </div>
        {children && <div className="mt-6">{children}</div>}
      </div>
    </section>
  );
}
