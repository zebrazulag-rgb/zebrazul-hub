// Alternador de área (Designer / Audiovisual) usado em Aprovação, Agendamento e no portal do cliente.
export default function AreaSwitch({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
      {options.map((o) => (
        <button key={o.key} type="button" onClick={() => onChange(o.key)} className={`brand-display inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-[0.12em] transition ${value === o.key ? 'bg-[#17181C] text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
          {o.label}{o.badge ? <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${value === o.key ? 'bg-[#C9FF2F] text-[#17181C]' : 'bg-slate-100 text-slate-500'}`}>{o.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}
