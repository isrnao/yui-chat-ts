import type { InputHTMLAttributes, ForwardedRef } from 'react';
import { forwardRef } from 'react';

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref: ForwardedRef<HTMLInputElement>) => (
    <input
      className={
        'border-2 border-ie-gray [border-style:inset] bg-white px-2 py-0.5 text-sm rounded-none shadow-none transition-colors outline-none font-yui focus:border-2 focus:border-ie-blue focus:bg-[#f8fafd] ' +
        className
      }
      ref={ref}
      {...props}
    />
  )
);

export default Input;
