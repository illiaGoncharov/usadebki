"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export type MapPoint = {
  slug: string;
  name: string;
  regionName: string;
  lat: number;
  lng: number;
};

type MapEvent = { features?: { properties?: { slug?: string } }[] };

type MapHandle = {
  addControl: (control: unknown, position?: string) => void;
  on: (event: "load", handler: () => void) => void;
  addSource: (id: string, source: unknown) => void;
  addLayer: (layer: unknown) => void;
  onLayer: (event: string, layer: string, handler: (event: MapEvent) => void) => void;
  getCanvas: () => HTMLCanvasElement;
  fitBounds: (bounds: { extend: (lngLat: [number, number]) => void }, options?: Record<string, unknown>) => void;
  remove: () => void;
};

type MapLibre = {
  Map: new (options: Record<string, unknown>) => {
    addControl: (control: unknown, position?: string) => void;
    on: (event: string, layerOrHandler: string | (() => void), handler?: (event: MapEvent) => void) => void;
    addSource: (id: string, source: unknown) => void;
    addLayer: (layer: unknown) => void;
    getCanvas: () => HTMLCanvasElement;
    fitBounds: (bounds: unknown, options?: Record<string, unknown>) => void;
    remove: () => void;
  };
  NavigationControl: new (options?: { showCompass?: boolean }) => unknown;
  LngLatBounds: new () => { extend: (lngLat: [number, number]) => void };
};

const CSS = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css";
const JS = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js";

declare global {
  interface Window {
    maplibregl?: MapLibre;
  }
}

function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  return new Promise<MapLibre>((resolve, reject) => {
    if (!document.querySelector(`link[href="${CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = CSS;
      document.head.appendChild(link);
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${JS}"]`);
    const finish = () => (window.maplibregl ? resolve(window.maplibregl) : reject(new Error("карта не загрузилась")));
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = JS;
    script.async = true;
    script.onload = finish;
    script.onerror = () => reject(new Error("не удалось загрузить карту"));
    document.body.appendChild(script);
  });
}

export function EstateMap({
  points,
  place = false,
  cartoKey,
}: {
  points: MapPoint[];
  place?: boolean;
  cartoKey: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const node = ref.current;
    if (!node || !cartoKey) return;
    let map: MapHandle | null = null;
    let cancelled = false;

    loadMapLibre()
      .then((maplibre) => {
        if (cancelled || !ref.current) return;
        const here = points[0];
        const created = new maplibre.Map({
          container: ref.current,
          center: place && here ? [here.lng, here.lat] : [37.6, 55.75],
          zoom: place ? 13 : 5,
          scrollZoom: !place,
          dragRotate: false,
          style: {
            version: 8,
            sources: {
              carto: {
                type: "raster",
                tiles: [`https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?key=${cartoKey}`],
                tileSize: 256,
                attribution: "© OpenStreetMap contributors © CARTO",
              },
            },
            layers: [{ id: "carto", type: "raster", source: "carto" }],
          },
        });
        created.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        // Сразу держим ссылку: иначе размонтирование между созданием карты и концом загрузки её не уберёт.
        map = {
          addControl: created.addControl.bind(created),
          on: (event, handler) => created.on(event, handler),
          addSource: created.addSource.bind(created),
          addLayer: created.addLayer.bind(created),
          onLayer: (event, layer, handler) => created.on(event, layer, handler),
          getCanvas: created.getCanvas.bind(created),
          fitBounds: created.fitBounds.bind(created),
          remove: created.remove.bind(created),
        };
        created.on("load", () => {
          created.addSource("estates", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: points.map((point) => ({
                type: "Feature",
                properties: { slug: point.slug, name: point.name },
                geometry: { type: "Point", coordinates: [point.lng, point.lat] },
              })),
            },
          });
          created.addLayer({
            id: "estates",
            type: "circle",
            source: "estates",
            paint: {
              "circle-radius": 4,
              "circle-color": "#161616",
              "circle-stroke-width": 1,
              "circle-stroke-color": "#f6f4ef",
            },
          });
          if (!place) {
            created.on("click", "estates", (event) => {
              const slug = event.features?.[0]?.properties?.slug;
              if (typeof slug === "string") router.push(`/estates/${slug}`);
            });
          }
          if (!place) {
            created.on("mouseenter", "estates", () => {
              created.getCanvas().style.cursor = "pointer";
            });
            created.on("mouseleave", "estates", () => {
              created.getCanvas().style.cursor = "";
            });
          }
          if (!place && points.length > 0) {
            const bounds = new maplibre.LngLatBounds();
            for (const point of points) bounds.extend([point.lng, point.lat]);
            created.fitBounds(bounds, { padding: 36, maxZoom: 8 });
          }
        });
      })
      .catch((error: unknown) => {
        console.error(error);
      });

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [cartoKey, place, points, router]);

  if (!cartoKey) {
    return <div className={place ? "photo-empty card-map" : "photo-empty"}>Ключ карты не задан на сервере.</div>;
  }

  return <div ref={ref} className={place ? "map-canvas card-map" : "map-canvas"} />;
}
