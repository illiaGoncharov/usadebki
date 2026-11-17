"use client";

import type { ReactNode } from "react";

/** Полная перезагрузка — после server action иначе бывает сбой RSC (React #441). */
export function HardNavLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        window.location.assign(href);
      }}
    >
      {children}
    </a>
  );
}