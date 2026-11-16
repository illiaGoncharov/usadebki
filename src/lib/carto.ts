import "server-only";

/** Ключ CARTO читается при запросе. В клиентский бандл его не кладём при сборке. */
export function cartoKey() {
  return process.env.CARTO_KEY?.trim() ?? "";
}
