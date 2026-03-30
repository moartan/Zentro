import { createContext, useContext } from 'react';
import type { WorkspaceDetails } from '../../../shared/api/workspaces';

type Ctx = {
  details: WorkspaceDetails;
  refreshWorkspaceDetails: () => Promise<void>;
};

const WorkspaceDetailsContext = createContext<Ctx | null>(null);

export function WorkspaceDetailsProvider({
  value,
  children,
}: {
  value: Ctx;
  children: React.ReactNode;
}) {
  return <WorkspaceDetailsContext.Provider value={value}>{children}</WorkspaceDetailsContext.Provider>;
}

export function useWorkspaceDetailsContext() {
  const ctx = useContext(WorkspaceDetailsContext);
  if (!ctx) {
    throw new Error('useWorkspaceDetailsContext must be used within WorkspaceDetailsProvider');
  }
  return ctx;
}
