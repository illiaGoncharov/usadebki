"use client";

import { useState } from "react";
import {
  addEstatePhoto,
  setEnsembleEstatePhoto,
  setPrimaryEstatePhoto,
} from "@/app/actions";
import { PhotoMissControl } from "@/components/PhotoMissControl";
import { PhotoRelatedLinks } from "@/components/PhotoRelatedLinks";

type Shot = {
  id: string;
  url: string;
  author: string | null;
  license: string | null;
  sourceUrl: string | null;
  isPrimary?: boolean;
};

export function PhotoGallery({
  name,
  photos,
  slug,
  editor = false,
  commonsUrl,
  wikipediaUrl,
}: {
  name: string;
  photos: Shot[];
  slug: string;
  editor?: boolean;
  commonsUrl?: string | null;
  wikipediaUrl?: string | null;
}) {
  const [index, setIndex] = useState(0);
  const [touchX, setTouchX] = useState<number | null>(null);
  const photo = photos[index] ?? photos[0];
  if (!photo) return null;
  const total = photos.length;
  const isPrimary = Boolean(photo.isPrimary) || (index === 0 && photos.every((item) => !item.isPrimary));

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
      <div className="photo-frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="photo" src={photo.url} alt={index === 0 ? name : ""} />
        <PhotoMissControl
          slug={slug}
          estateName={name}
          photoUrl={photo.url}
          editor={editor}
          photoId={photo.id}
        />
      </div>
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
      <PhotoRelatedLinks commonsUrl={commonsUrl} wikipediaUrl={wikipediaUrl} />
      {editor ? (
        <div className="photo-editor-bar">
          {isPrimary ? (
            <span className="muted">главное</span>
          ) : (
            <form action={setPrimaryEstatePhoto}>
              <input type="hidden" name="id" value={photo.id} />
              <input type="hidden" name="slug" value={slug} />
              <button type="submit" className="photo-edit-link" title="Сделать главным фото карточки">
                главное
              </button>
            </form>
          )}
          <span className="photo-editor-bar__sep" aria-hidden>
            ·
          </span>
          <form action={setEnsembleEstatePhoto}>
            <input type="hidden" name="id" value={photo.id} />
            <input type="hidden" name="slug" value={slug} />
            <button type="submit" className="photo-edit-link" title="В блок частей ансамбля">
              в ансамбль
            </button>
          </form>
          <span className="photo-editor-bar__sep" aria-hidden>
            ·
          </span>
          <PhotoAddForm slug={slug} role="main" label="+ фото" />
        </div>
      ) : null}
    </figure>
  );
}

/** Компактная форма: Commons File:… или любая https-ссылка на кадр. */
export function PhotoAddForm({
  slug,
  role,
  label,
  returnTo,
}: {
  slug: string;
  role: "main" | "ensemble";
  label: string;
  /** После добавления вернуться сюда (например в историю карточки). */
  returnTo?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="photo-edit-link" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }

  return (
    <form action={addEstatePhoto} className="photo-add-form">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="role" value={role} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <input
        name="photoUrl"
        className="field"
        required
        placeholder="https://… (Commons, PastVu или прямой URL)"
        autoFocus
      />
      <button type="submit" className="photo-edit-link">
        ок
      </button>
      <button type="button" className="photo-edit-link" style={{ color: "var(--muted)" }} onClick={() => setOpen(false)}>
        отмена
      </button>
    </form>
  );
}
