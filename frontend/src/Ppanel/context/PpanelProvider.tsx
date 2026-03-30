import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

export default function PpanelProvider({ children }: Props) {
  return <>{children}</>;
}
