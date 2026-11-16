export type CatalogLink = {
  region?: string;
  gubernia?: string;
  era?: string;
  rank?: string;
  kind?: string;
  condition?: string;
  style?: string;
  distance?: string;
  photo?: boolean;
  text?: boolean;
  q?: string;
  page?: number;
  view?: "columns" | "list";
};

export function catalogHref(params: CatalogLink) {
  const search = new URLSearchParams();
  if (params.region) search.set("region", params.region);
  if (params.gubernia) search.set("gubernia", params.gubernia);
  if (params.era) search.set("era", params.era);
  if (params.rank) search.set("rank", params.rank);
  if (params.kind) search.set("kind", params.kind);
  if (params.condition) search.set("condition", params.condition);
  if (params.style) search.set("style", params.style);
  if (params.distance) search.set("distance", params.distance);
  if (params.photo) search.set("photo", "1");
  if (params.text) search.set("text", "1");
  if (params.q) search.set("q", params.q);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  if (params.view === "list") search.set("view", "list");
  const query = search.toString();
  return query ? `/?${query}` : "/";
}
