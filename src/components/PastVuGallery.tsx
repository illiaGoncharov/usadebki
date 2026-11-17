import { fetchNearbyHistoricalPhotos } from "@/lib/pastvu";
import { PastVuLightbox } from "@/components/PastVuLightbox";

type Props = {
  lat: number;
  lng: number;
  estateName: string;
};

/**
 * Галерея исторических фото из PastVu.
 * Превью с лайтбоксом на сайте; полная версия и атрибуция — на pastvu.com.
 */
export async function PastVuGallery({ lat, lng, estateName }: Props) {
  const photos = await fetchNearbyHistoricalPhotos(lat, lng, 0.25, 12);

  if (photos.length === 0) {
    return null;
  }

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
        Исторические фото (PastVu)
      </p>
      <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.8rem" }}>
        Старые снимки в радиусе 250 метров от {estateName}. Фото предоставлены проектом{" "}
        <a className="text-link" href="https://pastvu.com" target="_blank" rel="noopener noreferrer">
          PastVu
        </a>{" "}
        (некоммерческое использование).
      </p>
      <PastVuLightbox photos={items} estateName={estateName} />
    </div>
  );
}