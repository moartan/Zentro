import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.16),_transparent_55%),linear-gradient(to_bottom,#f8fbff,#f3f8ff)] text-foreground">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border/80 bg-background/70">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 text-sm text-muted-foreground md:px-6">
          <span>Built for modern SaaS teams</span>
          <span>© 2026 Zentro</span>
        </div>
      </footer>
    </div>
  );
}
