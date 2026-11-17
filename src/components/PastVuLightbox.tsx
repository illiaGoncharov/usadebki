"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPastVuYear } from "@/lib/pastvu";

export type PastVuGridItem = {
  cid: number;
  title: string | null;
  year: number | null;
  year2: number | null;
  author: string | null;
  thumb: string;
  full: string;
  link: string;
};

export function PastVuLightbox({ photos, estateName }: { photos: PastVuGridItem[]; estateName: string }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const active = photos[index];

  const close = useCallback(() => setOpen(false), []);

  const step = useCallback(
    (delta: number) => {
      setIndex((current) => (current + delta + photos.length) % photos.length);
    },
    [photos.length],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close, step]);

  if (photos.length === 0) return null;

  return (
    <>
      <div className="pastvu-grid">
        {photos.map((photo, i) => (
          <button
            key={photo.cid}
            type="button"
            className="pastvu-item"
            title={photo.title || `Фото ${formatPastVuYear(photo.year, photo.year2)}`}
            onClick={() => {
              setIndex(i);
              setOpen(true);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.thumb}
              alt={photo.title || `Историческое фото ${formatPastVuYear(photo.year, photo.year2)}`}
              loading="lazy"
              className="pastvu-thumb"
            />
            <div className="pastvu-caption">
              {photo.title ? <div className="pastvu-title">{photo.title}</div> : null}
              <div className="pastvu-year">{formatPastVuYear(photo.year, photo.year2)}</div>
            </div>
          </button>
        ))}
      </div>

      {open && active ? (
        <div
          className="pastvu-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Историческое фото — ${estateName}`}
          onClick={close}
        >
          <div className="pastvu-lightbox__panel" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="pastvu-lightbox__close text-button" onClick={close} aria-label="Закрыть">
              ✕
            </button>
            {photos.length > 1 ? (
              <PastVuLightboxPager index={index} total={photos.length} step={step} />
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="pastvu-lightbox__img" src={active.full} alt={active.title || estateName} />
            <div className="pastvu-lightbox__meta">
              {active.title ? <p className="pastvu-lightbox__title">{active.title}</p> : null}
              <p className="muted" style={{ margin: "0.25rem 0 0" }}>
                {formatPastVuYear(active.year, active.year2)}
                {active.author ? ` · ${active.author}` : ""}
              </p>
            </div>
            <p className="pastvu-lightbox__footer">
              <a className="text-link" href={active.link} target="_blank" rel="noopener noreferrer">
                Открыть на PastVu
              </a>
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

function PastVuLightboxPager({
  index,
  total,
  step,
}: {
  index: number;
  total: number;
  step: (delta: number) => void;
}) {
  return (
    <div className="pastvu-lightbox__pager">
      <button type="button" className="text-button" onClick={() => step(-1)}>
        Назад
      </button>
      <span>
        {index + 1} / {total}
      </span>
      <button type="button" className="text-button" onClick={() => step(1)}>
        Дальше
      </button>
    </div>
  );
}