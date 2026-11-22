/** Cookie и header для сессионного порядка ленты (см. middleware). */
export const REEL_SEED_COOKIE = "usadebki-reel-seed";
export const REEL_SEED_HEADER = "x-usadebki-reel-seed";

export function isReelSeed(value: string | null | undefined): value is string {
  return Boolean(value && /^[a-f0-9]{16,32}$/i.test(value));
}
