"use client";

import { useState } from "react";

type Shot = {
  id: string;
  url: string;
  author: string | null;
  license: string | null;
  sourceUrl: string | null;
};

export function PhotoGallery({ name, photos }: { name: string; photos: Shot[] }) {
  const [index, setIndex] = useState(0);
  const [touchX, setTouchX] = useState<number | null>(null);
  const photo = photos[index] ?? photos[0];
  if (!photo) return null;
  const total = photos.length;

  function step(delta: number) {
    setIndex((current) => (current + delta + total) % total);
  }

  return (
    <figure
      className="photo-block"
      tabIndex={total > 1 ? 0 : undefined}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") step(1);
        if (event.key === "ArrowLeft") step(-1);
      }}
      onTouchStart={(event) => setTouchX(event.changedTouches[0]?.clientX ?? null)}
      onTouchEnd={(event) => {
        if (touchX == null) return;
        const next = event.changedTouches[0]?.clientX ?? touchX;
        if (next - touchX > 40) step(-1);
        if (touchX - next > 40) step(1);
        setTouchX(null);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="photo" src={photo.url} alt={index === 0 ? name : ""} />
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
      <figcaption className="caption">
        {photo.author ?? "Автор не указан"}
        {photo.license ? ` · ${photo.license}` : ""}
        {photo.sourceUrl ? (
          <>
            {" · "}
            <a className="text-link" href={photo.sourceUrl} target="_blank" rel="noopener noreferrer">
              файл
            </a>
          </>
        ) : null}
      </figcaption>
    </figure>
  );
}
