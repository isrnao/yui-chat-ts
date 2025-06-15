import type { ButtonHTMLAttributes, ReactNode } from "react";

export default function Button({
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      className={
        "border-2 border-[var(--ie-gray)] [border-style:outset] bg-gradient-to-b from-[var(--ie-bg)] to-[#e4e4e4] text-[#222] px-3 py-0.5 text-sm cursor-pointer rounded-none shadow-none transition [font-family:var(--font-yui)] active:[border-style:inset] active:border-[var(--ie-gray)] active:bg-gradient-to-b active:from-[#e1e1e1] active:to-[var(--ie-bg)] disabled:text-[#a9a9a9] disabled:border-[#e2e2e2] disabled:bg-[#f6f6f6] disabled:cursor-not-allowed whitespace-nowrap leading-[1.6] min-h-[28px] " +
        className
      }
      {...props}
    >
      {children}
    </button>
  );
}
