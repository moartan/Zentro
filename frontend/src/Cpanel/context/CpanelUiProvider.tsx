import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

type Theme = 'light' | 'dark';

type CpanelUiContextValue = {
  theme: Theme;
  toggleTheme: () => void;
  isSidebarPinned: boolean;
  toggleSidebarPinned: () => void;
};

const CpanelUiContext = createContext<CpanelUiContextValue | null>(null);

const THEME_STORAGE_KEY = 'zentro-cpanel-theme';
const SIDEBAR_STORAGE_KEY = 'cpanel.sidebar.pinned';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  return saved === 'dark' ? 'dark' : 'light';
}

function getInitialPinnedState() {
  if (typeof window === 'undefined') return true;
  const saved = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
  if (saved === 'true') return true;
  if (saved === 'false') return false;
  return true;
}

type Props = {
  children: ReactNode;
};

export default function CpanelUiProvider({ children }: Props) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [isSidebarPinned, setIsSidebarPinned] = useState(getInitialPinnedState);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);

    return () => {
      root.classList.remove('dark');
    };
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isSidebarPinned));
  }, [isSidebarPinned]);

  const value = useMemo(
    () => ({
      theme,
      toggleTheme: () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
      isSidebarPinned,
      toggleSidebarPinned: () => setIsSidebarPinned((current) => !current),
    }),
    [theme, isSidebarPinned],
  );

  return <CpanelUiContext.Provider value={value}>{children}</CpanelUiContext.Provider>;
}

export function useCpanelUi() {
  const context = useContext(CpanelUiContext);
  if (!context) {
    throw new Error('useCpanelUi must be used within CpanelUiProvider');
  }
  return context;
}
