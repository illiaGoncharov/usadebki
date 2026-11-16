import type { ReactNode } from "react";

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fact">
      <div className="fact__label">{label}</div>
      <div>{children}</div>
    </div>
  );
}
