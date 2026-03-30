import { createContext, useContext } from 'react';
import type { TaskRecord } from './mockTasks';
import type { ReactNode } from 'react';

type TaskDetailsContextValue = {
  task: TaskRecord;
  overdue: boolean;
  refresh: () => void;
};

const TaskDetailsContext = createContext<TaskDetailsContextValue | null>(null);

export function TaskDetailsProvider({
  value,
  children,
}: {
  value: TaskDetailsContextValue;
  children: ReactNode;
}) {
  return <TaskDetailsContext.Provider value={value}>{children}</TaskDetailsContext.Provider>;
}

export function useTaskDetailsContext() {
  const ctx = useContext(TaskDetailsContext);
  if (!ctx) {
    throw new Error('useTaskDetailsContext must be used within TaskDetailsProvider');
  }
  return ctx;
}
