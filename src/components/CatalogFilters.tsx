"use client";

import { useState } from "react";
import type { RegionRow } from "@/db/queries";
import { CONDITIONS } from "@/lib/labels";
import type { CatalogLink } from "@/lib/catalog-url";
import {
  DISTANCES,
  ERAS,
  GUBERNIAS,
  KINDS,
  RANKS,
  STYLES,
} from "@/lib/reference";

export function CatalogFilters({
  regions,
  value,
}: {
  regions: RegionRow[];
  value: CatalogLink;
}) {
  const counts = new Map(regions.map((item) => [item.regionId, item.count]));
  const byName = [...regions].sort((a, b) => a.regionName.localeCompare(b.regionName, "ru"));
  const gubernias = [...GUBERNIAS].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const picked = [
    regions.find((item) => item.regionId === value.region)?.regionName,
    gubernias.find((item) => item.id === value.gubernia)?.name,
    value.photo ? "с фото" : null,
    value.text ? "с историей" : null,
    ERAS.find((item) => item.id === value.era)?.label,
    RANKS.find((item) => item.id === value.rank)?.label,
    KINDS.find((item) => item.id === value.kind)?.label,
    value.condition === "poor" ? "плохое состояние" : CONDITIONS.find((item) => item.id === value.condition)?.label,
    value.style === "unknown" ? "стиль не указан" : STYLES.find((item) => item.id === value.style)?.label,
    DISTANCES.find((item) => item.id === value.distance)?.label,
  ].filter((item): item is string => Boolean(item));
  const [open, setOpen] = useState(picked.length > 0);

  return (
    <form
      className="filter-bar"
      action="/"
      onSubmit={(event) => {
        const form = event.currentTarget;
        for (const element of form.elements) {
          if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) {
            if (!element.value && element.type !== "submit") element.disabled = true;
          }
        }
      }}
    >
      {value.q ? <input type="hidden" name="q" value={value.q} /> : null}
      {value.photo ? <input type="hidden" name="photo" value="1" /> : null}
      {value.text ? <input type="hidden" name="text" value="1" /> : null}
      <div className="filter-toggle">
        <button type="button" className="text-button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
          {open ? "Скрыть фильтры" : "Фильтры"}
        </button>
        {!open && picked.length > 0 ? <span>{picked.join(" · ")}</span> : null}
      </div>
      {open ? (
      <>
      <div className="filter-grid">
        <label className="filter-field">
          <span>Область</span>
          <select name="region" defaultValue={value.region ?? ""}>
            <option value="">Все</option>
            {byName.map((item) => (
              <option key={item.regionId} value={item.regionId}>
                {item.regionName} · {item.count}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Губерния</span>
          <select name="gubernia" defaultValue={value.gubernia ?? ""}>
            <option value="">Все</option>
            {gubernias.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.regions.reduce((sum, id) => sum + (counts.get(id) ?? 0), 0)}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Век</span>
          <select name="era" defaultValue={value.era ?? ""}>
            <option value="">Все</option>
            {ERAS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Охрана</span>
          <select name="rank" defaultValue={value.rank ?? ""}>
            <option value="">Все</option>
            {RANKS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Вид</span>
          <select name="kind" defaultValue={value.kind ?? ""}>
            <option value="">Все</option>
            {KINDS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Состояние</span>
          <select name="condition" defaultValue={value.condition ?? ""}>
            <option value="">Все</option>
            <option value="poor">плохое: руины, запустение, утрата</option>
            {CONDITIONS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>Стиль</span>
          <select name="style" defaultValue={value.style ?? ""}>
            <option value="">Все</option>
            <option value="unknown">не указан</option>
            {STYLES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>До города</span>
          <select name="distance" defaultValue={value.distance ?? ""}>
            <option value="">Все</option>
            {DISTANCES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="filter-actions">
        <button className="text-button" type="submit">
          Показать
        </button>
        <a className="text-link" href="/">
          Сбросить
        </a>
      </div>
      </>
      ) : null}
    </form>
  );
}
