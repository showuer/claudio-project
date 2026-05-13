import { ReactNode } from 'react';
import InteractiveDotGrid from './InteractiveDotGrid';

export default function Card({ children }: { children: ReactNode }) {
  return (
    <div className="card">
      <InteractiveDotGrid />
      {children}
    </div>
  );
}
