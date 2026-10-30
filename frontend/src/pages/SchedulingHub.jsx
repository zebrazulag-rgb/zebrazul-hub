import { useSearchParams } from 'react-router-dom';
import AreaSwitch from '../components/AreaSwitch.jsx';
import Scheduling from './Scheduling.jsx';
import VideoScheduling from './VideoScheduling.jsx';

// Agendamento: peças do Designer (como sempre) | vídeos aprovados do Audiovisual.
export default function SchedulingHub() {
  const [params, setParams] = useSearchParams();
  const area = params.get('area') === 'audiovisual' ? 'audiovisual' : 'designer';
  const change = (key) => setParams(key === 'audiovisual' ? { area: 'audiovisual' } : {}, { replace: true });
  return (
    <div className="space-y-4">
      <AreaSwitch value={area} onChange={change} options={[{ key: 'designer', label: 'Designer' }, { key: 'audiovisual', label: 'Audiovisual' }]} />
      {area === 'audiovisual' ? <VideoScheduling /> : <Scheduling />}
    </div>
  );
}
