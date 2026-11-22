import Link from "next/link";
import { restoreStatement, revokeStatement } from "@/app/actions";
import { InstantEdit } from "@/components/InstantEdit";
import { PhotoAddForm } from "@/components/PhotoGallery";
import {
  formatWhen,
  isEditorialSourceTitle,
  predicateLabel,
  readableStatement,
} from "@/lib/admin-history-format";
import { isPredicateId } from "@/lib/labels";
import {
  isPhotoEditPredicate,
  parsePhotoEditRecord,
  photoEditActionLabel,
} from "@/lib/photo-edit-log";

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
 * Для фото — превью, откат и подмена снимка с Commons.
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
        const photoEdit = isPhotoEditPredicate(item.predicate) ? parsePhotoEditRecord(item.text) : null;

        return (
          <article key={item.id} className="queue">
            <p className="kicker">
              {predicateLabel(item.predicate)} · <StatusBadge status={item.status} />
              {editorial ? <span className="muted"> · редактор</span> : null}
              {photoEdit ? (
                <span className="muted"> · {photoEditActionLabel(photoEdit.action)}</span>
              ) : null}
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

            {photoEdit ? (
              <div className="history-photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="history-photo__thumb" src={photoEdit.url} alt="" />
                <div>
                  <p style={{ textDecoration: item.status === "revoked" ? "line-through" : undefined }}>
                    {readableStatement(item.predicate, item.text)}
                  </p>
                  {photoEdit.prev.primaryUrl &&
                  (photoEdit.action === "primary" || photoEdit.action === "add_main") ? (
                    <p className="muted" style={{ fontSize: "0.88rem", marginTop: "0.35rem" }}>
                      Было главным: другой снимок
                      {photoEdit.prev.primaryId !== photoEdit.photoId ? (
                        <>
                          {" · "}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            className="history-photo__prev"
                            src={photoEdit.prev.primaryUrl}
                            alt=""
                            title="Предыдущее главное фото"
                          />
                        </>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p style={{ textDecoration: item.status === "revoked" ? "line-through" : undefined }}>
                {readableStatement(item.predicate, item.text)}
              </p>
            )}

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
            {item.status === "accepted" && photoEdit ? (
              <div className="photo-editor-bar" style={{ marginTop: "0.55rem" }}>
                <PhotoAddForm
                  slug={item.estateSlug}
                  role={
                    photoEdit.action === "add_ensemble" ||
                    photoEdit.action === "ensemble" ||
                    photoEdit.action === "fill_ensemble"
                      ? "ensemble"
                      : "main"
                  }
                  label="+ другой снимок"
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
