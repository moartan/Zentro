import type { ReactNode } from "react";
import type { TaskPriority, TaskStatusFilter } from "../mockTasks";

type Props = {
  statusFilter: TaskStatusFilter;
  onStatusFilterChange: (value: TaskStatusFilter) => void;
  priorityFilter: TaskPriority | null;
  onPriorityFilterChange: (value: TaskPriority | null) => void;
  query: string;
  onQueryChange: (value: string) => void;
  hideStatusTabs?: boolean;
  hidePriorityTabs?: boolean;
  withContainer?: boolean;
  beforeFilters?: ReactNode;
};

function chip(active: boolean) {
  return active
    ? "rounded-xl bg-sky-100 px-2.5 py-1.5 text-sm font-semibold text-sky-700"
    : "rounded-xl px-2.5 py-1.5 text-sm font-semibold text-foreground hover:bg-secondary/20";
}

export default function TaskFiltersBar({
  statusFilter,
  onStatusFilterChange,
  priorityFilter,
  onPriorityFilterChange,
  query,
  onQueryChange,
  hideStatusTabs = false,
  hidePriorityTabs = false,
  withContainer = true,
  beforeFilters,
}: Props) {
  const content = (
    <div className="min-w-0 flex flex-col gap-4 xl:flex-row xl:items-center xl:gap-4">
      {beforeFilters ? <div className="xl:shrink-0">{beforeFilters}</div> : null}
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div className="inline-flex min-w-max items-center gap-1.5 whitespace-nowrap pr-1">
          {!hideStatusTabs ? (
            <>
              <button
                type="button"
                className={chip(statusFilter === "all")}
                onClick={() => onStatusFilterChange("all")}
              >
                All
              </button>
              <button
                type="button"
                className={chip(statusFilter === "todo")}
                onClick={() => onStatusFilterChange("todo")}
              >
                To Do
              </button>
              <button
                type="button"
                className={chip(statusFilter === "in_progress")}
                onClick={() => onStatusFilterChange("in_progress")}
              >
                In Progress
              </button>
              <button
                type="button"
                className={chip(statusFilter === "on_hold")}
                onClick={() => onStatusFilterChange("on_hold")}
              >
                On Hold
              </button>
              <button
                type="button"
                className={chip(statusFilter === "completed")}
                onClick={() => onStatusFilterChange("completed")}
              >
                Completed
              </button>
              <button
                type="button"
                className={chip(statusFilter === "overdue")}
                onClick={() => onStatusFilterChange("overdue")}
              >
                Overdue
              </button>
              <button
                type="button"
                className={chip(statusFilter === "canceled")}
                onClick={() => onStatusFilterChange("canceled")}
              >
                Canceled
              </button>

              <div className="mx-0.5 hidden h-6 w-px bg-border md:block" />
            </>
          ) : null}

          {!hidePriorityTabs ? (
            <>
              <button
                type="button"
                className={chip(priorityFilter === "high")}
                onClick={() =>
                  onPriorityFilterChange(
                    priorityFilter === "high" ? null : "high",
                  )
                }
              >
                High
              </button>
              <button
                type="button"
                className={chip(priorityFilter === "urgent")}
                onClick={() =>
                  onPriorityFilterChange(
                    priorityFilter === "urgent" ? null : "urgent",
                  )
                }
              >
                Urgent
              </button>
              <button
                type="button"
                className={chip(priorityFilter === "medium")}
                onClick={() =>
                  onPriorityFilterChange(
                    priorityFilter === "medium" ? null : "medium",
                  )
                }
              >
                Medium
              </button>
              <button
                type="button"
                className={chip(priorityFilter === "low")}
                onClick={() =>
                  onPriorityFilterChange(priorityFilter === "low" ? null : "low")
                }
              >
                Low
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="w-full xl:w-72 xl:shrink-0 2xl:w-80">
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search tasks..."
          className="h-10 w-full rounded-xl border border-border bg-background px-3.5 text-sm outline-none"
        />
      </div>
    </div>
  );

  if (!withContainer) {
    return content;
  }

  return (
    <div className="max-w-full overflow-hidden rounded-xl border border-border bg-background p-2.5">
      {content}
    </div>
  );
}
