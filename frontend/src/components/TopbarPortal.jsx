import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders page-specific navigation/actions inside the global ZebraHub topbar.
 * The target is owned by Layout, so pages stay decoupled from the shell while
 * avoiding a second, repetitive page header inside the workspace.
 */
export default function TopbarPortal({ children }) {
  const [target, setTarget] = useState(null);

  useEffect(() => {
    setTarget(document.getElementById('zebrahub-topbar-tools'));
  }, []);

  if (!target) return null;
  return createPortal(children, target);
}
