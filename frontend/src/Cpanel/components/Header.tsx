import { Moon, Search, Sun } from 'lucide-react';
import NotificationDropdown from './NotificationDropdown';
import UserDropdown from './UserDropdown';
import { useCpanelUi } from '../context/CpanelUiProvider';

export default function Header() {
  const { theme, toggleTheme } = useCpanelUi();

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-5 border-b border-border bg-background px-4 py-3 text-foreground">
      <div className="flex w-full max-w-md items-center gap-3 rounded-full border border-border bg-secondary/40 px-4 py-2 text-foreground">
        <Search className="h-5 w-5 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search..."
          className="w-full bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>
      <div className="flex items-center gap-4 text-foreground">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-border hover:bg-secondary/50"
          aria-label="Toggle theme"
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
        <NotificationDropdown />
        <UserDropdown />
      </div>
    </header>
  );
}
