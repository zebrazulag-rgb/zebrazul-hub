import LegalLayout, { LegalSection } from '../components/LegalLayout.jsx';

export default function PrivacyPolicy() {
  return (
    <LegalLayout
      eyebrow="Privacidade e proteção de dados"
      title="Política de Privacidade do ZebraHub"
      description="Esta política explica como o ZebraHub trata dados pessoais e informações de contas profissionais conectadas à plataforma."
      updatedAt="4 de agosto de 2026"
    >
      <LegalSection title="1. Quem somos">
        <p>O ZebraHub é uma plataforma de gestão desenvolvida e operada pela Zebrazul para organizar atividades, materiais, aprovações, relatórios, integrações e rotinas de comunicação de agências e seus clientes.</p>
      </LegalSection>

      <LegalSection title="2. Quais dados podemos tratar">
        <p>Dependendo dos recursos utilizados, podemos tratar dados cadastrais e profissionais, como nome, e-mail, função, empresa, foto de perfil e informações de clientes vinculados ao usuário.</p>
        <p>Nas integrações com a Meta e o Instagram, podemos tratar identificadores da conta profissional, nome de usuário, tipo da conta, permissões concedidas, tokens de acesso armazenados de forma protegida, eventos de mensagens, marcações em Stories e arquivos de mídia necessários para executar recursos autorizados pelo usuário.</p>
        <p>Também podemos registrar informações técnicas, como data e horário de acesso, endereço IP, navegador, dispositivo, registros de erro e ações realizadas na plataforma, para segurança, diagnóstico e funcionamento do serviço.</p>
      </LegalSection>

      <LegalSection title="3. Como utilizamos os dados">
        <p>Usamos os dados para autenticar usuários, disponibilizar as funcionalidades contratadas, conectar contas profissionais, receber conteúdos autorizados, publicar conteúdos quando solicitado, gerar relatórios, manter históricos operacionais, prevenir fraude e abuso, solucionar erros e melhorar a segurança da plataforma.</p>
        <p>O ZebraHub não vende dados pessoais. O tratamento ocorre conforme a necessidade de prestação do serviço, o consentimento e as permissões concedidas, o cumprimento de obrigações legais e os interesses legítimos relacionados à segurança e à operação da plataforma.</p>
      </LegalSection>

      <LegalSection title="4. Integrações com Meta e Instagram">
        <p>Ao conectar uma conta profissional, o usuário autoriza o ZebraHub a acessar somente as permissões apresentadas no fluxo oficial de autenticação. O usuário pode remover a autorização nas configurações da conta conectada ou solicitar a desconexão pelo ZebraHub.</p>
        <p>As mídias recebidas para aprovação ou republicação podem ser armazenadas temporariamente em infraestrutura segura para viabilizar a funcionalidade. O período de retenção pode variar conforme o status do conteúdo, as configurações da conta e necessidades de auditoria e segurança.</p>
      </LegalSection>

      <LegalSection title="5. Compartilhamento e operadores">
        <p>Podemos utilizar fornecedores de infraestrutura, hospedagem, banco de dados, entrega de conteúdo, monitoramento e comunicação estritamente para operar o ZebraHub. Esses fornecedores recebem apenas as informações necessárias para prestar seus serviços e devem observar obrigações de segurança e confidencialidade.</p>
        <p>Dados também poderão ser compartilhados quando necessário para cumprir lei, decisão judicial, ordem de autoridade competente, proteger direitos ou investigar fraude e incidentes de segurança.</p>
      </LegalSection>

      <LegalSection title="6. Segurança e retenção">
        <p>Adotamos medidas técnicas e administrativas razoáveis, incluindo controle de acesso, armazenamento protegido de credenciais, segregação por cliente e registros de operação. Nenhum sistema é totalmente imune a riscos, mas buscamos prevenir acesso, uso, alteração ou divulgação não autorizados.</p>
        <p>Os dados são mantidos pelo tempo necessário para cumprir as finalidades descritas nesta política, obrigações legais, exercício de direitos e segurança da plataforma. Quando deixam de ser necessários, podem ser excluídos ou anonimizados.</p>
      </LegalSection>

      <LegalSection title="7. Direitos do titular">
        <p>Nos termos da legislação aplicável, o titular pode solicitar confirmação do tratamento, acesso, correção, portabilidade quando cabível, informação sobre compartilhamento, revogação do consentimento e exclusão de dados tratados com base no consentimento, ressalvadas hipóteses legais de conservação.</p>
        <p>As solicitações podem ser enviadas pelo contato indicado nesta página. Para proteger o titular, poderemos pedir informações adicionais para confirmar a identidade e a legitimidade do pedido.</p>
      </LegalSection>

      <LegalSection title="8. Alterações desta política">
        <p>Esta política poderá ser atualizada para refletir melhorias na plataforma, mudanças legais ou novas integrações. A versão vigente será sempre disponibilizada nesta página com a data de atualização.</p>
      </LegalSection>
    </LegalLayout>
  );
}
