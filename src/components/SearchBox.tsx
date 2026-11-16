"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { catalogHref, type CatalogLink } from "@/lib/catalog-url";

type SuggestEstate = { slug: string; title: string; note: string };
type Payload = { places: string[]; estates: SuggestEstate[] };
type Item = { href: string; title: string; note: string };

export function SearchBox({ filters }: { filters: CatalogLink }) {
  const listId = useId();
  const [query, setQuery] = useState(filters.q ?? "");
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<Payload>({ places: [], estates: [] });
  const [active, setActive] = useState(-1);
  const items = useMemo(() => buildItems(payload, filters), [filters, payload]);

  useEffect(() => {
    setQuery(filters.q ?? "");
  }, [filters.q]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      setPayload({ places: [], estates: [] });
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/suggest?q=${encodeURIComponent(text)}`, { signal: controller.signal })
        .then((response) => (response.ok ? (response.json() as Promise<Payload>) : { places: [], estates: [] }))
        .then((next) => {
          setPayload(next);
          setActive(-1);
          setOpen(next.places.length + next.estates.length > 0);
        })
        .catch(() => {
          if (!controller.signal.aborted) setPayload({ places: [], estates: [] });
        });
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  return (
    <>
      <input
        name="q"
        value={query}
        placeholder="Имя или место"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => {
          if (items.length > 0) setOpen(true);
        }}
        onKeyDown={(event) => {
          if (!open || items.length === 0) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((current) => (current + 1) % items.length);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((current) => (current <= 0 ? items.length - 1 : current - 1));
          } else if (event.key === "Escape") {
            setOpen(false);
          } else if (event.key === "Enter" && active >= 0) {
            event.preventDefault();
            window.location.href = items[active].href;
          }
        }}
      />
      {open && items.length > 0 ? (
        <div className="suggest" id={listId} role="listbox">
          {items.map((item, index) => (
            <a
              key={item.href}
              href={item.href}
              role="option"
              aria-selected={index === active}
              className={index === active ? "is-active" : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
            >
              <span>{item.title}</span>
              <em>{item.note}</em>
            </a>
          ))}
        </div>
      ) : null}
    </>
  );
}

function buildItems(payload: Payload, filters: CatalogLink): Item[] {
  return [
    ...payload.places.map((place) => ({
      href: catalogHref({ ...filters, q: place, page: undefined }),
      title: place,
      note: "место",
    })),
    ...payload.estates.map((estate) => ({
      href: `/estates/${estate.slug}`,
      title: estate.title,
      note: estate.note,
    })),
  ];
}
