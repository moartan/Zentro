import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

export default function CpanelProvider({ children }: Props) {
  return <>{children}</>;
}
