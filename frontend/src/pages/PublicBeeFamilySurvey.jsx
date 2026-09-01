import { useEffect, useMemo, useState } from 'react';
import './PublicBeeFamilySurvey.css';

const API_BASE_URL = String(import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

const initialData = {
  responsibleName: "",
  studentName: "",
  whatsapp: "",
  email: "",
  unit: "",
  school: "",
  classGroup: "",
  experience: null,
  wellbeing: null,
  development: null,
  christianAlignment: null,
  communication: null,
  support: null,
  valuePerception: null,
  futureFit: null,
  relationship: null,
  nps: null,
  trustStrength: "",
  improvement: "",
  eventOverall: null,
  eventOrganization: null,
  eventTeam: null,
  childExperience: null,
  eventExpectations: "",
  favoriteMoment: "",
  eventImprovement: "",
  continueEvents: "",
  contactRequested: false,
  website: "",
};

const ratingQuestions = [
  {
    key: "experience",
    number: "01",
    question: "Como você avalia a experiência da sua família com a escola neste ano?",
    low: "Muito abaixo do esperado",
    high: "Supera as expectativas",
  },
  {
    key: "wellbeing",
    number: "02",
    question: "O quanto você percebe que seu filho se sente feliz, seguro e acolhido na rotina escolar?",
    low: "Percebo pouco",
    high: "Percebo muito",
  },
  {
    key: "development",
    number: "03",
    question: "Como você avalia o desenvolvimento acadêmico, pessoal e social do seu filho?",
    low: "Muito abaixo do esperado",
    high: "Supera as expectativas",
  },
  {
    key: "christianAlignment",
    number: "04",
    question: "O quanto a proposta cristã confessional está alinhada aos valores que sua família deseja fortalecer?",
    low: "Pouco alinhada",
    high: "Totalmente alinhada",
  },
  {
    key: "communication",
    number: "05",
    question: "Como você avalia a clareza e a frequência da comunicação da escola com sua família?",
    low: "Muito abaixo do esperado",
    high: "Supera as expectativas",
  },
  {
    key: "support",
    number: "06",
    question: "Quando sua família precisa da escola, o quanto se sente ouvida e bem acompanhada pela equipe?",
    low: "Pouco acompanhada",
    high: "Muito acompanhada",
  },
  {
    key: "valuePerception",
    number: "07",
    question: "Como você avalia a relação entre a experiência oferecida pela escola e o investimento realizado?",
    low: "Muito abaixo do esperado",
    high: "Supera as expectativas",
  },
  {
    key: "futureFit",
    number: "08",
    question: "Considerando a fase atual do seu filho, o quanto a proposta da escola continua adequada às necessidades da sua família?",
    low: "Pouco adequada",
    high: "Totalmente adequada",
  },
];

const relationshipOptions = [
  { value: 5, label: "Sentimo-nos muito seguros e satisfeitos com a escola." },
  { value: 4, label: "De modo geral, estamos satisfeitos." },
  { value: 3, label: "Estamos satisfeitos, mas existem pontos que merecem atenção." },
  { value: 2, label: "Temos dúvidas sobre alguns aspectos da experiência." },
  { value: 1, label: "Gostaríamos de uma conversa individual com a equipe." },
];

function ArrowIcon({ direction = "right" }) {
  return (
    <svg className={direction === "left" ? "rotate-180" : ""} width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3.75 9h10.5M10 4.75 14.25 9 10 13.25" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="m3.75 9.25 3.2 3.2 7.3-7.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RatingQuestion({ number, question, low, high, value, onChange }) {
  return (
    <fieldset className="rating-question">
      <legend>
        <span className="question-number">{number}</span>
        <span>{question}</span>
      </legend>
      <div className="rating-scale" role="radiogroup" aria-label={question}>
        {[1, 2, 3, 4, 5].map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            className={value === option ? "rating-option selected" : "rating-option"}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="scale-labels" aria-hidden="true">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </fieldset>
  );
}

export default function PublicBeeFamilySurvey() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState(initialData);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Pesquisa de Famílias | Bee";
    return () => { document.title = previousTitle; };
  }, []);

  const progress = useMemo(() => (step / 4) * 100, [step]);

  function update(key, value) {
    setData((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function validateCurrentStep() {
    if (step === 1) {
      const required = [data.studentName, data.whatsapp, data.unit, data.school, data.classGroup];
      if (required.some((value) => !String(value).trim())) {
        setError("Preencha os campos obrigatórios para continuar.");
        return false;
      }
    }

    if (step === 2 && ratingQuestions.some(({ key }) => data[key] == null)) {
      setError("Responda todas as perguntas para continuar.");
      return false;
    }

    if (step === 3) {
      const eventRatings = [data.eventOverall, data.eventOrganization, data.eventTeam, data.childExperience];
      if (eventRatings.some((value) => value == null)) {
        setError("Responda as quatro avaliações do evento para continuar.");
        return false;
      }
      if (!data.eventExpectations || !data.favoriteMoment.trim() || !data.eventImprovement.trim() || !data.continueEvents) {
        setError("Responda todas as perguntas do Dia dos Pais para continuar.");
        return false;
      }
    }

    if (step === 4 && (data.relationship == null || data.nps == null)) {
      setError("Selecione as duas avaliações obrigatórias antes de enviar.");
      return false;
    }

    return true;
  }

  function nextStep() {
    if (!validateCurrentStep()) return;
    setStep((current) => Math.min(4, current + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function previousStep() {
    setError("");
    setStep((current) => Math.max(1, current - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submitSurvey(event) {
    event.preventDefault();
    if (!validateCurrentStep()) return;

    setSubmitting(true);
    setError("");
    try {
      if (data.website.trim()) {
        setSubmitted(true);
        return;
      }

      const submissionId = globalThis.crypto?.randomUUID?.()
        || `bee-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      const response = await fetch(`${API_BASE_URL}/public/bee-family-survey`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Survey-Source": "bee-family-experience",
          "X-Tenant-Slug": "zebrazul",
        },
        body: JSON.stringify({
        submission_id: submissionId,
        responsible_name: data.responsibleName.trim() || null,
        student_name: data.studentName,
        whatsapp: data.whatsapp,
        email: data.email || null,
        unit: data.unit,
        school: data.school,
        class_group: data.classGroup,
        experience: data.experience,
        wellbeing: data.wellbeing,
        development: data.development,
        christian_alignment: data.christianAlignment,
        communication: data.communication,
        support: data.support,
        value_perception: data.valuePerception,
        future_fit: data.futureFit,
        relationship: data.relationship,
        nps: data.nps,
        trust_strength: data.trustStrength || null,
        improvement: data.improvement || null,
        event_overall: data.eventOverall,
        event_organization: data.eventOrganization,
        event_team: data.eventTeam,
        child_experience: data.childExperience,
        event_expectations: data.eventExpectations,
        favorite_moment: data.favoriteMoment,
        event_improvement: data.eventImprovement,
        continue_events: data.continueEvents,
        contact_requested: data.contactRequested,
        created_at: new Date().toISOString(),
        }),
      });
      if (!response.ok) throw new Error("Não foi possível enviar sua resposta.");
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Não foi possível enviar agora. Verifique sua conexão e tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bee-survey-page">
      <main className="survey-shell">
      <aside className="brand-panel">
        <div className="brand-inner">
          <div className="brand-logos" aria-label="Bee Christian School e Bee Light">
            <img src="/npsbee-assets/bee/logo-bee.png" alt="Bee Christian School" />
            <span className="brand-divider" />
            <img src="/npsbee-assets/bee/logo-belight.png" alt="Bee Light" />
          </div>

          <div className="brand-copy">
            <p className="eyebrow"><span /> Famílias Bee</p>
            <h1>Sua experiência nos ajuda a <em>cuidar ainda melhor.</em></h1>
            <p>Queremos compreender como sua família tem vivido a escola para fortalecer o que funciona e aprimorar, com cuidado, o que merece atenção.</p>
          </div>

          <div className="brand-points">
            <div><span><CheckIcon /></span><p><strong>Escuta individual</strong>As respostas serão analisadas com atenção.</p></div>
            <div><span><CheckIcon /></span><p><strong>Pesquisa breve</strong>O preenchimento leva cerca de 5 minutos.</p></div>
            <div><span><CheckIcon /></span><p><strong>Educação, fé e família</strong>Caminhando juntas todos os dias.</p></div>
          </div>

          <div className="family-photo">
            <img src="/npsbee-assets/bee/family.webp" alt="Família da comunidade escolar Bee" />
            <div><span /> Uma escola de verdade</div>
          </div>
        </div>
      </aside>

      <section className="form-panel">
        <div className="form-container">
          {!submitted ? (
            <>
              <header className="form-header">
                <div className="step-meta">
                  <span>Etapa {step} de 4</span>
                  <span>{step === 1 ? "Sua família" : step === 2 ? "Experiência" : step === 3 ? "Dia dos Pais" : "Vínculo e confiança"}</span>
                </div>
                <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
              </header>

              <form onSubmit={submitSurvey} noValidate>
                {step === 1 && (
                  <section className="form-step" aria-labelledby="step-one-title">
                    <div className="step-heading">
                      <p>Para começar</p>
                      <h2 id="step-one-title">Vamos conhecer sua família.</h2>
                      <span>Essas informações permitem compreender corretamente o contexto de cada experiência.</span>
                    </div>

                    <div className="field-grid">
                      <label className="field full"><span>Nome do responsável <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#999287" }}>(opcional)</span></span><input value={data.responsibleName} onChange={(event) => update("responsibleName", event.target.value)} autoComplete="name" placeholder="Digite seu nome, se desejar" /></label>
                      <label className="field full"><span>Nome do aluno <b>*</b></span><input value={data.studentName} onChange={(event) => update("studentName", event.target.value)} placeholder="Digite o nome do aluno" /></label>
                      <label className="field"><span>WhatsApp <b>*</b></span><input value={data.whatsapp} onChange={(event) => update("whatsapp", event.target.value)} inputMode="tel" autoComplete="tel" placeholder="(84) 99999-9999" /></label>
                      <label className="field"><span>E-mail</span><input value={data.email} onChange={(event) => update("email", event.target.value)} type="email" autoComplete="email" placeholder="seuemail@exemplo.com" /></label>
                      <label className="field"><span>Unidade <b>*</b></span><select value={data.unit} onChange={(event) => update("unit", event.target.value)}><option value="">Selecione</option><option>Natal</option><option>Parnamirim</option></select></label>
                      <label className="field"><span>Turma do aluno <b>*</b></span><input value={data.classGroup} onChange={(event) => update("classGroup", event.target.value)} placeholder="Ex.: Nível 4 ou 3º ano" /></label>
                      <label className="field full"><span>Escola <b>*</b></span><select value={data.school} onChange={(event) => update("school", event.target.value)}><option value="">Selecione</option><option value="Bee Christian School — Educação Infantil">Bee Christian School — Educação Infantil</option><option value="Bee Light — Ensino Fundamental">Bee Light — Ensino Fundamental</option></select></label>
                      <label className="honeypot" aria-hidden="true">Não preencha<input tabIndex={-1} autoComplete="off" value={data.website} onChange={(event) => update("website", event.target.value)} /></label>
                    </div>
                  </section>
                )}

                {step === 2 && (
                  <section className="form-step" aria-labelledby="step-two-title">
                    <div className="step-heading">
                      <p>Sua percepção</p>
                      <h2 id="step-two-title">Como tem sido a experiência?</h2>
                      <span>Escolha uma nota de 1 a 5 em cada pergunta. Não existem respostas certas ou erradas.</span>
                    </div>
                    <div className="rating-list">
                      {ratingQuestions.map((item) => (
                        <RatingQuestion key={item.key} {...item} value={data[item.key]} onChange={(value) => update(item.key, value)} />
                      ))}
                    </div>
                  </section>
                )}

                {step === 3 && (
                  <section className="form-step" aria-labelledby="step-three-title">
                    <div className="step-heading">
                      <p>Dia dos Pais · 22/08</p>
                      <h2 id="step-three-title">Como foi a experiência no evento?</h2>
                      <span>Queremos entender o que funcionou bem e o que podemos aprimorar nos próximos encontros com as famílias.</span>
                    </div>

                    <div className="rating-list">
                      <RatingQuestion number="09" question="Como você avalia o evento de forma geral?" low="Ruim" high="Ótimo" value={data.eventOverall} onChange={(value) => update("eventOverall", value)} />
                      <RatingQuestion number="10" question="Como você avalia a organização do evento?" low="Ruim" high="Ótimo" value={data.eventOrganization} onChange={(value) => update("eventOrganization", value)} />
                      <RatingQuestion number="11" question="Como você avalia o acolhimento e atendimento da equipe?" low="Ruim" high="Ótimo" value={data.eventTeam} onChange={(value) => update("eventTeam", value)} />
                      <RatingQuestion number="12" question="Como você avalia a experiência proporcionada ao seu filho?" low="Ruim" high="Ótimo" value={data.childExperience} onChange={(value) => update("childExperience", value)} />
                    </div>

                    <fieldset className="relationship-field">
                      <legend><span className="question-number">13</span><span>O evento correspondeu às suas expectativas?</span></legend>
                      <div className="relationship-options" role="radiogroup">
                        {["Superou minhas expectativas", "Correspondeu às expectativas", "Correspondeu parcialmente", "Não correspondeu"].map((option) => (
                          <button type="button" key={option} role="radio" aria-checked={data.eventExpectations === option} className={data.eventExpectations === option ? "relationship-option selected" : "relationship-option"} onClick={() => update("eventExpectations", option)}>
                            <span className="radio-mark"><i /></span><span>{option}</span>
                          </button>
                        ))}
                      </div>
                    </fieldset>

                    <div className="open-fields">
                      <label className="field">
                        <span><span className="question-number">14</span> Qual foi o momento que você mais gostou? <b>*</b></span>
                        <textarea value={data.favoriteMoment} onChange={(event) => update("favoriteMoment", event.target.value)} rows={4} placeholder="Conte pra gente qual momento mais marcou sua família" />
                      </label>
                      <label className="field">
                        <span><span className="question-number">15</span> O que você acha que poderia ser melhorado? <b>*</b></span>
                        <textarea value={data.eventImprovement} onChange={(event) => update("eventImprovement", event.target.value)} rows={4} placeholder="Sua percepção vai nos ajudar a melhorar os próximos eventos" />
                      </label>
                    </div>

                    <fieldset className="relationship-field">
                      <legend><span className="question-number">16</span><span>Você recomendaria que a escola continuasse realizando eventos como este?</span></legend>
                      <div className="relationship-options" role="radiogroup">
                        {["Com certeza", "Sim", "Talvez", "Não"].map((option) => (
                          <button type="button" key={option} role="radio" aria-checked={data.continueEvents === option} className={data.continueEvents === option ? "relationship-option selected" : "relationship-option"} onClick={() => update("continueEvents", option)}>
                            <span className="radio-mark"><i /></span><span>{option}</span>
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  </section>
                )}

                {step === 4 && (
                  <section className="form-step" aria-labelledby="step-four-title">
                    <div className="step-heading">
                      <p>Para concluir</p>
                      <h2 id="step-four-title">Vínculo, confiança e próximos cuidados.</h2>
                      <span>Este é o espaço para nos contar o que fortalece sua confiança e o que podemos aprimorar.</span>
                    </div>

                    <fieldset className="relationship-field">
                      <legend><span className="question-number">17</span><span>Qual frase melhor representa a relação da sua família com a escola hoje?</span></legend>
                      <div className="relationship-options" role="radiogroup">
                        {relationshipOptions.map((option) => (
                          <button type="button" key={option.value} role="radio" aria-checked={data.relationship === option.value} className={data.relationship === option.value ? "relationship-option selected" : "relationship-option"} onClick={() => update("relationship", option.value)}>
                            <span className="radio-mark"><i /></span><span>{option.label}</span>
                          </button>
                        ))}
                      </div>
                    </fieldset>

                    <fieldset className="nps-field">
                      <legend><span className="question-number">18</span><span>De 0 a 10, o quanto você recomendaria a Bee para uma família que compartilha valores semelhantes aos seus?</span></legend>
                      <div className="nps-scale" role="radiogroup">
                        {Array.from({ length: 11 }, (_, index) => index).map((option) => (
                          <button key={option} type="button" role="radio" aria-checked={data.nps === option} className={data.nps === option ? "nps-option selected" : "nps-option"} onClick={() => update("nps", option)}>{option}</button>
                        ))}
                      </div>
                      <div className="scale-labels"><span>Pouco provável</span><span>Muito provável</span></div>
                    </fieldset>

                    <div className="open-fields">
                      <label className="field"><span>Qual aspecto da escola mais fortalece a confiança da sua família?</span><textarea value={data.trustStrength} onChange={(event) => update("trustStrength", event.target.value)} rows={4} placeholder="Conte-nos o que mais valoriza na experiência Bee" /></label>
                      <label className="field"><span>O que poderíamos aprimorar para tornar a experiência da sua família ainda melhor?</span><textarea value={data.improvement} onChange={(event) => update("improvement", event.target.value)} rows={4} placeholder="Sua percepção é muito importante para nós" /></label>
                    </div>

                    <label className="contact-choice">
                      <input type="checkbox" checked={data.contactRequested} onChange={(event) => update("contactRequested", event.target.checked)} />
                      <span className="checkbox-mark"><CheckIcon /></span>
                      <span><strong>Gostaria que alguém da equipe entrasse em contato.</strong><small>Uma conversa cuidadosa e individual sobre a experiência da sua família.</small></span>
                    </label>
                  </section>
                )}

                {error && <p className="form-error" role="alert">{error}</p>}

                <footer className="form-actions">
                  {step > 1 ? <button type="button" className="secondary-button" onClick={previousStep}><ArrowIcon direction="left" /> Voltar</button> : <span />}
                  {step < 4 ? <button type="button" className="primary-button" onClick={nextStep}>Continuar <ArrowIcon /></button> : <button type="submit" className="primary-button" disabled={submitting}>{submitting ? "Enviando..." : "Enviar pesquisa"}{!submitting && <ArrowIcon />}</button>}
                </footer>
              </form>

              <p className="privacy-note">As informações serão utilizadas exclusivamente para aprimorar a experiência das famílias e orientar o cuidado da equipe escolar.</p>
            </>
          ) : (
            <section className="success-card" aria-live="polite">
              <div className="success-symbol"><CheckIcon /></div>
              <p>Resposta recebida</p>
              <h2>Obrigado por caminhar conosco.</h2>
              <span>Sua percepção será lida com atenção e nos ajudará a cuidar ainda melhor da experiência de cada família Bee.</span>
              <div className="success-line" />
              <small>Educação, fé e família caminhando juntas.</small>
            </section>
          )}
        </div>
      </section>
      </main>
    </div>
  );
}
