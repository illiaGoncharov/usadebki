import Link from "next/link";
import { restoreStatement, revokeStatement } from "@/app/actions";
import { InstantEdit } from "@/components/InstantEdit";
import {
  formatWhen,
  isEditorialSourceTitle,
  predicateLabel,
  readableStatement,
} from "@/lib/admin-history-format";
import { isPredicateId } from "@/lib/labels";

export type AdminHistoryItem = {
  id: string;
  predicate: string;
  text: string;
  status: string;
  createdAt: Date | string;
  estateName: string;
  estateSlug: string;
  sourceTitle: string | null;
  sourceAuthor: string | null;
  sourceUrl: string | null;
  contributionAuthor: string | null;
};

/**
 * Список утверждений для /admin/history и /admin/estates/[slug]/history.
 * Можно отменить, восстановить или сразу поправить значение.
 */
export function AdminStatementHistoryList({
  items,
  showEstateLink = true,
  returnTo,
}: {
  items: AdminHistoryItem[];
  showEstateLink?: boolean;
  /** Куда вернуться после отмены / восстановления. */
  returnTo?: string;
}) {
  if (items.length === 0) {
    return <p className="muted">Пока правок не было.</p>;
  }

  return (
    <>
      {items.map((item) => {
        const editorial = isEditorialSourceTitle(item.sourceTitle);
        const author = item.contributionAuthor ?? item.sourceAuthor ?? "Редактор";
        return (
          <article key={item.id} className="queue">
            <p className="kicker">
              {predicateLabel(item.predicate)} · <StatusBadge status={item.status} />
              {editorial ? <span className="muted"> · редактор</span> : null}
            </p>
            {showEstateLink ? (
              <h2>
                <Link className="text-link" href={`/estates/${item.estateSlug}`}>
                  {item.estateName}
                </Link>
                {" · "}
                <Link className="text-link" href={`/admin/estates/${item.estateSlug}/history`}>
                  история карточки
                </Link>
              </h2>
            ) : null}
            <p style={{ textDecoration: item.status === "revoked" ? "line-through" : undefined }}>
              {readableStatement(item.predicate, item.text)}
            </p>
            <p className="muted">
              {author} · {formatWhen(item.createdAt)}
            </p>
            {item.sourceTitle ? (
              <p className="muted" style={{ fontSize: "0.88rem" }}>
                Источник: {item.sourceTitle}
                {item.sourceUrl ? (
                  <>
                    {" · "}
                    <a className="text-link" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                      ссылка
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}
            <div className="queue__actions" style={{ marginTop: "0.6rem", flexWrap: "wrap", gap: "0.8rem" }}>
              {item.status === "accepted" ? (
                <form action={revokeStatement}>
                  <input type="hidden" name="id" value={item.id} />
                  {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
                  <button className="text-button" type="submit" title="Отозвать ошибочную правку">
                    Отменить
                  </button>
                </form>
              ) : (
                <form action={restoreStatement}>
                  <input type="hidden" name="id" value={item.id} />
                  {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
                  <button className="text-button" type="submit" title="Вернуть правку обратно в показ">
                    Восстановить
                  </button>
                </form>
              )}
              <Link className="text-link" href={`/estates/${item.estateSlug}`} style={{ fontSize: "0.85em" }}>
                к карточке
              </Link>
            </div>
            {item.status === "accepted" && isPredicateId(item.predicate) ? (
              <div style={{ marginTop: "0.55rem" }}>
                <InstantEdit
                  slug={item.estateSlug}
                  predicate={item.predicate}
                  currentValue={item.text}
                  label="править текст"
                  returnTo={returnTo}
                />
              </div>
            ) : null}
          </article>
        );
      })}
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "accepted") return <span style={{ color: "#2e6930" }}>активно</span>;
  if (status === "revoked")
    return (
      <span className="muted" style={{ color: "#a13c3c" }}>
        отозвано
      </span>
    );
  return <span className="muted">{status}</span>;
}
