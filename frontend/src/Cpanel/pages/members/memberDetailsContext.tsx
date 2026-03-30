import { createContext, useContext } from 'react';
import { getMemberDetails } from '../../../shared/api/members';

export type MemberDetailsPayload = Awaited<ReturnType<typeof getMemberDetails>>;

type Ctx = {
  payload: MemberDetailsPayload;
  member: MemberDetailsPayload['member'];
  refreshMemberDetails: () => Promise<void>;
};

const MemberDetailsContext = createContext<Ctx | null>(null);

export function MemberDetailsProvider({
  value,
  children,
}: {
  value: Ctx;
  children: React.ReactNode;
}) {
  return <MemberDetailsContext.Provider value={value}>{children}</MemberDetailsContext.Provider>;
}

export function useMemberDetailsContext() {
  const ctx = useContext(MemberDetailsContext);
  if (!ctx) {
    throw new Error('useMemberDetailsContext must be used within MemberDetailsProvider');
  }
  return ctx;
}
