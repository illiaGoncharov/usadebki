"use client";

import { useState } from "react";
import { submitContributionFromForm } from "@/app/actions";
import { CONDITIONS, PREDICATES, type PredicateId } from "@/lib/labels";
import { STYLES } from "@/lib/reference";

export function ContributeForm({
  slug,
  initialPredicate,
  error,
}: {
  slug: string;
  initialPredicate: PredicateId;
  error?: string | null;
}) {
  const [predicate, setPredicate] = useState<PredicateId>(initialPredicate);

  return (
    <form action={submitContributionFromForm}>
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

      {error ? <p className="banner">{error}</p> : null}
      <button className="text-button" type="submit">
        Отправить правку
      </button>
    </form>
  );
}