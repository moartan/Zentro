import { NavLink } from "react-router-dom";

type Props = {
  canCreate: boolean;
  canViewAll: boolean;
  onCreateClick: () => void;
};

function tabClass(isActive: boolean) {
  return isActive
    ? "rounded-xl bg-sky-100 px-4 py-3 text-sm font-semibold text-sky-700"
    : "rounded-xl px-4 py-3 text-sm font-semibold text-foreground hover:bg-secondary/20";
}

export default function TasksTopNav({ canCreate, canViewAll, onCreateClick }: Props) {
  return (
    <div className="max-w-full overflow-x-auto rounded-xl border border-border bg-background p-1">
      <div className="inline-flex min-w-max items-center gap-0.5">
        {canCreate ? (
          <button
            type="button"
            onClick={onCreateClick}
            className="rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold text-foreground hover:bg-secondary/20"
          >
            Create Task
          </button>
        ) : null}

        <NavLink
          to="/cpanel/tasks/my"
          className={({ isActive }) => tabClass(isActive)}
        >
          My Tasks
        </NavLink>
        {canViewAll ? (
          <NavLink
            to="/cpanel/tasks"
            end
            className={({ isActive }) => tabClass(isActive)}
          >
            All Tasks
          </NavLink>
        ) : null}
        <NavLink
          to="/cpanel/tasks/team"
          className={({ isActive }) => tabClass(isActive)}
        >
          Team Tasks
        </NavLink>
      </div>
    </div>
  );
}
