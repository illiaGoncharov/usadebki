import Link from "next/link";
import type { ReactNode } from "react";
import { isAdmin } from "@/lib/admin";

export async function Frame({
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
  const admin = await isAdmin();

  return (
    <div className="shell">
      <div className="shell__head">
        <Link href="/">Усадебки</Link>
      </div>
      <div className="shell__head shell__crumb">{crumb}</div>
      <div className="shell__head shell__head-right">
        <Link href="/about">О проекте</Link>
        {" · "}
        <Link href="/feedback">Написать нам</Link>
        {admin ? (
          <>
            {" · "}
            <Link href="/admin">Админ-панель</Link>
          </>
        ) : null}
      </div>
      <div className="shell__col">{left}</div>
      <div className={`shell__col${centerFlush ? " shell__col--flush" : ""}`}>{center}</div>
      <div className="shell__col">{right}</div>
    </div>
  );
}
