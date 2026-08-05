import LegalLayout, { LegalSection } from '../components/LegalLayout.jsx';

export default function TermsOfUse() {
  return (
    <LegalLayout
      eyebrow="Condições de utilização"
      title="Termos de Uso do ZebraHub"
      description="Estes termos estabelecem as regras para acesso e utilização da plataforma ZebraHub e de suas integrações."
      updatedAt="4 de agosto de 2026"
    >
      <LegalSection title="1. Aceitação dos termos">
        <p>Ao acessar ou utilizar o ZebraHub, o usuário declara que leu e concorda com estes Termos de Uso e com a Política de Privacidade. Quando o uso ocorrer em nome de uma empresa, o usuário declara possuir autorização para representá-la.</p>
      </LegalSection>

      <LegalSection title="2. Acesso e responsabilidade da conta">
        <p>O usuário deve fornecer informações corretas, manter suas credenciais em segurança e comunicar imediatamente qualquer suspeita de acesso não autorizado. A conta é pessoal e não deve ser compartilhada fora das regras de acesso definidas pela organização.</p>
      </LegalSection>

      <LegalSection title="3. Uso permitido">
        <p>O ZebraHub deve ser utilizado para fins profissionais legítimos, respeitando leis, direitos de terceiros e as regras das plataformas integradas. É proibido utilizar o serviço para fraude, invasão, envio de conteúdo ilícito, violação de propriedade intelectual, coleta indevida de dados ou tentativa de contornar controles de segurança.</p>
      </LegalSection>

      <LegalSection title="4. Conteúdo e autorizações">
        <p>O usuário permanece responsável pelos textos, imagens, vídeos, documentos e demais conteúdos enviados, aprovados ou publicados pela plataforma. Ao usar recursos de publicação ou republicação, o usuário declara possuir as autorizações necessárias e deve respeitar autoria, imagem, marca e demais direitos aplicáveis.</p>
        <p>O ZebraHub executa ações conforme as configurações, permissões e comandos do usuário. Antes de ativar automações, recomenda-se validar o fluxo manualmente e configurar regras de aprovação adequadas.</p>
      </LegalSection>

      <LegalSection title="5. Integrações de terceiros">
        <p>Recursos conectados ao Instagram, Meta e outros serviços dependem da disponibilidade, das políticas e das APIs dessas plataformas. Mudanças, indisponibilidades, limitações ou bloqueios impostos por terceiros podem afetar determinadas funcionalidades sem que isso represente falha intencional do ZebraHub.</p>
      </LegalSection>

      <LegalSection title="6. Disponibilidade e alterações">
        <p>Buscamos manter a plataforma disponível e segura, mas podem ocorrer manutenções, atualizações e interrupções. Funcionalidades poderão ser ajustadas para atender requisitos técnicos, legais, de segurança ou das plataformas integradas.</p>
      </LegalSection>

      <LegalSection title="7. Suspensão e encerramento">
        <p>O acesso poderá ser suspenso ou encerrado em caso de violação destes termos, risco à segurança, inadimplência contratual, uso abusivo ou determinação legal. O usuário pode solicitar o encerramento e a exclusão de dados conforme as instruções disponibilizadas na página de Exclusão de Dados.</p>
      </LegalSection>

      <LegalSection title="8. Limitação de responsabilidade">
        <p>Na extensão permitida pela legislação, a Zebrazul não responde por danos decorrentes de uso indevido, credenciais comprometidas por culpa do usuário, conteúdo publicado sem autorização, falhas de terceiros ou decisões tomadas exclusivamente com base em informações inseridas na plataforma.</p>
      </LegalSection>

      <LegalSection title="9. Legislação e contato">
        <p>Estes termos são interpretados conforme a legislação brasileira. Dúvidas ou solicitações podem ser encaminhadas pelo contato indicado nesta página.</p>
      </LegalSection>
    </LegalLayout>
  );
}
