"use client";

import { useCallback, useEffect, useState } from "react";

type Photo = {
  id: string;
  url: string;
  author: string | null;
  license: string | null;
  sourceUrl: string | null;
  depictsEgrknNumber: string | null;
};

type Props = {
  photos: Photo[];
  parts: Array<{ egrknRegNumber: string; name: string }>;
};

function partLabel(photo: Photo, parts: Props["parts"]) {
  const part = parts.find((p) => p.egrknRegNumber === photo.depictsEgrknNumber);
  return part?.name || "часть ансамбля";
}

/**
 * Галерея фотографий частей ансамбля (флигели, церкви и т.д.)
 * Превью с листанием; по клику — лайтбокс в полном размере.
 */
export function EnsemblePartsGallery({ photos, parts }: Props) {
  const total = photos.length;
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  const step = useCallback(
    (delta: number) => {
      setIndex((current) => (current + delta + total) % total);
    },
    [total],
  );

  const close = useCallback(() => setLightbox(false), []);

  useEffect(() => {
    if (!lightbox) return;
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
  }, [lightbox, close, step]);

  if (photos.length === 0) return null;

  const photo = photos[index] ?? photos[0];
  if (!photo) return null;

  const partName = partLabel(photo, parts);

  return (
    <div className="ensemble-parts-block">
      <p className="kicker" style={{ marginTop: "1.6rem" }}>
        Другие части ансамбля
      </p>
      <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.8rem" }}>
        Фотографии отдельных частей ансамбля (флигели, церкви, парк). Нажмите на снимок, чтобы открыть в полном
        размере.
      </p>

      <figure className="photo-block">
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/no-noninteractive-element-to-interactive-role */}
        <img
          className="photo ensemble-parts-open"
          src={photo.url}
          alt={partName}
          role="button"
          tabIndex={0}
          onClick={() => setLightbox(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setLightbox(true);
            }
          }}
        />

        {total > 1 ? (
          <div className="photo-pager">
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
        ) : null}
      </figure>

      {lightbox ? (
        <div
          className="pastvu-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Снимок части ансамбля — ${partName}`}
          onClick={close}
        >
          <div className="pastvu-lightbox__panel" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="pastvu-lightbox__close text-button" onClick={close} aria-label="Закрыть">
              ✕
            </button>
            {total > 1 ? (
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
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="pastvu-lightbox__img" src={photo.url} alt={partName} />
            <div className="pastvu-lightbox__meta">
              <p className="pastvu-lightbox__title">{partName}</p>
              <p className="muted" style={{ margin: "0.25rem 0 0" }}>
                {photo.author ?? "Автор не указан"}
                {photo.license ? ` · ${photo.license}` : ""}
              </p>
            </div>
            {photo.sourceUrl ? (
              <p className="pastvu-lightbox__footer">
                <a className="text-link" href={photo.sourceUrl} target="_blank" rel="noopener noreferrer">
                  Файл на Wikimedia Commons
                </a>
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}