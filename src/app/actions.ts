"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { contributions, estatePeople, estates, inquiries } from "@/db/schema";
import { adminCookie, adminToken, isAdmin } from "@/lib/admin";
import { safeAdminReturn } from "@/lib/admin-return";
import {
  publishContribution,
  publishContributionById,
  publishInstantEdit,
  restoreStatementById,
  revokeStatementById,
  setPersonAsLastOwner,
} from "@/lib/contribution-publish";
import {
  conditionLabel,
  isConditionId,
  isPredicateId,
  predicateLabel,
  splitOwnerNames,
} from "@/lib/labels";
import { readInquiryAttachment, saveInquiryAttachment } from "@/lib/inquiry-attachment";
import {
  sendContributionMail,
  sendContributionThanksMail,
  sendInquiryMail,
  sendInquiryThanksMail,
} from "@/lib/mail";
import { parsePhotoInput } from "@/lib/photo";
import {
  addEstatePhotoLogged,
  fillEnsembleFromCommonsLogged,
  hideEstatePhotoLogged,
  setEnsembleEstatePhotoLogged,
  setPrimaryEstatePhotoLogged,
} from "@/lib/photo-edit-log";
import { areValidStyleIds, formatStyleLabels } from "@/lib/reference";

function revalidatePhotoPaths(slug: string) {
  revalidatePath(`/estates/${slug}`);
  revalidatePath(`/admin/estates/${slug}/history`);
  revalidatePath("/admin/history");
  revalidatePath("/admin");
  revalidatePath("/");
}

export type FormState = {
  error: string | null;
  sent?: boolean;
  /** Письмо редактору ушло через Resend */
  emailed?: boolean;
  /** Редактор: правка сразу в карточке */
  published?: boolean;
  estateSlug?: string;
};

export async function submitInquiry(_prev: FormState, formData: FormData): Promise<FormState> {
  const topicRaw = text(formData.get("topic"));
  const topic = topicRaw === "photo" ? "photo" : "general";
  const message = text(formData.get("message"));
  const authorName = text(formData.get("authorName"));
  const contact = text(formData.get("contact"));
  const estateSlug = text(formData.get("estateSlug")) || null;
  const estateName = text(formData.get("estateName")) || null;
  const pageUrl = text(formData.get("pageUrl")) || null;
  const suggestedPhotoUrlRaw = text(formData.get("suggestedPhotoUrl"));
  const suggestedPhotoUrl = suggestedPhotoUrlRaw ? cleanUrl(suggestedPhotoUrlRaw) : null;
  if (suggestedPhotoUrlRaw && !suggestedPhotoUrl) {
    return { error: "Ссылка на снимок должна начинаться с http:// или https://." };
  }
  const wrongPhotoUrlRaw = text(formData.get("wrongPhotoUrl"));
  const wrongPhotoUrl = wrongPhotoUrlRaw ? cleanUrl(wrongPhotoUrlRaw) : null;

  let attachment: Awaited<ReturnType<typeof readInquiryAttachment>> = null;
  try {
    attachment = await readInquiryAttachment(formData.get("attachment"));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Не удалось прочитать файл." };
  }

  const hasPhotoHint = Boolean(suggestedPhotoUrl || attachment || wrongPhotoUrl);
  if (message.length > 4000) return { error: "Текст слишком длинный." };
  if (topic === "photo" && !hasPhotoHint && message.length < 10) {
    return { error: "Опишите, почему снимок мимо, или дайте ссылку на верный." };
  }
  if (message.length < 3 && !hasPhotoHint) {
    return { error: "Напишите хотя бы пару слов." };
  }
  if (authorName.length < 2 || authorName.length > 120) {
    return { error: "Укажите, как к вам обращаться." };
  }
  if (!contact || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    return { error: "Нужна рабочая почта для ответа." };
  }

  // В письмо и архив: спорный снимок + текст пользователя.
  const fullMessage = wrongPhotoUrl
    ? `Снимок с карточки (мимо): ${wrongPhotoUrl}\n\n${message}`
    : message;

  const emailed = await sendInquiryMail({
    topic,
    authorName,
    contact,
    message: fullMessage,
    estateName,
    estateSlug,
    pageUrl,
    suggestedPhotoUrl,
    attachment: attachment ? { filename: attachment.filename, content: attachment.buffer } : null,
  });
  if (emailed) {
    await sendInquiryThanksMail({ authorName, contact, topic });
  }

  const [row] = await db
    .insert(inquiries)
    .values({
      topic,
      estateSlug,
      estateName,
      message: fullMessage,
      authorName,
      contact,
      pageUrl,
      suggestedPhotoUrl,
      attachmentFilename: attachment?.filename ?? null,
      emailSent: emailed,
    })
    .returning({ id: inquiries.id });

  if (row && attachment) {
    const savedPath = await saveInquiryAttachment(row.id, attachment);
    if (savedPath) {
      await db.update(inquiries).set({ attachmentPath: savedPath }).where(eq(inquiries.id, row.id));
    }
  }

  return { error: null, sent: true, emailed };
}

/** Форма «уточнить» — без useActionState, чтобы redirect после отправки работал стабильно. */
export async function submitContributionFromForm(formData: FormData) {
  const slug = text(formData.get("slug"));
  const field = text(formData.get("predicate")) || "owners";
  const contributePath = slug
    ? `/estates/${slug}/contribute?field=${encodeURIComponent(field)}`
    : "/";
  let state: FormState;
  try {
    state = await submitContributionImpl(formData);
  } catch (error) {
    console.error("[submitContribution]", error);
    const detail = error instanceof Error ? error.message : "unknown";
    const message =
      process.env.NODE_ENV === "development"
        ? `Не удалось отправить: ${detail}`
        : "Не удалось отправить. Попробуйте ещё раз чуть позже.";
    redirect(`${contributePath}&error=${encodeURIComponent(message)}`);
  }

  if (state.sent && slug) {
    const bits = ["sent=1"];
    if (state.published) bits.push("published=1");
    redirect(`/estates/${slug}?${bits.join("&")}`);
  }

  const err = encodeURIComponent(state.error ?? "Ошибка");
  redirect(`${contributePath}&error=${err}`);
}

async function submitContributionImpl(formData: FormData): Promise<FormState> {
  const slug = text(formData.get("slug"));
  const predicate = text(formData.get("predicate"));
  const body = text(formData.get("text"));
  const authorName = text(formData.get("authorName"));
  const contact = text(formData.get("contact"));
  const sourceTitle = text(formData.get("sourceTitle"));
  const sourcePage = text(formData.get("sourcePage"));
  const sourceUrlRaw = text(formData.get("sourceUrl"));

  if (!slug || !isPredicateId(predicate)) return { error: "Не понял, какое поле вы уточняете." };
  if (!body) return { error: "Напишите, что именно известно." };
  if (predicate === "title" && body.length > 160) {
    return { error: "Название слишком длинное — до 160 символов, как на карточке." };
  }
  const maxLen = predicate === "history" ? 12000 : 4000;
  if (body.length > maxLen) {
    return {
      error:
        predicate === "history"
          ? "Текст истории слишком длинный. Сократите до сути."
          : "Текст слишком длинный. Хватит короткой справки.",
    };
  }
  if (predicate === "condition" && !isConditionId(body)) return { error: "Выберите состояние из списка." };
  if (predicate === "style" && !areValidStyleIds(body)) return { error: "Выберите хотя бы один стиль из списка." };
  if (
    (predicate === "owners" || predicate === "architects") &&
    splitOwnerNames(body).length === 0
  ) {
    return {
      error:
        predicate === "architects"
          ? "Напишите хотя бы одно имя архитектора, каждое с новой строки."
          : "Напишите хотя бы одно имя, каждое с новой строки.",
    };
  }
  if (!authorName || authorName.length < 2 || authorName.length > 120) {
    return { error: "Подпишите правку именем." };
  }
  if (!sourceTitle || sourceTitle.length < 2 || sourceTitle.length > 300) {
    return { error: "Нужен источник: книга, статья или архивное дело." };
  }
  const sourceUrl = sourceUrlRaw ? cleanUrl(sourceUrlRaw) : null;
  if (sourceUrlRaw && !sourceUrl) return { error: "Ссылка должна начинаться с http:// или https://." };

  const [estate] = await db
    .select({ id: estates.id, name: estates.name, slug: estates.slug })
    .from(estates)
    .where(eq(estates.slug, slug))
    .limit(1);
  if (!estate) return { error: "Усадьба не найдена." };

  const textDisplay =
    predicate === "condition" && isConditionId(body)
      ? conditionLabel(body)
      : predicate === "style" && areValidStyleIds(body)
        ? formatStyleLabels(body)
        : body;

  const [row] = await db
    .insert(contributions)
    .values({
      estateId: estate.id,
      predicate,
      text: body,
      authorName,
      contact: contact || null,
      sourceTitle,
      sourcePage: sourcePage || null,
      sourceUrl,
    })
    .returning();

  const editor = await isAdmin();

  if (row && editor) {
    await publishContribution(row);
    revalidatePath(`/estates/${slug}`);
    revalidatePath("/");
    return { error: null, sent: true, published: true, estateSlug: slug };
  }

  if (row) {
    const predicateRu = predicateLabel(predicate);
    const emailed = await sendContributionMail({
      contributionId: row.id,
      authorName,
      contact: contact || null,
      predicateLabel: predicateRu,
      textDisplay,
      estateName: estate.name,
      estateSlug: estate.slug,
      sourceTitle,
      sourcePage: sourcePage || null,
      sourceUrl,
    });
    if (contact && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
      await sendContributionThanksMail({
        authorName,
        contact,
        estateName: estate.name,
        estateSlug: estate.slug,
        predicateLabel: predicateRu,
      });
    }
    return { error: null, sent: true, emailed, estateSlug: slug };
  }

  return { error: "Не удалось сохранить правку. Попробуйте ещё раз." };
}

export async function acceptContribution(formData: FormData) {
  await assertAdmin();
  const id = text(formData.get("id"));
  if (!id) redirect("/admin/queue");

  const slug = await publishContributionById(id);
  if (!slug) redirect("/admin/queue");

  revalidatePath(`/estates/${slug}`);
  revalidatePath("/");
  revalidatePath("/admin/queue");
  revalidatePath("/admin/archive");
  revalidatePath("/admin");
  redirect("/admin/queue");
}

export async function rejectContribution(formData: FormData) {
  await assertAdmin();
  const id = text(formData.get("id"));
  if (!id) redirect("/admin/queue");
  await db
    .update(contributions)
    .set({ status: "rejected" })
    .where(and(eq(contributions.id, id), eq(contributions.status, "pending")));
  revalidatePath("/admin/queue");
  revalidatePath("/admin/archive");
  revalidatePath("/admin");
  redirect("/admin/queue");
}

/** Моментальное сохранение правки от редактора без ввода дополнительных полей. */
export async function submitInstantEdit(formData: FormData) {
  await assertAdmin();
  const slug = text(formData.get("slug"));
  const predicate = text(formData.get("predicate"));
  const body = text(formData.get("text"));
  const asLastOwner = text(formData.get("asLastOwner")) === "1";
  const returnTo = safeAdminReturn(text(formData.get("returnTo")), "");

  if (!slug || !isPredicateId(predicate)) {
    redirect(returnTo || (slug ? `/estates/${slug}` : "/"));
  }
  if (!body) {
    redirect(returnTo || `/estates/${slug}`);
  }
  // Название на карточке — короткое; длинный паспорт оставляем в реестре.
  if (predicate === "title" && body.length > 160) {
    redirect(returnTo || `/estates/${slug}`);
  }

  let success = false;
  try {
    await publishInstantEdit({ slug, predicate, text: body, asLastOwner });
    revalidatePath(`/estates/${slug}`);
    revalidatePath(`/admin/estates/${slug}/history`);
    revalidatePath("/");
    revalidatePath("/admin/history");
    revalidatePath("/admin/archive");
    revalidatePath("/admin");
    success = true;
  } catch (error) {
    console.error("[submitInstantEdit]", error);
  }

  if (returnTo) {
    redirect(returnTo);
  }
  if (success) {
    redirect(`/estates/${slug}?sent=1&published=1`);
  } else {
    redirect(`/estates/${slug}`);
  }
}

/** Отмена правки (утверждения) из истории изменений в случае ошибки. */
export async function revokeStatement(formData: FormData) {
  await assertAdmin();
  const id = text(formData.get("id"));
  const returnTo = safeAdminReturn(text(formData.get("returnTo")), "/admin/history");
  if (!id) redirect(returnTo);

  const slug = await revokeStatementById(id);
  if (slug) {
    revalidatePath(`/estates/${slug}`);
    revalidatePath(`/admin/estates/${slug}/history`);
  }
  revalidatePath("/");
  revalidatePath("/admin/history");
  revalidatePath("/admin/archive");
  revalidatePath("/admin");
  redirect(returnTo);
}

/** Удалить заметку / утверждение прямо с карточки усадьбы. */
export async function removeStatementFromEstate(formData: FormData) {
  await assertAdmin();
  const id = text(formData.get("id"));
  const slug = text(formData.get("slug"));
  if (!id || !slug) redirect(slug ? `/estates/${slug}` : "/");

  await revokeStatementById(id);
  revalidatePath(`/estates/${slug}`);
  revalidatePath(`/admin/estates/${slug}/history`);
  revalidatePath("/");
  revalidatePath("/admin/history");
  redirect(`/estates/${slug}`);
}

/** Админ: снимок мимо — скрыть в БД, на карточке появится следующий или PastVu. */
export async function hideEstatePhoto(formData: FormData) {
  await assertAdmin();
  const id = text(formData.get("id"));
  const slug = text(formData.get("slug"));
  const returnTo = safeAdminReturn(text(formData.get("returnTo")), "");
  if (!id || !slug) redirect(returnTo || (slug ? `/estates/${slug}` : "/"));

  await hideEstatePhotoLogged(slug, id);
  revalidatePhotoPaths(slug);
  redirect(returnTo || `/estates/${slug}`);
}

/** Админ: сделать снимок главным (и убрать из ансамбля, если был). */
export async function setPrimaryEstatePhoto(formData: FormData) {
  await assertAdmin();
  const id = text(formData.get("id"));
  const slug = text(formData.get("slug"));
  const returnTo = safeAdminReturn(text(formData.get("returnTo")), "");
  if (!id || !slug) redirect(returnTo || (slug ? `/estates/${slug}` : "/"));

  await setPrimaryEstatePhotoLogged(slug, id);
  revalidatePhotoPaths(slug);
  redirect(returnTo || `/estates/${slug}`);
}

/** Админ: перенести снимок в «части ансамбля» (или оставить там). */
export async function setEnsembleEstatePhoto(formData: FormData) {
  await assertAdmin();
  const id = text(formData.get("id"));
  const slug = text(formData.get("slug"));
  const returnTo = safeAdminReturn(text(formData.get("returnTo")), "");
  if (!id || !slug) redirect(returnTo || (slug ? `/estates/${slug}` : "/"));

  await setEnsembleEstatePhotoLogged(slug, id);
  revalidatePhotoPaths(slug);
  redirect(returnTo || `/estates/${slug}`);
}

/**
 * Админ: добавить снимок по URL (Commons или любой https).
 * Если такой URL уже есть — возвращаем из скрытых и выставляем роль.
 */
export async function addEstatePhoto(formData: FormData) {
  await assertAdmin();
  const slug = text(formData.get("slug"));
  const role = text(formData.get("role")) === "ensemble" ? "ensemble" : "main";
  const returnTo = safeAdminReturn(text(formData.get("returnTo")), "");
  const rawUrl = text(formData.get("photoUrl")) || text(formData.get("commonsUrl"));
  const parsed = parsePhotoInput(rawUrl);
  if (!slug || !parsed) redirect(returnTo || (slug ? `/estates/${slug}` : "/"));

  await addEstatePhotoLogged(slug, parsed, role);
  revalidatePhotoPaths(slug);
  redirect(returnTo || `/estates/${slug}`);
}

/** Админ: добрать части ансамбля из категории Commons. */
export async function fillEnsemblePhotosFromCommons(formData: FormData) {
  await assertAdmin();
  const slug = text(formData.get("slug"));
  const returnTo = safeAdminReturn(text(formData.get("returnTo")), "");
  if (!slug) redirect(returnTo || "/");

  await fillEnsembleFromCommonsLogged(slug);
  revalidatePhotoPaths(slug);
  redirect(returnTo || `/estates/${slug}`);
}

/** Убрать человека (архитектора / владельца) с карточки. */
export async function removeEstatePerson(formData: FormData) {
  await assertAdmin();
  const id = text(formData.get("id"));
  const slug = text(formData.get("slug"));
  if (!id || !slug) redirect(slug ? `/estates/${slug}` : "/");

  await db.delete(estatePeople).where(eq(estatePeople.id, id));
  revalidatePath(`/estates/${slug}`);
  revalidatePath("/");
  redirect(`/estates/${slug}`);
}

/** Отметить владельца как последнего до 1917. */
export async function setEstatePersonAsLastOwner(formData: FormData) {
  await assertAdmin();
  const id = text(formData.get("id"));
  const slug = text(formData.get("slug"));
  if (!id || !slug) redirect(slug ? `/estates/${slug}` : "/");

  await setPersonAsLastOwner(id);
  revalidatePath(`/estates/${slug}`);
  revalidatePath("/");
  redirect(`/estates/${slug}`);
}

/** Восстановление отменённой правки. */
export async function restoreStatement(formData: FormData) {
  await assertAdmin();
  const id = text(formData.get("id"));
  const returnTo = safeAdminReturn(text(formData.get("returnTo")), "/admin/history");
  if (!id) redirect(returnTo);

  const slug = await restoreStatementById(id);
  if (slug) {
    revalidatePath(`/estates/${slug}`);
    revalidatePath(`/admin/estates/${slug}/history`);
  }
  revalidatePath("/");
  revalidatePath("/admin/history");
  revalidatePath("/admin/archive");
  revalidatePath("/admin");
  redirect(returnTo);
}

/** Вход редактора — без useActionState, иначе redirect ломается на проде. */
export async function loginFromForm(formData: FormData) {
  const password = text(formData.get("password"));
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!expected) {
    redirect(`/admin/login?error=${encodeURIComponent("На сервере не задан ADMIN_PASSWORD.")}`);
  }
  const { timingSafeEqual } = await import("node:crypto");
  const left = Buffer.from(password);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    redirect(`/admin/login?error=${encodeURIComponent("Пароль не подходит.")}`);
  }
  const jar = await cookies();
  jar.set(adminCookie.name, adminToken(), adminCookie.options);
  redirect("/admin");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(adminCookie.name);
  redirect("/");
}

async function assertAdmin() {
  if (!(await isAdmin())) redirect("/admin/login");
}

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
