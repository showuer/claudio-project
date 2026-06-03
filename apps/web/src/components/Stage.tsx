import type { CSSProperties, ReactNode } from 'react';

export default function Stage({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div className="stage" style={style}>{children}</div>;
}
