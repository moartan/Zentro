import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

export default function PpanelUiProvider({ children }: Props) {
  return <>{children}</>;
}
