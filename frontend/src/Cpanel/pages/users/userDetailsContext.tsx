import { createContext, useContext } from 'react';
import { getUserDetails } from '../../../shared/api/users';

export type UserDetailsPayload = Awaited<ReturnType<typeof getUserDetails>>;

type Ctx = {
  payload: UserDetailsPayload;
  user: UserDetailsPayload['user'];
  refreshUserDetails: () => Promise<void>;
};

const UserDetailsContext = createContext<Ctx | null>(null);

export function UserDetailsProvider({
  value,
  children,
}: {
  value: Ctx;
  children: React.ReactNode;
}) {
  return <UserDetailsContext.Provider value={value}>{children}</UserDetailsContext.Provider>;
}

export function useUserDetailsContext() {
  const ctx = useContext(UserDetailsContext);
  if (!ctx) {
    throw new Error('useUserDetailsContext must be used within UserDetailsProvider');
  }
  return ctx;
}
