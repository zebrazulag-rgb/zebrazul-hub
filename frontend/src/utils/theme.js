export const THEME_STORAGE_KEY = 'zebrahub.theme';
export const THEMES = ['light', 'dark'];

export function getStoredTheme() {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return THEMES.includes(stored) ? stored : 'dark';
}

export function applyTheme(theme) {
  if (typeof document === 'undefined') return 'dark';
  const nextTheme = THEMES.includes(theme) ? theme : 'dark';
  document.documentElement.dataset.zebrahubTheme = nextTheme;
  document.documentElement.style.colorScheme = nextTheme;
  document.body.dataset.zebrahubTheme = nextTheme;
  return nextTheme;
}

export function saveTheme(theme) {
  const nextTheme = applyTheme(theme);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    window.dispatchEvent(new CustomEvent('zebrahub:theme-change', { detail: { theme: nextTheme } }));
  }
  return nextTheme;
}

export function initializeTheme() {
  return applyTheme(getStoredTheme());
}
