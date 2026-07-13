import { useRef } from 'react';
import { Camera } from 'lucide-react';

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function AvatarUpload({ imageSrc, fallbackText, fallbackColor = '#2563eb', size = 64, onChange }) {
  const inputRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      alert('Escolha uma imagem de até 3MB.');
      return;
    }
    const dataUrl = await fileToBase64(file);
    onChange(dataUrl, file.type);
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className="relative group shrink-0"
      style={{ width: size, height: size }}
      title="Clique para trocar a foto"
    >
      {imageSrc ? (
        <img src={imageSrc} alt="" className="w-full h-full rounded-full object-cover" />
      ) : (
        <div
          className="w-full h-full rounded-full flex items-center justify-center text-white font-bold"
          style={{ backgroundColor: fallbackColor, fontSize: size * 0.4 }}
        >
          {fallbackText?.[0]?.toUpperCase() || '?'}
        </div>
      )}
      <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
        <Camera size={size * 0.3} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </button>
  );
}
