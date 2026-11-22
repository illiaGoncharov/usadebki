"use client";

import { useEffect, useMemo, useState } from "react";
import { PhotoMissControl } from "@/components/PhotoMissControl";
import { PhotoRelatedLinks } from "@/components/PhotoRelatedLinks";
import { formatPastVuYear, type PastVuPhoto } from "@/lib/pastvu";

type Props = {
  photo: PastVuPhoto;
  /** Запасные кадры PastVu, если текущий мимо. */
  alternatives?: PastVuPhoto[];
  estateName: string;
  slug: string;
  editor?: boolean;
  wikipediaTitle?: string | null;
  wikipediaUrl?: string | null;
  wikidataQid?: string | null;
};

function skipKey(slug: string) {
  return `usadebki-pastvu-skip:${slug}`;
}

function readSkipped(slug: string): number[] {
  try {
    const raw = sessionStorage.getItem(skipKey(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is number => typeof item === "number");
  } catch {
    return [];
  }
}

function writeSkipped(slug: string, cids: number[]) {
  try {
    sessionStorage.setItem(skipKey(slug), JSON.stringify(cids));
  } catch {
    // private mode — просто не запоминаем
  }
}

/**
 * Временная шапка без Commons: ближайшее PastVu.
 * «Мимо» у админа листает запасные кадры; у пользователя — форма жалобы.
 */
export function PastVuHeroPlaceholder({
  photo,
  alternatives = [],
  estateName,
  slug,
  editor = false,
  wikipediaTitle,
  wikipediaUrl,
  wikidataQid,
}: Props) {
  const pool = useMemo(() => {
    const map = new Map<number, PastVuPhoto>();
    map.set(photo.cid, photo);
    for (const item of alternatives) map.set(item.cid, item);
    return [...map.values()];
  }, [photo, alternatives]);

  const [skipped, setSkipped] = useState<number[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSkipped(readSkipped(slug));
    setReady(true);
  }, [slug]);

  const visible = pool.filter((item) => !skipped.includes(item.cid));
  const current = visible[0] ?? null;

  function skipCurrent() {
    if (!current) return;
    const next = [...skipped, current.cid];
    setSkipped(next);
    writeSkipped(slug, next);
  }

  if (ready && !current) {
    return (
      <>
        <div className="photo-empty">Подтверждённого снимка пока нет</div>
        <p className="caption">
          Все предложенные кадры PastVu отмечены как мимо. Ниже могут остаться другие исторические снимки.
        </p>
      </>
    );
  }

  const shown = current ?? photo;

  return (
    <figure className="photo-block pastvu-hero-fallback">
      <div className="photo-frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="photo" src={shown.full} alt={shown.title || estateName} />
        <PhotoMissControl
          slug={slug}
          estateName={estateName}
          photoUrl={shown.full}
          editor={editor}
          onAdminSkip={editor ? skipCurrent : undefined}
        />
      </div>
      <p className="pastvu-hero-fallback__notice">
        Подтверждённого снимка из открытых источников пока нет. Здесь показано ближайшее к объекту историческое
        фото с PastVu — оно может относиться к соседним зданиям или улице.
      </p>
      <figcaption className="caption">
        {shown.title ? `${shown.title} · ` : ""}
        PastVu · {formatPastVuYear(shown.year, shown.year2)}
        {shown.author ? ` · ${shown.author}` : ""}
        {" · "}
        <a className="text-link" href={shown.link} target="_blank" rel="noopener noreferrer">
          открыть на PastVu
        </a>
      </figcaption>
      <PhotoRelatedLinks
        wikipediaTitle={wikipediaTitle}
        wikipediaUrl={wikipediaUrl}
        wikidataQid={wikidataQid}
      />
    </figure>
  );
}
