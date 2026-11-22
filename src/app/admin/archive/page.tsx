import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/app/actions";
import { AdminNav } from "@/components/AdminNav";
import { Frame } from "@/components/Frame";
import { listContributionsArchive, listInquiriesArchive } from "@/db/queries";
import { isAdmin } from "@/lib/admin";
import { conditionLabel, isConditionId, predicateLabel } from "@/lib/labels";
import { formatStyleLabels } from "@/lib/reference";

export const metadata: Metadata = { title: "Архив краудсорса" };

export default async function AdminArchivePage() {
  if (!(await isAdmin())) redirect("/admin/login");

  const [contributions, inquiries] = await Promise.all([listContributionsArchive(), listInquiriesArchive()]);
  const pending = contributions.filter((row) => row.status === "pending").length;

  return (
    <Frame
      crumb={
        <span>
          <AdminNav active="archive" />
        </span>
      }
      left={
        <div className="prose">
          <p className="kicker">Зачем</p>
          <p>
            Все правки «уточнить» и обращения с <Link href="/feedback">/feedback</Link> — как в{" "}
            <code>npm run crowdsource:archive</code>, только в браузере.
          </p>
          <p>
            В очереди сейчас <strong>{pending}</strong> — принять или отклонить на{" "}
            <Link href="/admin/queue">странице очереди</Link>.
          </p>
          <form action={logout}>
            <button className="text-button" type="submit">
              Выйти
            </button>
          </form>
        </div>
      }
      center={
        <div>
          <p className="kicker">Правки · {contributions.length}</p>
          {contributions.length === 0 ? <p className="muted">Пока не было.</p> : null}
          {contributions.map((item) => (
            <article key={item.id} className="queue">
              <p className="kicker">
                {predicateLabel(item.predicate)} · <StatusBadge status={item.status} />
              </p>
              <h2>
                <a className="text-link" href={`/estates/${item.estateSlug}`}>
                  {item.estateName}
                </a>
              </h2>
              <p>{readableStatement(item.predicate, item.text)}</p>
              <p className="muted">
                {item.authorName}
                {item.contact ? ` · ${item.contact}` : ""} · {formatWhen(item.createdAt)}
              </p>
              <p>
                {item.sourceTitle}
                {item.sourcePage ? `, ${item.sourcePage}` : ""}
                {item.sourceUrl ? (
                  <>
                    {" · "}
                    <a className="text-link" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                      ссылка
                    </a>
                  </>
                ) : null}
              </p>
            </article>
          ))}

          <p className="kicker" style={{ marginTop: "2rem" }}>
            Обращения · {inquiries.length}
          </p>
          {inquiries.length === 0 ? <p className="muted">Пока не было.</p> : null}
          {inquiries.map((item) => (
            <article key={item.id} className="queue">
              <p className="kicker">
                {item.topic === "photo" ? "фото" : "общее"} · {item.emailSent ? "письмо ушло" : "без Resend"}
              </p>
              {item.estateName ? (
                <h2>
                  {item.estateSlug ? (
                    <a className="text-link" href={`/estates/${item.estateSlug}`}>
                      {item.estateName}
                    </a>
                  ) : (
                    item.estateName
                  )}
                </h2>
              ) : null}
              <p>{item.message}</p>
              {item.suggestedPhotoUrl ? (
                <p>
                  <a className="text-link" href={item.suggestedPhotoUrl} target="_blank" rel="noopener noreferrer">
                    ссылка на снимок
                  </a>
                </p>
              ) : null}
              {item.attachmentPath ? <p className="muted">Вложение: {item.attachmentFilename ?? item.attachmentPath}</p> : null}
              <p className="muted">
                {item.authorName} · {item.contact} · {formatWhen(item.createdAt)}
              </p>
              {item.pageUrl ? (
                <p className="muted">
                  <a className="text-link" href={item.pageUrl}>
                    откуда написали
                  </a>
                </p>
              ) : null}
            </article>
          ))}
        </div>
      }
      right={
        <div className="prose">
          <p className="kicker">Бэкап</p>
          <p>
            Для снимка на диск: <code>npm run crowdsource:archive</code> → <code>data/crowdsource/latest.json</code>
          </p>
        </div>
      }
    />
  );
}

function StatusBadge({ status }: { status: string }) {
  const label =
    status === "pending" ? "в очереди" : status === "accepted" ? "принята" : status === "rejected" ? "отклонена" : status;
  return <span className={status === "pending" ? undefined : "muted"}>{label}</span>;
}

function readableStatement(predicate: string, text: string) {
  if (predicate === "condition" && isConditionId(text)) return conditionLabel(text);
  if (predicate === "style") return formatStyleLabels(text);
  return text;
}

function formatWhen(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(date);
}