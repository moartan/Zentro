import { useEffect, useMemo, useState } from "react";
import {
  saveUserPermissions,
  type PermissionAbility,
  type PermissionGroup,
  type PermissionMatrix,
  type PermissionRole,
} from "../../../../shared/api/users";
import { useUserDetailsContext } from "../userDetailsContext";
import { useToast } from "../../../../shared/toast/ToastProvider";

const GROUPS: Array<{ id: PermissionGroup; label: string; abilities: PermissionAbility[] }> = [
  { id: "user_management", label: "User Management", abilities: ["view", "create", "edit", "delete", "invite", "suspend"] },
  { id: "task_management", label: "Task Management", abilities: ["view", "create", "edit", "delete", "manage"] },
  { id: "team_management", label: "Team Management", abilities: ["view", "create", "edit", "delete", "manage"] },
  { id: "billing", label: "Billing", abilities: ["view", "manage"] },
  { id: "settings", label: "Settings", abilities: ["view", "manage"] },
];

const ROLE_OPTIONS: Array<{ value: PermissionRole; label: string; note: string }> = [
  { value: "business_owner", label: "Workspace Owner", note: "Full workspace access including billing and settings." },
  { value: "admin", label: "Admin", note: "Operational control across users, tasks, and teams with no ownership transfer." },
  { value: "manager", label: "Manager", note: "Can manage teams and tasks, but limited workspace-level controls." },
  { value: "member", label: "Member", note: "Task-focused access with minimal management abilities." },
  { value: "super_admin", label: "Platform Admin", note: "Platform-level control with complete access." },
];

function buildDefaultPermissions(role: PermissionRole): PermissionMatrix {
  const empty: PermissionMatrix = {
    user_management: {},
    task_management: {},
    team_management: {},
    billing: {},
    settings: {},
  };

  if (role === "super_admin" || role === "business_owner") {
    for (const group of GROUPS) {
      for (const ability of group.abilities) empty[group.id][ability] = true;
    }
    return empty;
  }

  if (role === "admin") {
    return {
      user_management: { view: true, create: true, edit: true, invite: true, suspend: true, delete: false },
      task_management: { view: true, create: true, edit: true, delete: true, manage: true },
      team_management: { view: true, create: true, edit: true, delete: false, manage: true },
      billing: { view: true, manage: false },
      settings: { view: true, manage: false },
    };
  }

  if (role === "manager") {
    return {
      user_management: { view: true, invite: true, create: false, edit: false, delete: false, suspend: false },
      task_management: { view: true, create: true, edit: true, delete: false, manage: true },
      team_management: { view: true, create: true, edit: true, delete: false, manage: false },
      billing: { view: false, manage: false },
      settings: { view: true, manage: false },
    };
  }

  return {
    user_management: { view: false, create: false, edit: false, delete: false, invite: false, suspend: false },
    task_management: { view: true, create: true, edit: true, delete: false, manage: false },
    team_management: { view: true, create: false, edit: false, delete: false, manage: false },
    billing: { view: false, manage: false },
    settings: { view: false, manage: false },
  };
}

function humanizeAbility(value: PermissionAbility) {
  if (value === "view") return "View";
  if (value === "create") return "Create";
  if (value === "edit") return "Edit";
  if (value === "delete") return "Delete";
  if (value === "invite") return "Invite";
  if (value === "suspend") return "Suspend";
  return "Manage";
}

function mapRole(userRole: string | null | undefined): PermissionRole {
  if (userRole === "super_admin") return "super_admin";
  if (userRole === "business_owner") return "business_owner";
  if (userRole === "employee") return "member";
  return "member";
}

export default function UserDetailsPermissionsTab() {
  const toast = useToast();
  const { user, refreshUserDetails } = useUserDetailsContext();

  const initialRole = useMemo(
    () => user?.permissions?.role ?? mapRole(user?.role),
    [user?.permissions?.role, user?.role],
  );
  const initialPermissions = useMemo(
    () => user?.permissions?.permissions ?? buildDefaultPermissions(initialRole),
    [initialRole, user?.permissions?.permissions],
  );

  const [selectedRole, setSelectedRole] = useState<PermissionRole>(initialRole);
  const [permissions, setPermissions] = useState<PermissionMatrix>(initialPermissions);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSelectedRole(initialRole);
    setPermissions(initialPermissions);
  }, [initialRole, initialPermissions]);

  const defaults = useMemo(
    () => buildDefaultPermissions(selectedRole),
    [selectedRole],
  );
  const roleMeta = ROLE_OPTIONS.find((item) => item.value === selectedRole);
  const isCustomOverride =
    JSON.stringify(permissions) !== JSON.stringify(defaults);

  function onRoleChange(nextRole: PermissionRole) {
    setSelectedRole(nextRole);
    setPermissions(buildDefaultPermissions(nextRole));
  }

  function onToggle(groupId: PermissionGroup, ability: PermissionAbility) {
    setPermissions((prev) => ({
      ...prev,
      [groupId]: {
        ...prev[groupId],
        [ability]: !prev[groupId][ability],
      },
    }));
  }

  function resetToRoleDefaults() {
    setPermissions(buildDefaultPermissions(selectedRole));
  }

  async function handleSavePermissions() {
    if (!user) return;

    try {
      setIsSaving(true);
      await saveUserPermissions(user.id, {
        role: selectedRole,
        permissions,
        isCustomOverride,
      });
      await refreshUserDetails();
      toast.success("Permissions saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save permissions");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-background p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Permissions</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Workspace access control for this user.
          </p>
        </div>
        <span
          className={`inline-flex rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${
            isCustomOverride
              ? "bg-amber-100 text-amber-800"
              : "bg-emerald-100 text-emerald-800"
          }`}
        >
          {isCustomOverride ? "Role + Custom Overrides" : "Role-based Only"}
        </span>
      </div>

      <div className="mt-5 rounded-2xl border border-border bg-background p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Role
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <select
            value={selectedRole}
            onChange={(event) => onRoleChange(event.target.value as PermissionRole)}
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={resetToRoleDefaults}
            className="rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary/20 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSaving}
          >
            Reset to role defaults
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {roleMeta?.note ?? "This role grants a default permission set."}
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {GROUPS.map((group) => (
          <section
            key={group.id}
            className="rounded-2xl border border-border bg-background p-4"
          >
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {group.abilities.map((ability) => {
                const checked = Boolean(permissions[group.id][ability]);
                return (
                  <label
                    key={`${group.id}-${ability}`}
                    className="flex cursor-pointer items-center justify-between rounded-xl border border-border px-3 py-2"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {humanizeAbility(ability)}
                    </span>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(group.id, ability)}
                      className="h-4 w-4 accent-primary"
                    />
                  </label>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={isSaving}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-70"
          onClick={handleSavePermissions}
        >
          {isSaving ? "Saving..." : "Save permissions"}
        </button>
      </div>
    </div>
  );
}
