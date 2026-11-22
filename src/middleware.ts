import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { REEL_SEED_COOKIE, REEL_SEED_HEADER, isReelSeed } from "@/lib/reel-seed";

function newSeed() {
  return crypto.randomUUID().replace(/-/g, "");
}

/**
 * На первый заход кладём seed в cookie — лента перемешивает полные карточки,
 * но внутри сессии порядок стабилен (пагинация не прыгает).
 */
export function middleware(request: NextRequest) {
  let seed = request.cookies.get(REEL_SEED_COOKIE)?.value;
  if (!isReelSeed(seed)) {
    seed = newSeed();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REEL_SEED_HEADER, seed);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  if (request.cookies.get(REEL_SEED_COOKIE)?.value !== seed) {
    response.cookies.set(REEL_SEED_COOKIE, seed, {
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
      sameSite: "lax",
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
