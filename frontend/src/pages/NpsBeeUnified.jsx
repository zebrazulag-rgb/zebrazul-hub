import { useMemo, useState } from 'react';
import api from '../api';

const ratingOptions = [1, 2, 3, 4, 5];
const npsOptions = Array.from({ length: 11 }, (_, index) => index);

const expectationOptions = [
  'Superou minhas expectativas',
  'Correspondeu às expectativas',
  'Correspondeu parcialmente',
  'Não correspondeu',
];

const continueOptions = ['Com certeza', 'Sim', 'Talvez', 'Não'];

const initialForm = {
  respondent_name: '',
  nps_score: null,
  nps_comment: '',
  event_overall: null,
  event_organization: null,
  event_team: null,
  child_experience: null,
  expectations: '',
  favorite_moment: '',
  improvements: '',
  continue_events: '',
};

function RatingScale({ value, onChange }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-[#897a63]">
        <span>Ruim</span>
        <span>Ótimo</span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {ratingOptions.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`h-11 rounded-xl border text-sm font-bold transition ${
              value === option
                ? 'border-[#7c6337] bg-[#7c6337] text-white shadow-sm'
                : 'border-[#e4dac8] bg-white text-[#5f513a] hover:border-[#b89b68] hover:bg-[#fffaf0]'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChoiceGroup({ options, value, onChange }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
            value === option
              ? 'border-[#7c6337] bg-[#7c6337] text-white'
              : 'border-[#e5dccb] bg-white text-[#5d503c] hover:border-[#b79b6b] hover:bg-[#fffaf0]'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function FieldCard({ number, title, required = true, children }) {
  return (
    <section className="rounded-[26px] border border-[#eadfce] bg-white/95 p-5 shadow-[0_14px_45px_rgba(90,69,35,0.06)] sm:p-6">
      <div className="mb-5 flex gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f3ead8] text-xs font-extrabold text-[#705832]">
          {number}
        </span>
        <div>
          <h2 className="text-base font-bold leading-snug text-[#30281d] sm:text-lg">
            {title}
            {required && <span className="ml-1 text-[#b0523f]">*</span>}
          </h2>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function NpsBeeUnified() {
  const [form, setForm] = useState(initialForm);
  const [step, setStep] = useState(0);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const steps = useMemo(() => [
    {
      eyebrow: 'PESQUISA DE FAMÍLIA',
      title: 'Sua experiência com a Bee',
      subtitle: 'Queremos ouvir sua percepção para continuar fortalecendo a parceria entre escola e família.',
    },
    {
      eyebrow: 'DIA DOS PAIS · 22/08',
      title: 'Como foi a experiência no evento?',
      subtitle: 'Agora queremos entender como você percebeu o evento e a experiência proporcionada às famílias.',
    },
    {
      eyebrow: 'ÚLTIMA ETAPA',
      title: 'Conte um pouco mais pra gente',
      subtitle: 'Suas respostas abertas ajudam a equipe a entender o que manter e o que pode evoluir.',
    },
  ], []);

  const update = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setError('');
  };

  const validateStep = () => {
    if (step === 0 && form.nps_score === null) {
      setError('Escolha uma nota de 0 a 10 para continuar.');
      return false;
    }
    if (
      step === 1 &&
      [form.event_overall, form.event_organization, form.event_team, form.child_experience].some((value) => value === null)
    ) {
      setError('Responda as quatro avaliações do evento para continuar.');
      return false;
    }
    if (step === 1 && !form.expectations) {
      setError('Informe se o evento correspondeu às suas expectativas.');
      return false;
    }
    if (step === 2 && (!form.favorite_moment.trim() || !form.improvements.trim() || !form.continue_events)) {
      setError('Responda as perguntas obrigatórias antes de enviar.');
      return false;
    }
    return true;
  };

  const next = () => {
    if (!validateStep()) return;
    setStep((value) => Math.min(value + 1, steps.length - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const back = () => {
    setError('');
    setStep((value) => Math.max(value - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async () => {
    if (!validateStep() || sending) return;
    setSending(true);
    setError('');
    try {
      await api.post('/public/bee-family-survey/responses', {
        ...form,
        source: 'npsbee-dia-dos-pais-2026',
      });
      setDone(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err?.response?.data?.error || 'Não foi possível enviar agora. Tente novamente em alguns instantes.');
    } finally {
      setSending(false);
    }
  };

  const progress = done ? 100 : ((step + 1) / steps.length) * 100;

  if (done) {
    return (
      <main className="min-h-screen bg-[#fbf6ec] px-4 py-10 sm:py-16">
        <div className="mx-auto max-w-xl">
          <div className="overflow-hidden rounded-[34px] border border-[#eadfce] bg-white shadow-[0_28px_80px_rgba(85,63,29,0.11)]">
            <div className="h-2 bg-[#7c6337]" />
            <div className="p-8 text-center sm:p-12">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#eef4e7] text-3xl">✓</div>
              <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.2em] text-[#92764b]">RESPOSTA ENVIADA</p>
              <h1 className="text-3xl font-black tracking-[-0.04em] text-[#2e271d] sm:text-4xl">Obrigado por caminhar com a Bee.</h1>
              <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-[#756a58] sm:text-base">
                Sua percepção ajuda a escola a cuidar melhor das experiências vividas por alunos e famílias.
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#fbf6ec] text-[#342c20]">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="mb-6 overflow-hidden rounded-[30px] border border-[#e8dcc9] bg-[#2f3c2f] text-white shadow-[0_22px_70px_rgba(47,60,47,0.16)]">
          <div className="p-6 sm:p-9">
            <div className="mb-7 flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#e8d7ad]">BEE CHRISTIAN SCHOOL</div>
                <div className="mt-1 text-sm text-white/65">Pesquisa de Família</div>
              </div>
              <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/85">
                Etapa {step + 1} de {steps.length}
              </div>
            </div>

            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#e5c989]">{steps[step].eyebrow}</p>
            <h1 className="mt-2 max-w-2xl text-3xl font-black tracking-[-0.045em] sm:text-4xl">{steps[step].title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/72 sm:text-base">{steps[step].subtitle}</p>

            <div className="mt-7 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-[#e8c979] transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </header>

        <div className="space-y-4">
          {step === 0 && (
            <>
              <section className="rounded-[26px] border border-[#eadfce] bg-[#fffaf0] p-5 sm:p-6">
                <label className="block text-sm font-bold text-[#4d412f]">
                  Seu nome <span className="font-medium text-[#9a8b72]">(opcional)</span>
                </label>
                <p className="mt-1 text-xs leading-5 text-[#8b7c66]">
                  A identificação não é obrigatória. Se preferir, você pode responder sem informar seu nome.
                </p>
                <input
                  value={form.respondent_name}
                  onChange={(event) => update('respondent_name', event.target.value)}
                  maxLength={120}
                  placeholder="Digite seu nome, se desejar"
                  className="mt-4 w-full rounded-2xl border border-[#ded2bd] bg-white px-4 py-3.5 text-sm outline-none transition placeholder:text-[#b3a58f] focus:border-[#8c7246] focus:ring-4 focus:ring-[#8c7246]/10"
                />
              </section>

              <FieldCard number="1" title="De 0 a 10, o quanto você recomendaria a Bee para outra família?">
                <div className="mb-2 flex justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8a7a62]">
                  <span>Não recomendaria</span>
                  <span>Recomendaria muito</span>
                </div>
                <div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
                  {npsOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => update('nps_score', option)}
                      className={`h-11 rounded-xl border text-sm font-extrabold transition ${
                        form.nps_score === option
                          ? 'border-[#2f3c2f] bg-[#2f3c2f] text-white'
                          : 'border-[#e3d8c5] bg-white text-[#5e503a] hover:border-[#98805a]'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </FieldCard>

              <FieldCard number="2" title="Se quiser, conte o que mais influenciou sua nota." required={false}>
                <textarea
                  value={form.nps_comment}
                  onChange={(event) => update('nps_comment', event.target.value)}
                  rows={4}
                  maxLength={1500}
                  placeholder="Escreva aqui..."
                  className="w-full resize-none rounded-2xl border border-[#ded3c0] bg-[#fffdf8] px-4 py-3.5 text-sm leading-6 outline-none transition placeholder:text-[#b0a38e] focus:border-[#8b7145] focus:ring-4 focus:ring-[#8b7145]/10"
                />
              </FieldCard>
            </>
          )}

          {step === 1 && (
            <>
              <FieldCard number="3" title="Como você avalia o evento de forma geral?">
                <RatingScale value={form.event_overall} onChange={(value) => update('event_overall', value)} />
              </FieldCard>

              <FieldCard number="4" title="Como você avalia a organização do evento?">
                <RatingScale value={form.event_organization} onChange={(value) => update('event_organization', value)} />
              </FieldCard>

              <FieldCard number="5" title="Como você avalia o acolhimento e atendimento da equipe?">
                <RatingScale value={form.event_team} onChange={(value) => update('event_team', value)} />
              </FieldCard>

              <FieldCard number="6" title="Como você avalia a experiência proporcionada ao seu filho?">
                <RatingScale value={form.child_experience} onChange={(value) => update('child_experience', value)} />
              </FieldCard>

              <FieldCard number="7" title="O evento correspondeu às suas expectativas?">
                <ChoiceGroup
                  options={expectationOptions}
                  value={form.expectations}
                  onChange={(value) => update('expectations', value)}
                />
              </FieldCard>
            </>
          )}

          {step === 2 && (
            <>
              <FieldCard number="8" title="Qual foi o momento que você mais gostou?">
                <textarea
                  value={form.favorite_moment}
                  onChange={(event) => update('favorite_moment', event.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder="Conte pra gente..."
                  className="w-full resize-none rounded-2xl border border-[#ded3c0] bg-[#fffdf8] px-4 py-3.5 text-sm leading-6 outline-none transition placeholder:text-[#b0a38e] focus:border-[#8b7145] focus:ring-4 focus:ring-[#8b7145]/10"
                />
              </FieldCard>

              <FieldCard number="9" title="O que você acha que poderia ser melhorado?">
                <textarea
                  value={form.improvements}
                  onChange={(event) => update('improvements', event.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder="Sua percepção é importante..."
                  className="w-full resize-none rounded-2xl border border-[#ded3c0] bg-[#fffdf8] px-4 py-3.5 text-sm leading-6 outline-none transition placeholder:text-[#b0a38e] focus:border-[#8b7145] focus:ring-4 focus:ring-[#8b7145]/10"
                />
              </FieldCard>

              <FieldCard number="10" title="Você recomendaria que a escola continuasse realizando eventos como este?">
                <ChoiceGroup
                  options={continueOptions}
                  value={form.continue_events}
                  onChange={(value) => update('continue_events', value)}
                />
              </FieldCard>
            </>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-[#efc8bd] bg-[#fff2ed] px-4 py-3 text-sm font-semibold text-[#9d4b3a]">
            {error}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={back}
              disabled={sending}
              className="rounded-2xl border border-[#d9cdb9] bg-white px-5 py-3 text-sm font-bold text-[#63553f] transition hover:bg-[#fffaf0] disabled:opacity-50"
            >
              Voltar
            </button>
          ) : <div />}

          {step < steps.length - 1 ? (
            <button
              type="button"
              onClick={next}
              className="rounded-2xl bg-[#2f3c2f] px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-[#2f3c2f]/15 transition hover:-translate-y-0.5 hover:bg-[#263226]"
            >
              Continuar
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={sending}
              className="min-w-[150px] rounded-2xl bg-[#7c6337] px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-[#7c6337]/15 transition hover:-translate-y-0.5 hover:bg-[#684f2b] disabled:cursor-wait disabled:opacity-70"
            >
              {sending ? 'Enviando...' : 'Enviar pesquisa'}
            </button>
          )}
        </div>

        <p className="mx-auto mt-8 max-w-xl text-center text-xs leading-5 text-[#9a8b72]">
          Sua identificação é opcional. As respostas serão utilizadas pela Bee para compreender a experiência das famílias e orientar melhorias.
        </p>
      </div>
    </main>
  );
}
