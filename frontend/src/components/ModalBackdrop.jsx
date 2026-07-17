import { useEffect } from 'react';

export default function ModalBackdrop({
  children,
  onClose,
  disabled = false,
  className = '',
  role = 'presentation'
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !disabled) onClose?.();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [disabled, onClose]);

  function handleMouseDown(event) {
    if (disabled || event.target !== event.currentTarget) return;
    onClose?.();
  }

  return (
    <div
      className={`fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 ${className}`.trim()}
      onMouseDown={handleMouseDown}
      role={role}
    >
      {children}
    </div>
  );
}
