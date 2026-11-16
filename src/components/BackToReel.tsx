"use client";

const MEMORY = "usadebki-reel";

export function BackToReel({ href }: { href: string }) {
  return (
    <a
      href={href}
      onClick={(event) => {
        const fromReel = (() => {
          try {
            const url = new URL(document.referrer);
            return url.origin === window.location.origin && (url.pathname === "/" || url.pathname === "/catalog");
          } catch {
            return false;
          }
        })();
        if (!sessionStorage.getItem(MEMORY) || !fromReel) return;
        event.preventDefault();
        window.history.back();
      }}
    >
      Лента
    </a>
  );
}
