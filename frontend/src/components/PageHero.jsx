export default function PageHero({
  title,
  description,
  actions,
  children,
  compact = false,
  hideHeadingMobile = false,
}) {
  return (
    <section className={`page-hero ${compact ? 'py-1' : 'py-2'}`}>
      <div className="page-hero-heading">
        <div className={`min-w-0 max-w-3xl ${hideHeadingMobile ? 'hidden sm:block' : ''}`}>
          <h1 className="page-hero-title text-3xl font-bold tracking-tight lg:text-[34px]">{title}</h1>
          {description && <p className="page-hero-description mt-2 max-w-2xl text-sm leading-6 lg:text-[15px]">{description}</p>}
        </div>
        {actions && <div className="page-hero-actions shrink-0">{actions}</div>}
      </div>
      {children && <div className="page-hero-metrics">{children}</div>}
    </section>
  );
}
