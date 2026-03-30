import { NavLink, Outlet } from "react-router-dom";

const tabs = [
  { label: "Overview", path: "/cpanel/profile/overview" },
  { label: "Edit Profile", path: "/cpanel/profile/edit-profile" },
  { label: "Avatar Upload", path: "/cpanel/profile/avatar-upload" },
  { label: "Security", path: "/cpanel/profile/security" },
  { label: "Email Verification", path: "/cpanel/profile/email-verification" },
  { label: "Sessions and Logs", path: "/cpanel/profile/sessions-logs" },
];

export default function ProfilePage() {
  return (
    <div className="rounded-2xl border border-border bg-background p-6 md:p-8">
      <h1 className="text-3xl font-bold text-foreground">Profile</h1>
      <p className="mt-2 text-muted-foreground">
        Manage your account, security, and sessions.
      </p>

      <div className="mt-6 rounded-2xl border border-border bg-background p-4">
        <div className="flex flex-wrap gap-3">
          {tabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) =>
                `rounded-full px-5 py-2.5 text-sm font-semibold no-underline transition-colors ${
                  isActive
                    ? "bg-primary/20 text-primary"
                    : "text-foreground hover:text-primary"
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-background p-6">
        <Outlet />
      </div>
    </div>
  );
}
