import type { ComponentPropsWithRef } from 'react';

// React 19 では ref を通常の prop として受け取れるため forwardRef は不要
// (https://react.dev/reference/react/forwardRef)。型も ComponentPropsWithRef<'input'> に
// 揃えることで ref の型が props 側と一貫する。
export default function Input({ className = '', ...props }: ComponentPropsWithRef<'input'>) {
  return (
    <input
      className={
        'border-2 border-ie-gray [border-style:inset] bg-white px-2 py-0.5 text-sm rounded-none shadow-none transition-colors outline-none font-yui focus:border-2 focus:border-ie-blue focus:bg-[#f8fafd] ' +
        className
      }
      {...props}
    />
  );
}
