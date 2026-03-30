import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import {
  BriefcaseBusiness,
  ClipboardCheck,
  CreditCard,
  LayoutDashboard,
  ListTodo,
  Settings,
  UserCog,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import zentroLogo from '../../assets/zentro.png';
import { useApp } from '../../shared/AppProvider';
import { useCpanelUi } from '../context/CpanelUiProvider';

type Role = 'super_admin' | 'business_owner' | 'employee';

type MenuItem = {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  end?: boolean;
};

type MenuSection = {
  title: string;
  items: MenuItem[];
};

const expandedWidth = 'w-[17rem]';
const collapsedWidth = 'w-20';
const linkBase =
  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-primary/10';
const linkActive = 'bg-primary/15 text-primary [&>span]:text-primary';
const linkCollapsed = 'justify-center gap-0 px-0 max-w-[3rem] mx-auto';
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `${linkBase} ${isActive ? linkActive : ''}`;

const roleMenu: Record<Role, MenuSection[]> = {
  super_admin: [
    { title: 'Dashboard', items: [{ label: 'Dashboard', to: '/cpanel', icon: LayoutDashboard, end: true }] },
    {
      title: 'Management',
      items: [
        { label: 'Users', to: '/cpanel/users', icon: Users },
        { label: 'Workspace', to: '/cpanel/workspaces', icon: BriefcaseBusiness },
      ],
    },
    {
      title: 'Subscriptions',
      items: [
        { label: 'Subscription Plans', to: '/cpanel/subscriptions/plans', icon: CreditCard },
        { label: 'Workspace Subscriptions', to: '/cpanel/subscriptions/businesses', icon: UsersRound },
      ],
    },
    {
      title: 'Tasks',
      items: [{ label: 'Tasks List', to: '/cpanel/tasks', icon: ListTodo, end: true }],
    },
    {
      title: 'Setting',
      items: [{ label: 'Settings', to: '/cpanel/settings', icon: Settings }],
    },
  ],
  business_owner: [
    { title: 'Dashboard', items: [{ label: 'Dashboard', to: '/cpanel', icon: LayoutDashboard, end: true }] },
    {
      title: 'Tasks',
      items: [
        { label: 'Tasks List', to: '/cpanel/tasks', icon: ListTodo, end: true },
        { label: 'My Tasks', to: '/cpanel/tasks/my', icon: ClipboardCheck },
        { label: 'Team List', to: '/cpanel/teams', icon: UsersRound },
        { label: 'Team Tasks', to: '/cpanel/tasks/team', icon: UserCog },
      ],
    },
    {
      title: 'Members',
      items: [
        { label: 'Members', to: '/cpanel/members', icon: Users, end: true },
        { label: 'Invite Member', to: '/cpanel/members/invite', icon: UserPlus },
      ],
    },
    {
      title: 'Subscription',
      items: [{ label: 'My Subscription', to: '/cpanel/my-subscription', icon: CreditCard }],
    },
  ],
  employee: [
    { title: 'Dashboard', items: [{ label: 'Dashboard', to: '/cpanel', icon: LayoutDashboard, end: true }] },
    {
      title: 'Tasks',
      items: [{ label: 'My Tasks', to: '/cpanel/tasks/my', icon: ClipboardCheck }],
    },
    {
      title: 'Teams',
      items: [{ label: 'My Teams', to: '/cpanel/my-teams', icon: UsersRound }],
    },
  ],
};

export default function Sidebar() {
  const { isSidebarPinned, toggleSidebarPinned } = useCpanelUi();
  const { user } = useApp();
  const [isHovering, setIsHovering] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeoutRef = useRef<number | null>(null);
  const isExpanded = isSidebarPinned || isHovering;

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  const handleScroll = () => {
    setIsScrolling(true);
    if (scrollTimeoutRef.current) {
      window.clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = window.setTimeout(() => {
      setIsScrolling(false);
      scrollTimeoutRef.current = null;
    }, 700);
  };

  const plan = useMemo(() => {
    if (user?.role !== 'business_owner') return null;
    if (!user.businessId) return 'free' as const;
    const match = user.memberships?.find((m) => m.businessId === user.businessId);
    return (match?.subscriptionPlan ?? 'free') as 'free' | 'pro' | 'enterprise';
  }, [user]);

  const planStyles = {
    free: {
      card: 'border-border bg-background text-foreground',
      badge: 'text-primary',
      button: 'bg-primary hover:bg-primary-dark',
      badgeLabel: 'Upgrade',
      body: 'Your version is free and limited.',
      sub: 'Go Pro to unlock more.',
      cta: 'View Plans',
    },
    pro: {
      card: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      badge: 'text-emerald-700',
      button: 'bg-emerald-600 hover:bg-emerald-700',
      badgeLabel: 'Zentro Pro',
      body: 'Your Pro plan is active.',
      sub: 'Enjoy advanced features and priority tools.',
      cta: 'Manage Plan',
    },
    enterprise: {
      card: 'border-sky-200 bg-sky-50 text-sky-900',
      badge: 'text-sky-700',
      button: 'bg-sky-600 hover:bg-sky-700',
      badgeLabel: 'Zentro Enterprise',
      body: 'You have no limits.',
      sub: 'Everything is unlocked and running at full power.',
      cta: 'Manage Plan',
    },
  } as const;

  const sections = useMemo(() => {
    if (!user?.role) return [];
    return roleMenu[user.role];
  }, [user?.role]);

  const sectionTitleClass =
    'text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground transition-opacity';
  const sectionTitleState = isExpanded ? 'opacity-100' : 'opacity-0';
  const labelClass =
    'transition-all duration-200 whitespace-nowrap' +
    (isExpanded ? ' opacity-100' : ' opacity-0 w-0 overflow-hidden');

  return (
    <aside
      className={`group peer absolute left-0 top-0 z-30 h-screen shrink-0 border-r border-border bg-background transition-[width] duration-200 ${
        isExpanded ? expandedWidth : collapsedWidth
      }`}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <div
        className={`absolute left-0 top-0 flex h-full flex-col border-r border-border bg-background pb-4 pt-2 transition-all duration-200 ${
          isExpanded ? expandedWidth : collapsedWidth
        }`}
      >
        <div className={`mb-6 flex items-center justify-between ${isExpanded ? 'px-4' : 'px-3'}`}>
          <div className={`flex items-center gap-4 ${isExpanded ? '' : 'mx-auto w-full justify-center'}`}>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-background">
              <img src={zentroLogo} alt="Zentro logo" className="h-10 w-10 object-contain" />
            </div>
            <div className={labelClass}>
              <div className="text-xl font-semibold text-foreground">Zentro</div>
              <div className="text-sm font-medium text-muted-foreground">Cloud workspace</div>
            </div>
          </div>
          <div
            onClick={toggleSidebarPinned}
            className={`${
              isExpanded ? 'block' : 'hidden'
            } flex h-5 w-5 cursor-pointer items-center justify-center rounded-full border border-primary opacity-0 transition-opacity duration-200 group-hover:opacity-100`}
            role="button"
            aria-label={isSidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'}
          >
            {isSidebarPinned ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
          </div>
        </div>

        <div
          onScroll={handleScroll}
          className={`sidebar-scroll ${isScrolling ? 'is-scrolling' : ''} flex-1 overflow-y-auto overflow-x-hidden ${
            isExpanded ? 'px-4' : 'px-3'
          }`}
        >
          {sections.map((section) => (
            <div key={section.title} className="mb-6">
              <div className={`mb-3 ${sectionTitleClass} ${sectionTitleState}`}>{section.title}</div>
              {!isExpanded && (
                <div className="mb-3 -mt-6 flex justify-center">
                  <span className="h-0.5 w-6 rounded-full bg-border" />
                </div>
              )}
              <nav className="flex flex-col gap-2">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `${navLinkClass({ isActive })} ${isExpanded ? '' : linkCollapsed}`
                    }
                  >
                    <span className="inline-flex h-8 w-8 items-center justify-center">
                      <item.icon className="h-5 w-5" />
                    </span>
                    <span className={labelClass}>{item.label}</span>
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}

          {user?.role === 'business_owner' && plan && (
            <div className={`pt-2 transition-opacity ${isExpanded ? 'opacity-100' : 'opacity-0'}`}>
              <div className={`rounded-xl border p-4 shadow-sm ${planStyles[plan].card}`}>
                <span
                  className={`inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wide ${planStyles[plan].badge}`}
                >
                  {planStyles[plan].badgeLabel}
                </span>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{planStyles[plan].body}</p>
                <p className="mt-2 text-sm text-muted-foreground">{planStyles[plan].sub}</p>
                <NavLink
                  to="/cpanel/my-subscription"
                  className={`mt-4 inline-flex w-full items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-white transition-colors ${planStyles[plan].button}`}
                >
                  {planStyles[plan].cta}
                </NavLink>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
