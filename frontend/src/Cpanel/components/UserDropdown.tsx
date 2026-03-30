import { useEffect, useRef, useState } from 'react';
import { BriefcaseBusiness, ChevronDown, LogOut, Pencil, User } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../shared/AppProvider';

type UserDropdownProps = {
  name?: string;
  initials?: string;
  role?: string;
};

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export default function UserDropdown({
  name,
  initials = 'MA',
  role = 'Business User',
}: UserDropdownProps) {
  const navigate = useNavigate();
  const { user, signOut } = useApp();
  const [open, setOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const displayName = name ?? user?.fullName ?? user?.email ?? 'User';
  const displayInitials = user ? getInitials(user.fullName ?? user.email ?? 'U') : initials;
  const displayRole =
    user?.role === 'super_admin'
      ? 'Platform Admin'
      : user?.role === 'business_owner'
      ? 'Workspace Owner'
      : user?.role === 'employee'
      ? 'Member'
      : role;
  const workspaceName = (() => {
    if (!user) return null;
    if (user.isPlatformSuperAdmin) return 'Platform';
    if (!user.businessId) return null;
    const match = user.memberships?.find((m) => m.businessId === user.businessId);
    return match?.businessName ?? null;
  })();
  const displayMeta = workspaceName ?? user?.email ?? displayRole;

  useEffect(() => {
    if (!open) return;

    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  async function handleSignOut() {
    try {
      setIsSigningOut(true);
      await signOut();
      setOpen(false);
      navigate('/login', { replace: true });
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        className="flex items-center gap-3 rounded-xl border border-border px-2 py-1.5 hover:bg-secondary/50"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-secondary/60 text-sm font-semibold text-foreground">
          {displayInitials}
        </span>
        <span className="text-sm font-semibold text-foreground">{displayName}</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-64 rounded-2xl border border-border bg-background shadow-lg" role="menu">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-secondary/60 text-sm font-semibold text-foreground">
              {displayInitials}
            </span>
            <div>
              <div className="text-sm font-semibold text-foreground">{displayName}</div>
              <div className="text-xs text-muted-foreground">{displayMeta}</div>
            </div>
          </div>
          <div className="flex flex-col py-2">
            {workspaceName && user?.role === 'business_owner' && (
              <Link
                to="/cpanel/workspace"
                role="menuitem"
                className="flex items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-secondary/50"
                onClick={() => setOpen(false)}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-secondary/60">
                  <BriefcaseBusiness className="h-4 w-4 text-muted-foreground" />
                </span>
                <span className="truncate">{workspaceName}</span>
              </Link>
            )}
            <Link
              to="/cpanel/profile"
              role="menuitem"
              className="flex items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-secondary/50"
              onClick={() => setOpen(false)}
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-secondary/60">
                <User className="h-4 w-4 text-muted-foreground" />
              </span>
              Profile
            </Link>
            <button
              type="button"
              role="menuitem"
              className="flex items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-secondary/50"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-secondary/60">
                <Pencil className="h-4 w-4 text-muted-foreground" />
              </span>
              Settings
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="flex items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-secondary/50"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-secondary/60">
                <LogOut className="h-4 w-4 text-muted-foreground" />
              </span>
              {isSigningOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
