"use client";

import { useActionState } from "react";
import { submitInquiry, type FormState } from "@/app/actions";
import { SupportThanksBanner } from "@/components/SupportThanksBanner";

const initial: FormState = { error: null };

export function FeedbackForm({
  topic,
  estateSlug,
  estateName,
  pageUrl,
}: {
  topic: "general" | "photo";
  estateSlug?: string;
  estateName?: string;
  pageUrl?: string;
}) {
  const [state, action, pending] = useActionState(submitInquiry, initial);

  if (state.sent) {
    return (
      <SupportThanksBanner
        detail={
          state.emailed
            ? "Сообщение принято и отправлено на почту редакции."
            : "Сообщение сохранено в базе, но письмо не ушло — на сервере нет CONTACT_EMAIL/RESEND_API_KEY или Resend вернул ошибку (см. лог терминала)."
        }
      />
    );
  }

  return (
    <form action={action} className="prose">
      <input type="hidden" name="topic" value={topic} />
      {estateSlug ? <input type="hidden" name="estateSlug" value={estateSlug} /> : null}
      {estateName ? <input type="hidden" name="estateName" value={estateName} /> : null}
      {pageUrl ? <input type="hidden" name="pageUrl" value={pageUrl} /> : null}

      <label className="kicker" htmlFor="message">
        {topic === "photo" ? "Что не так со снимком" : "Сообщение"}
      </label>
      <textarea
        id="message"
        name="message"
        className="field"
        required
        minLength={10}
        maxLength={4000}
        placeholder={
          topic === "photo"
            ? "Например: в шапке сад, а не дом Толстого; есть снимок на Commons …"
            : "Вопрос, идея или замечание по каталогу"
        }
      />

      {topic === "photo" ? (
        <>
          <label className="kicker" htmlFor="suggestedPhotoUrl">
            Ссылка на верный снимок
          </label>
          <input
            id="suggestedPhotoUrl"
            name="suggestedPhotoUrl"
            className="field"
            type="url"
            placeholder="https://commons.wikimedia.org/wiki/File:…"
          />

          <label className="kicker" htmlFor="attachment">
            Или приложите файл
          </label>
          <input
            id="attachment"
            name="attachment"
            className="field"
            type="file"
            accept="image/jpeg,image/png,image/webp"
          />
          <p className="muted">JPEG, PNG или WebP, до 4 МБ. Можно и ссылку, и файл.</p>
        </>
      ) : null}

      <label className="kicker" htmlFor="authorName">
        Как к вам обращаться
      </label>
      <input id="authorName" name="authorName" className="field" required maxLength={120} />

      <label className="kicker" htmlFor="contact">
        Почта для ответа
      </label>
      <input
        id="contact"
        name="contact"
        className="field"
        type="email"
        required
        placeholder="you@example.com"
      />

      {state.error ? <p className="banner">{state.error}</p> : null}
      <button className="text-button" type="submit" disabled={pending}>
        {pending ? "Отправляем…" : "Отправить"}
      </button>
    </form>
  );
}