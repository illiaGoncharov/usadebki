import type { Metadata } from "next";
import { EstateMap } from "@/components/EstateMap";
import { Frame } from "@/components/Frame";
import { RegistryNote } from "@/components/RegistryNote";
import { mapOverview } from "@/db/queries";
import { cartoKey } from "@/lib/carto";

export const metadata: Metadata = { title: "Карта" };

export default async function MapPage() {
  const { points, total, mapped } = await mapOverview();

  return (
    <Frame
      crumb={<a href="/map">Карта</a>}
      centerFlush
      left={
        <div className="prose">
          <p className="kicker">Карта</p>
          <p>Точка стоит там, где её дал реестр или Викиданные. Клик открывает карточку.</p>
          <p>
            На карте {mapped} из {total}. Остальные пока без координат.
          </p>
          <p>
            <a className="text-link" href="/">
              К ленте
            </a>
          </p>
          <RegistryNote />
        </div>
      }
      center={points.length > 0 ? <EstateMap points={points} cartoKey={cartoKey()} /> : <div className="photo-empty">Точек пока нет</div>}
      right={
        <div className="prose">
          <p className="kicker">Подложка</p>
          <p>Светлая карта © OpenStreetMap contributors, © CARTO. Это второй режим: сначала читается карточка, потом место.</p>
        </div>
      }
    />
  );
}
