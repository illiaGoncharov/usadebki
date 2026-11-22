"use client";

import { useState } from "react";
import { STYLES, type StyleId, isStyleId } from "@/lib/reference";

export function parseStyleIds(raw: string | string[] | null | undefined): StyleId[] {
  if (!raw) return [];
  const parts = Array.isArray(raw) ? raw : raw.split(/[,;\s]+/);
  return parts
    .map((s) => s.trim())
    .filter((s): s is StyleId => isStyleId(s));
}

export function StylePicker({
  value,
  name = "text",
}: {
  value?: string | string[] | null;
  name?: string;
}) {
  const [selected, setSelected] = useState<StyleId[]>(() => parseStyleIds(value));

  const toggle = (id: StyleId) => {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  return (
    <div className="style-picker">
      <p className="fact__hint" style={{ margin: "0 0 0.4rem" }}>
        Можно выбрать несколько стилей (усадьбы и ансамбли часто достраивались в разное время):
      </p>
      <div className="style-picker__grid">
        {STYLES.map((style) => {
          const isChosen = selected.includes(style.id);
          return (
            <button
              key={style.id}
              type="button"
              className={`style-picker__chip${isChosen ? " is-selected" : ""}`}
              onClick={() => toggle(style.id)}
            >
              {style.label}
            </button>
          );
        })}
      </div>
      <input type="hidden" name={name} value={selected.join(", ")} />
      {selected.length === 0 ? (
        <p className="fact__hint" style={{ color: "var(--muted)", margin: "0 0 0.5rem" }}>
          Выберите хотя бы один стиль
        </p>
      ) : null}
    </div>
  );
}
