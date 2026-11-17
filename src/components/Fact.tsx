import type { ReactNode } from "react";

export function Fact({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="fact">
      <div className="fact__label">{label}</div>
      <div className="fact__value">{children}</div>
    </div>
  );
}
