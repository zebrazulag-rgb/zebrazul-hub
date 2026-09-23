export default function PageHero({
  title,
  description,
  actions,
  children,
  compact = false,
  hideHeadingMobile = false,
  showDescription = false,
}) {
  return (
    <section className={`page-hero ${compact ? 'py-0' : 'py-1'}`}>
      <div className="page-hero-heading">
        <div className={`min-w-0 max-w-3xl ${hideHeadingMobile ? 'hidden sm:block' : ''}`}>
          <h1 className="page-hero-title text-xl font-bold tracking-tight lg:text-[22px]">{title}</h1>
          {showDescription && description && <p className="page-hero-description mt-0.5 max-w-2xl text-xs leading-4">{description}</p>}
        </div>
        {actions && <div className="page-hero-actions shrink-0">{actions}</div>}
      </div>
      {children && <div className="page-hero-metrics">{children}</div>}
    </section>
  );
}
