import { suggestCatalog } from "@/db/queries";
import { loosenPlace } from "@/lib/search";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("q")?.trim().replace(/[%_]/g, "").slice(0, 80) ?? "";
  if (raw.length < 2) return Response.json({ places: [], estates: [] });
  return Response.json(await suggestCatalog(loosenPlace(raw)));
}
