/** Безопасный returnTo только внутри /admin/… */
export function safeAdminReturn(path: string | null | undefined, fallback: string) {
  if (!path) return fallback;
  if (!path.startsWith("/admin/")) return fallback;
  if (path.startsWith("//")) return fallback;
  return path;
}
