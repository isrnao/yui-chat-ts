import type { ReactNode } from "react";

export default function Loader({ children }: { children?: ReactNode }) {
  return (
    <div className="text-gray-400 mt-8 animate-pulse text-center">
      {children || "読み込み中..."}
    </div>
  );
}
