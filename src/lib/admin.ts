import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "usadebki_admin";

export function adminToken() {
  const password = process.env.ADMIN_PASSWORD ?? "";
  const secret = process.env.ADMIN_SECRET || password || "usadebki";
  return createHmac("sha256", secret).update(`admin:${password}`).digest("hex");
}

export async function isAdmin() {
  const jar = await cookies();
  const value = jar.get(COOKIE)?.value;
  const expected = adminToken();
  if (!value || value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

export const adminCookie = {
  name: COOKIE,
  options: {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  },
};
