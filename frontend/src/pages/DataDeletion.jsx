import LegalLayout, { LegalSection } from '../components/LegalLayout.jsx';

export default function DataDeletion() {
  return (
    <LegalLayout
      eyebrow="Privacidade e controle"
      title="Instruções para Exclusão de Dados"
      description="Veja como solicitar a exclusão de dados pessoais e a remoção de contas e integrações vinculadas ao ZebraHub."
      updatedAt="4 de agosto de 2026"
    >
      <LegalSection title="1. Como solicitar">
        <p>Envie um e-mail para <a className="font-semibold text-blue-700 underline underline-offset-2" href="mailto:arthurzebrazul@gmail.com?subject=Solicitação%20de%20exclusão%20de%20dados%20-%20ZebraHub">arthurzebrazul@gmail.com</a> com o assunto <strong>“Solicitação de exclusão de dados — ZebraHub”</strong>.</p>
        <p>Informe o nome, o e-mail utilizado na plataforma, a empresa ou cliente relacionado e, quando aplicável, o nome de usuário da conta profissional conectada. Não envie senhas, tokens ou códigos de autenticação.</p>
      </LegalSection>

      <LegalSection title="2. Confirmação da identidade">
        <p>Para evitar exclusões indevidas, poderemos solicitar informações adicionais que comprovem a identidade do solicitante e sua autorização sobre a conta ou organização envolvida.</p>
      </LegalSection>

      <LegalSection title="3. O que será excluído">
        <p>Após a validação, serão excluídos ou anonimizados os dados pessoais e os registros vinculados à solicitação que não precisem ser mantidos por obrigação legal, segurança, prevenção a fraude, exercício de direitos ou cumprimento contratual.</p>
        <p>Quando solicitado, também removeremos tokens de acesso e vínculos de integrações com contas profissionais, interrompendo novas coletas e ações automatizadas.</p>
      </LegalSection>

      <LegalSection title="4. Desconectar diretamente no Instagram ou Meta">
        <p>O usuário também pode revogar o acesso do aplicativo nas configurações de Apps e Sites da conta Meta ou Instagram. A revogação interrompe o acesso futuro, mas não substitui necessariamente a solicitação de exclusão de dados já armazenados no ZebraHub.</p>
      </LegalSection>

      <LegalSection title="5. Prazo e retorno">
        <p>Confirmaremos o recebimento da solicitação e informaremos o andamento pelo e-mail utilizado no pedido. O prazo de conclusão dependerá da complexidade, da necessidade de confirmação de identidade e das obrigações legais aplicáveis.</p>
      </LegalSection>

      <LegalSection title="6. Dados que podem ser preservados">
        <p>Alguns registros mínimos podem ser mantidos quando necessários para cumprir obrigações legais, preservar evidências de segurança, responder a disputas ou demonstrar o atendimento da própria solicitação de exclusão.</p>
      </LegalSection>
    </LegalLayout>
  );
}
