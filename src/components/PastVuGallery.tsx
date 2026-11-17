import { fetchNearbyHistoricalPhotos, type PastVuPhoto } from "@/lib/pastvu";
import { PastVuLightbox } from "@/components/PastVuLightbox";

type Props = {
  lat: number;
  lng: number;
  estateName: string;
  /** Радиус запроса к PastVu, в метрах. */
  radiusMeters?: number;
  /** Уже загруженные снимки — чтобы не дублировать запрос с карточки */
  photos?: PastVuPhoto[];
};

function pastvuMapUrl(lat: number, lng: number) {
  return `https://pastvu.com/?g=${lat},${lng}&z=17&t=map`;
}

/**
 * Галерея исторических фото из PastVu.
 * Превью с лайтбоксом на сайте; полная версия и атрибуция — на pastvu.com.
 */
export async function PastVuGallery({ lat, lng, estateName, radiusMeters = 250, photos: preloaded }: Props) {
  const photos = preloaded ?? (await fetchNearbyHistoricalPhotos(lat, lng, radiusMeters / 1000, 12));
  const mapUrl = pastvuMapUrl(lat, lng);

  const items = photos.map((photo) => ({
    cid: photo.cid,
    title: photo.title,
    year: photo.year,
    year2: photo.year2,
    author: photo.author,
    thumb: photo.thumb,
    full: photo.full,
    link: photo.link,
  }));

  return (
    <div className="pastvu-block">
      <p className="kicker" style={{ marginTop: "1.6rem" }}>
        Как выглядело раньше —{" "}
        <a className="text-link" href={mapUrl} target="_blank" rel="noopener noreferrer">
          PastVu
        </a>
      </p>
      {photos.length > 0 ? (
        <>
          <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.8rem" }}>
            Старые снимки в радиусе {radiusMeters} м от точки объекта ({estateName}). Фото предоставлены проектом{" "}
            <a className="text-link" href="https://pastvu.com" target="_blank" rel="noopener noreferrer">
              PastVu
            </a>
            .
          </p>
          <PastVuLightbox photos={items} estateName={estateName} />
        </>
      ) : (
        <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.8rem" }}>
          Других снимков в радиусе {radiusMeters} м нет — откройте{" "}
          <a className="text-link" href={mapUrl} target="_blank" rel="noopener noreferrer">
            карту PastVu
          </a>{" "}
          вокруг точки объекта.
        </p>
      )}
    </div>
  );
}