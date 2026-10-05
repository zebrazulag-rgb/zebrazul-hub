import { Navigate, useParams } from 'react-router-dom';

// Compatibilidade com links de aprovação já compartilhados.
// O fluxo canônico do cliente é a grade pública, que já existe e usa o
// feed_share_token do cliente. Assim evitamos manter duas APIs públicas para
// o mesmo conteúdo.
export default function PublicDesignerApproval() {
  const { token } = useParams();
  return <Navigate to={`/grade/${token || ''}`} replace />;
}
