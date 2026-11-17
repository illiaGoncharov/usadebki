import { fetchNearbyHistoricalPhotos, formatPastVuYear } from "@/lib/pastvu";

type Props = {
  lat: number;
  lng: number;
  estateName: string;
};

/**
 * Галерея исторических фото из PastVu.
 * Показывает превью с атрибуцией и ссылками на pastvu.com.
 * Лицензия PastVu: некоммерческое использование.
 */
export async function PastVuGallery({ lat, lng, estateName }: Props) {
  const photos = await fetchNearbyHistoricalPhotos(lat, lng, 0.5, 12);

  if (photos.length === 0) {
    return null;
  }

  return (
    <div className="pastvu-block">
      <p className="kicker" style={{ marginTop: "1.6rem" }}>
        Исторические фото (PastVu)
      </p>
      <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.8rem" }}>
        Старые снимки в радиусе 500 метров от {estateName}.
        Фото предоставлены проектом <a className="text-link" href="https://pastvu.com" target="_blank" rel="noopener noreferrer">PastVu</a>
        {" "}(некоммерческое использование).
      </p>
      <div className="pastvu-grid">
        {photos.map((photo) => (
          <a
            key={photo.cid}
            href={photo.link}
            target="_blank"
            rel="noopener noreferrer"
            className="pastvu-item"
            title={photo.title || `Фото ${formatPastVuYear(photo.year, photo.year2)}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.thumb}
              alt={photo.title || `Историческое фото ${formatPastVuYear(photo.year, photo.year2)}`}
              loading="lazy"
              className="pastvu-thumb"
            />
            <div className="pastvu-caption">
              <div className="pastvu-year">{formatPastVuYear(photo.year, photo.year2)}</div>
              {photo.author ? <div className="pastvu-author">{photo.author}</div> : null}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
