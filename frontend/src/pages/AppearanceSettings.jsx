import { useEffect, useState } from 'react';
import { Check, Moon, Sun } from 'lucide-react';
import { getStoredTheme, saveTheme } from '../utils/theme.js';

const options = [
  {
    value: 'light',
    title: 'Modo claro',
    description: 'Interface branca e leve para ambientes bem iluminados.',
    icon: Sun,
    preview: 'bg-[#f5f7fb] border-slate-200',
    previewCard: 'bg-white border-slate-200',
  },
  {
    value: 'dark',
    title: 'Modo noturno',
    description: 'Interface escura com contraste confortável para uso prolongado.',
    icon: Moon,
    preview: 'bg-[#07090d] border-[#26303d]',
    previewCard: 'bg-[#10141b] border-[#26303d]',
  },
];

export default function AppearanceSettings() {
  const [theme, setTheme] = useState(getStoredTheme);

  useEffect(() => {
    function handleThemeChange(event) {
      setTheme(event.detail?.theme || getStoredTheme());
    }
    window.addEventListener('zebrahub:theme-change', handleThemeChange);
    return () => window.removeEventListener('zebrahub:theme-change', handleThemeChange);
  }, []);

  function chooseTheme(value) {
    setTheme(saveTheme(value));
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Aparência</h2>
        <p className="mt-1 text-sm text-slate-500">Escolha como o ZebraHub deve aparecer para você.</p>
      </div>

      <section className="space-y-5">
        <div className="mb-5">
          <h3 className="font-semibold text-slate-900">Modo de visualização</h3>
          <p className="mt-1 text-sm text-slate-500">A preferência fica salva neste navegador e pode ser trocada a qualquer momento.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {options.map((option) => {
            const selected = theme === option.value;
            const Icon = option.icon;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => chooseTheme(option.value)}
                className={`relative overflow-hidden rounded-2xl border p-4 text-left transition ${selected ? 'border-[#0969ff] ring-4 ring-blue-500/10' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <div className={`mb-4 rounded-xl border p-3 ${option.preview}`}>
                  <div className="flex gap-2">
                    <div className="h-20 w-14 rounded-lg bg-[#121620]" />
                    <div className="flex-1 space-y-2 pt-1">
                      <div className={`h-4 rounded border ${option.previewCard}`} />
                      <div className="grid grid-cols-2 gap-2">
                        <div className={`h-12 rounded-lg border ${option.previewCard}`} />
                        <div className={`h-12 rounded-lg border ${option.previewCard}`} />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${selected ? 'bg-blue-50 text-[#0969ff]' : 'bg-slate-100 text-slate-500'}`}>
                    <Icon size={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-slate-900">{option.title}</span>
                    <span className="mt-1 block text-sm leading-5 text-slate-500">{option.description}</span>
                  </span>
                  {selected && <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0969ff] text-white"><Check size={15} /></span>}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-700">
          O Feed permanece branco nos dois modos para preservar a leitura e a fidelidade da prévia do Instagram.
        </div>
      </section>
    </div>
  );
}
