import { formatPastVuYear, type PastVuPhoto } from "@/lib/pastvu";

/**
 * Временная шапка, если нет подтверждённого снимка Commons — ближайшее фото PastVu с пояснением.
 */
export function PastVuHeroPlaceholder({ photo, estateName }: { photo: PastVuPhoto; estateName: string }) {
  return (
    <figure className="photo-block pastvu-hero-fallback">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="photo" src={photo.full} alt={photo.title || estateName} />
      <p className="pastvu-hero-fallback__notice">
        Подтверждённого снимка из открытых источников пока нет. Здесь показано ближайшее к объекту историческое
        фото с PastVu — оно может относиться к соседним зданиям или улице.
      </p>
      <figcaption className="caption">
        {photo.title ? `${photo.title} · ` : ""}
        PastVu · {formatPastVuYear(photo.year, photo.year2)}
        {photo.author ? ` · ${photo.author}` : ""}
        {" · "}
        <a className="text-link" href={photo.link} target="_blank" rel="noopener noreferrer">
          открыть на PastVu
        </a>
      </figcaption>
    </figure>
  );
}