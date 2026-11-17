"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { contributions, estates, inquiries } from "@/db/schema";
import { adminCookie, adminToken, isAdmin } from "@/lib/admin";
import { publishContribution, publishContributionById } from "@/lib/contribution-publish";
import { conditionLabel, isConditionId, isPredicateId, predicateLabel, splitOwnerNames } from "@/lib/labels";
import { readInquiryAttachment, saveInquiryAttachment } from "@/lib/inquiry-attachment";
import {
  sendContributionMail,
  sendContributionThanksMail,
  sendInquiryMail,
  sendInquiryThanksMail,
} from "@/lib/mail";
import { isStyleId, styleLabel } from "@/lib/reference";

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

  let attachment: Awaited<ReturnType<typeof readInquiryAttachment>> = null;
  try {
    attachment = await readInquiryAttachment(formData.get("attachment"));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Не удалось прочитать файл." };
  }

  const hasPhotoHint = Boolean(suggestedPhotoUrl || attachment);
  if (message.length > 4000) return { error: "Текст слишком длинный." };
  if (topic === "photo" && !hasPhotoHint && message.length < 10) {
    return { error: "Опишите проблему, приложите снимок или дайте ссылку на верное фото." };
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

  const emailed = await sendInquiryMail({
    topic,
    authorName,
    contact,
    message,
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
      message,
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
    const bits = ["thanks=1"];
    if (state.published) bits.push("published=1");
    if (state.emailed === false) bits.push("emailed=0");
    redirect(`${contributePath}&${bits.join("&")}`);
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
  if (body.length > 4000) return { error: "Текст слишком длинный. Хватит короткой справки." };
  if (predicate === "condition" && !isConditionId(body)) return { error: "Выберите состояние из списка." };
  if (predicate === "style" && !isStyleId(body)) return { error: "Выберите стиль из списка." };
  if (predicate === "owners" && splitOwnerNames(body).length === 0) {
    return { error: "Напишите хотя бы одно имя, каждое с новой строки." };
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
      : predicate === "style" && isStyleId(body)
        ? styleLabel(body)
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
  if (!id) redirect("/admin");

  const slug = await publishContributionById(id);
  if (!slug) redirect("/admin");

  revalidatePath(`/estates/${slug}`);
  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin");
}

export async function rejectContribution(formData: FormData) {
  await assertAdmin();
  const id = text(formData.get("id"));
  if (!id) redirect("/admin");
  await db
    .update(contributions)
    .set({ status: "rejected" })
    .where(and(eq(contributions.id, id), eq(contributions.status, "pending")));
  revalidatePath("/admin");
  redirect("/admin");
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = text(formData.get("password"));
  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!expected) return { error: "В .env не задан ADMIN_PASSWORD." };
  const { timingSafeEqual } = await import("node:crypto");
  const left = Buffer.from(password);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { error: "Пароль не подходит." };
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
