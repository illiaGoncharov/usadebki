import Link from "next/link";

type AdminSection = "hub" | "queue" | "history" | "archive";

export function AdminNav({ active }: { active: AdminSection }) {
  const link = (section: AdminSection, href: string, label: string) => (
    <Link className={active === section ? undefined : "text-link"} href={href}>
      {label}
    </Link>
  );

  return (
    <p className="kicker" style={{ marginBottom: "1rem" }}>
      {link("hub", "/admin", "Админ")}
      {" · "}
      {link("queue", "/admin/queue", "Очередь")}
      {" · "}
      {link("history", "/admin/history", "История")}
      {" · "}
      {link("archive", "/admin/archive", "Архив")}
    </p>
  );
}