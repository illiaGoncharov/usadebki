import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { acceptContribution, logout, rejectContribution } from "@/app/actions";
import { Frame } from "@/components/Frame";
import { listPending } from "@/db/queries";
import { isAdmin } from "@/lib/admin";
import { conditionLabel, isConditionId, predicateLabel } from "@/lib/labels";
import { isStyleId, styleLabel } from "@/lib/reference";

export const metadata: Metadata = { title: "Правки" };

export default async function AdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const pending = await listPending();

  return (
    <Frame
      crumb={<span>Правки</span>}
      left={
        <div className="prose">
          <p className="kicker">Очередь</p>
          <p>Принятая правка становится утверждением со ссылкой на источник. Реестровые поля при этом не меняются.</p>
          <p>Имена из правки попадают в карточку как владельцы до 1917.</p>
          <form action={logout}>
            <button className="text-button" type="submit">
              Выйти
            </button>
          </form>
        </div>
      }
      center={
        <div>
          <p className="kicker">{pending.length} ждут</p>
          {pending.length === 0 ? <p>Очередь пустая.</p> : null}
          {pending.map((item) => (
            <article key={item.id} className="queue">
              <p className="kicker">{predicateLabel(item.predicate)}</p>
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
                    <a className="text-link" href={item.sourceUrl}>
                      ссылка
                    </a>
                  </>
                ) : null}
              </p>
              <div className="queue__actions">
                <form action={acceptContribution}>
                  <input type="hidden" name="id" value={item.id} />
                  <button className="text-button" type="submit">
                    Принять
                  </button>
                </form>
                <form action={rejectContribution}>
                  <input type="hidden" name="id" value={item.id} />
                  <button className="text-button" type="submit">
                    Отклонить
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      }
      right={
        <div className="prose">
          <p className="kicker">Проверка</p>
          <p>Если источник нельзя открыть и факт ни на чём не держится, правку лучше отклонить.</p>
        </div>
      }
    />
  );
}

function readableStatement(predicate: string, text: string) {
  if (predicate === "condition" && isConditionId(text)) return conditionLabel(text);
  if (predicate === "style" && isStyleId(text)) return styleLabel(text);
  return text;
}

function formatWhen(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(date);
}
