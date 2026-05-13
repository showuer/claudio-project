import { ReactNode } from 'react';

export default function Stage({ children }: { children: ReactNode }) {
  return <div className="stage">{children}</div>;
}

