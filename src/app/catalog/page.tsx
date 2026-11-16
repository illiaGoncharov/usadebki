import { redirect } from "next/navigation";

type Search = Record<string, string | string[] | undefined>;

export default async function CatalogRedirect({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value) search.set(key, value);
  }
  const query = search.toString();
  redirect(query ? `/?${query}` : "/");
}
