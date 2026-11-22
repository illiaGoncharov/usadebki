"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const COLLAPSED_MAX_PX = 152; // ≈ 9.5rem при 16px

/** Сворачивает длинный текст истории, чтобы карта оставалась на экране. */
export function ExpandableHistory({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [collapsible, setCollapsible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Мерим полную высоту без clamp, иначе короткий текст тоже получит градиент.
    const prev = node.style.maxHeight;
    node.style.maxHeight = "none";
    const full = node.scrollHeight;
    node.style.maxHeight = prev;
    setCollapsible(full > COLLAPSED_MAX_PX + 8);
  }, [children]);

  const collapsed = collapsible && !expanded;

  return (
    <div className="history-expand">
      <div ref={ref} className={`history-expand__body${collapsed ? " is-collapsed" : ""}`}>
        {children}
      </div>
      {collapsible ? (
        <button
          type="button"
          className="text-button history-expand__toggle"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "свернуть" : "ещё"}
        </button>
      ) : null}
    </div>
  );
}
