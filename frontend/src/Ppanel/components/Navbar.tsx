import { Link, NavLink } from 'react-router-dom';
import zentroLogo from '../../assets/zentro.png';
import { useApp } from '../../shared/AppProvider';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-4 py-2 text-sm font-medium transition ${
    isActive
      ? 'bg-primary/15 text-primary'
      : 'text-foreground/80 hover:bg-secondary/70 hover:text-foreground'
  }`;

export default function Navbar() {
  const { user, isAuthLoading, signOut } = useApp();

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      // Keep UI responsive even if request fails; protected routes still enforce auth.
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 md:px-6">
        <Link to="/" className="group flex items-center gap-1.5">
          <span className="inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl">
            <img
              src={zentroLogo}
              alt="Zentro logo"
              className="h-10 w-10 object-contain transition-transform duration-200 group-hover:scale-105"
            />
          </span>
          <div className="bg-gradient-to-r from-foreground via-primary-dark to-primary bg-clip-text text-3xl font-black leading-none tracking-tight text-transparent transition-opacity duration-200 group-hover:opacity-90">
            entro
          </div>
        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          <NavLink to="/" end className={navLinkClass}>
            Home
          </NavLink>
          <NavLink to="/features" className={navLinkClass}>
            Features
          </NavLink>
          <NavLink to="/pricing" className={navLinkClass}>
            Pricing
          </NavLink>
          <NavLink to="/docs" className={navLinkClass}>
            Docs
          </NavLink>
          <NavLink to="/contact-sales" className={navLinkClass}>
            Contact
          </NavLink>
        </nav>

        <div className="flex items-center gap-2">
          {!isAuthLoading && !user && (
            <>
              <NavLink
                to="/login"
                className="hidden rounded-full px-4 py-2 text-sm font-medium text-foreground/80 transition hover:bg-secondary/70 hover:text-foreground sm:inline-flex"
              >
                Sign in
              </NavLink>
              <NavLink
                to="/signup"
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark"
              >
                Start Free
              </NavLink>
            </>
          )}

          {!isAuthLoading && user && (
            <>
              <NavLink
                to="/cpanel"
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark"
              >
                Dashboard
              </NavLink>
              <button
                type="button"
                onClick={handleSignOut}
                className="hidden rounded-full px-4 py-2 text-sm font-medium text-foreground/80 transition hover:bg-secondary/70 hover:text-foreground sm:inline-flex"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
