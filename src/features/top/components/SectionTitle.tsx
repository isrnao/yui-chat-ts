import type { ReactNode } from 'react';

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="border-y border-gray-300 bg-white px-2 py-[7px] text-[14px] font-bold leading-none text-gray-800">
      {children}
    </h2>
  );
}
