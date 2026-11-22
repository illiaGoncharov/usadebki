"use client";

import { hideEstatePhoto } from "@/app/actions";

type Props = {
  slug: string;
  estateName: string;
  /** URL снимка, о котором жалоба (для формы). */
  photoUrl: string;
  /** Админ: скрыть фото в БД. Обычный пользователь: ссылка на /feedback. */
  editor?: boolean;
  photoId?: string;
  /** Админ + PastVu: локально сменить кадр без записи в БД. */
  onAdminSkip?: () => void;
};

/**
 * Маленькая табличка «мимо» внизу слева на фото при наведении.
 * Пользователь — в редактуру; админ — сразу убрать / сменить кадр.
 */
export function PhotoMissControl({
  slug,
  estateName,
  photoUrl,
  editor = false,
  photoId,
  onAdminSkip,
}: Props) {
  const feedbackHref = `/feedback?topic=photo&slug=${encodeURIComponent(slug)}&name=${encodeURIComponent(estateName)}&photo=${encodeURIComponent(photoUrl)}`;

  if (editor && onAdminSkip) {
    return (
      <button
        type="button"
        className="photo-miss"
        title="Снимок мимо — показать другой с PastVu"
        onClick={onAdminSkip}
      >
        мимо
      </button>
    );
  }

  if (editor && photoId) {
    return (
      <form action={hideEstatePhoto} className="photo-miss-form">
        <input type="hidden" name="id" value={photoId} />
        <input type="hidden" name="slug" value={slug} />
        <button type="submit" className="photo-miss" title="Скрыть снимок и подставить следующий">
          мимо
        </button>
      </form>
    );
  }

  return (
    <a className="photo-miss" href={feedbackHref} title="Сообщить, что снимок мимо">
      мимо
    </a>
  );
}
