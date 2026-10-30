import { useSearchParams } from 'react-router-dom';
import AreaSwitch from '../components/AreaSwitch.jsx';
import DesignerApproval from './DesignerApproval.jsx';
import VideoApproval from './VideoApproval.jsx';

// Aprovação: DESIGNER (fluxo que já existia) | AUDIOVISUAL (vídeos, em grade própria por enquanto).
export default function ApprovalHub() {
  const [params, setParams] = useSearchParams();
  const area = params.get('area') === 'audiovisual' ? 'audiovisual' : 'designer';
  const change = (key) => setParams(key === 'audiovisual' ? { area: 'audiovisual' } : {}, { replace: true });
  return (
    <div className="space-y-4">
      <AreaSwitch value={area} onChange={change} options={[{ key: 'designer', label: 'Designer' }, { key: 'audiovisual', label: 'Audiovisual' }]} />
      {area === 'audiovisual' ? <VideoApproval /> : <DesignerApproval />}
    </div>
  );
}
