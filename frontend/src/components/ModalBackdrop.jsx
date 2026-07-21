import { useEffect } from 'react';

let activeScrollLocks = 0;
let previousBodyOverflow = '';
let previousHtmlOverflow = '';

function lockPageScroll() {
  if (activeScrollLocks === 0) {
    previousBodyOverflow = document.body.style.overflow;
    previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
  }
  activeScrollLocks += 1;
}

function unlockPageScroll() {
  activeScrollLocks = Math.max(0, activeScrollLocks - 1);
  if (activeScrollLocks !== 0) return;

  document.body.style.overflow = previousBodyOverflow;
  document.documentElement.style.overflow = previousHtmlOverflow;
}

export default function ModalBackdrop({
  children,
  onClose,
  disabled = false,
  className = '',
  role = 'presentation'
}) {
  useEffect(() => {
    lockPageScroll();
    return unlockPageScroll;
  }, []);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape' && !disabled) onClose?.();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [disabled, onClose]);

  function handleMouseDown(event) {
    if (disabled || event.target !== event.currentTarget) return;
    onClose?.();
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center overflow-y-auto overscroll-contain bg-black/40 p-4 ${className}`.trim()}
      onMouseDown={handleMouseDown}
      role={role}
    >
      {children}
    </div>
  );
}
