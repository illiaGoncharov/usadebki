"use client";

import { useActionState, useState } from "react";
import { submitContribution, type FormState } from "@/app/actions";
import { SupportThanksBanner } from "@/components/SupportThanksBanner";
import { CONDITIONS, PREDICATES, type PredicateId } from "@/lib/labels";
import { STYLES } from "@/lib/reference";

const initial: FormState = { error: null };

export function ContributeForm({
  slug,
  initialPredicate,
}: {
  slug: string;
  initialPredicate: PredicateId;
}) {
  const [state, action, pending] = useActionState(submitContribution, initial);
  const [predicate, setPredicate] = useState<PredicateId>(initialPredicate);

  if (state.sent) {
    const estateHref = state.estateSlug ? `/estates/${state.estateSlug}` : "/";
    return (
      <div>
        <SupportThanksBanner
          detail={
            state.published
              ? "Правка сразу опубликована на карточке (режим редактора)."
              : state.emailed
                ? "Правка в очереди на модерацию. Редакция получила письмо."
                : "Правка сохранена в очереди. Письмо редактору не ушло — на сервере нет CONTACT_EMAIL/RESEND_API_KEY или Resend вернул ошибку."
          }
        />
        <p className="muted" style={{ marginTop: "1rem" }}>
          <a className="text-link" href={estateHref}>
            Вернуться к карточке
          </a>
        </p>
      </div>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="slug" value={slug} />
      <label className="kicker" htmlFor="predicate">
        Что уточняете
      </label>
      <select
        id="predicate"
        name="predicate"
        className="field"
        value={predicate}
        onChange={(event) => setPredicate(event.target.value as PredicateId)}
      >
        {PREDICATES.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>

      {predicate === "condition" ? (
        <select name="text" className="field" defaultValue="ruins">
          {CONDITIONS.filter((item) => item.id !== "unknown").map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      ) : predicate === "style" ? (
        <select name="text" className="field" defaultValue="classical">
          {STYLES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      ) : (
        <textarea
          name="text"
          className="field"
          required
          placeholder={
            predicate === "owners"
              ? "Каждое имя с новой строки"
              : predicate === "year"
                ? "Например: построена в 1790-е, перестроена в 1840"
                : "Короткая справка"
          }
        />
      )}

      <label className="kicker" htmlFor="sourceTitle">
        Источник
      </label>
      <input id="sourceTitle" name="sourceTitle" className="field" required placeholder="Книга, статья или архив" />
      <input name="sourcePage" className="field" placeholder="Страница, если есть" />
      <input name="sourceUrl" className="field" placeholder="Ссылка, если есть" />
      <input name="authorName" className="field" required placeholder="Ваше имя" />
      <input
        name="contact"
        className="field"
        type="email"
        placeholder="Почта — пришлём «Спасибо» и ответ"
      />

      {state.error ? <p className="banner">{state.error}</p> : null}
      <button className="text-button" type="submit" disabled={pending}>
        {pending ? "Отправляем" : "Отправить правку"}
      </button>
    </form>
  );
}
