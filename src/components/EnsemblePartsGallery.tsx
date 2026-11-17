"use client";

import { useState } from "react";

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

/**
 * Галерея фотографий частей ансамбля (флигели, церкви и т.д.)
 * Показывается отдельно от основных фото с указанием, что это часть ансамбля.
 */
export function EnsemblePartsGallery({ photos, parts }: Props) {
  const [index, setIndex] = useState(0);
  
  if (photos.length === 0) return null;

  const photo = photos[index] ?? photos[0];
  if (!photo) return null;

  // Находим название части по ЕГРОКН номеру
  const part = parts.find((p) => p.egrknRegNumber === photo.depictsEgrknNumber);
  const partName = part?.name || "часть ансамбля";

  const total = photos.length;

  function step(delta: number) {
    setIndex((current) => (current + delta + total) % total);
  }

  return (
    <div className="ensemble-parts-block">
      <p className="kicker" style={{ marginTop: "1.6rem" }}>
        Другие части ансамбля
      </p>
      <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.8rem" }}>
        Фотографии отдельных частей ансамбля (флигели, церкви, парк).
      </p>
      
      <figure className="photo-block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="photo" src={photo.url} alt={partName} />
        
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
          {partName}
          {" · "}
          {photo.author ?? "Автор не указан"}
          {photo.license ? ` · ${photo.license}` : ""}
          {photo.sourceUrl ? (
            <>
              {" · "}
              <a className="text-link" href={photo.sourceUrl}>
                файл
              </a>
            </>
          ) : null}
        </figcaption>
      </figure>
    </div>
  );
}
