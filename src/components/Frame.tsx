import Link from "next/link";
import type { ReactNode } from "react";

export function Frame({
  crumb,
  left,
  center,
  right,
  centerFlush = false,
}: {
  crumb: ReactNode;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  centerFlush?: boolean;
}) {
  return (
    <div className="shell">
      <div className="shell__head">
        <Link href="/">Усадебки</Link>
      </div>
      <div className="shell__head shell__crumb">{crumb}</div>
      <div className="shell__head shell__head-right">
        <Link href="/about">О проекте</Link>
      </div>
      <div className="shell__col">{left}</div>
      <div className={`shell__col${centerFlush ? " shell__col--flush" : ""}`}>{center}</div>
      <div className="shell__col">{right}</div>
    </div>
  );
}
