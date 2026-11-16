"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { contributions, estatePeople, estates, people, sources, statements } from "@/db/schema";
import { adminCookie, adminToken, isAdmin } from "@/lib/admin";
import { isConditionId, isPredicateId, splitOwnerNames } from "@/lib/labels";
import { isStyleId } from "@/lib/reference";

export type FormState = { error: string | null };

export async function submitContribution(_prev: FormState, formData: FormData): Promise<FormState> {
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

  const [estate] = await db.select({ id: estates.id }).from(estates).where(eq(estates.slug, slug)).limit(1);
  if (!estate) return { error: "Усадьба не найдена." };

  await db.insert(contributions).values({
    estateId: estate.id,
    predicate,
    text: body,
    authorName,
    contact: contact || null,
    sourceTitle,
    sourcePage: sourcePage || null,
    sourceUrl,
  });

  redirect(`/estates/${slug}?sent=1`);
}

export async function acceptContribution(formData: FormData) {
  await assertAdmin();
  const id = text(formData.get("id"));
  if (!id) redirect("/admin");

  const [contribution] = await db
    .select()
    .from(contributions)
    .where(and(eq(contributions.id, id), eq(contributions.status, "pending")))
    .limit(1);
  if (!contribution || !isPredicateId(contribution.predicate)) redirect("/admin");

  const [estate] = await db
    .select({ slug: estates.slug })
    .from(estates)
    .where(eq(estates.id, contribution.estateId))
    .limit(1);

  await db.transaction(async (tx) => {
    const [source] = await tx
      .insert(sources)
      .values({
        type: contribution.sourceUrl ? "article" : "book",
        title: contribution.sourceTitle,
        author: contribution.authorName,
        page: contribution.sourcePage,
        url: contribution.sourceUrl,
        note: contribution.contact,
      })
      .returning();
    if (!source) throw new Error("Источник не записался");

    await tx.insert(statements).values({
      estateId: contribution.estateId,
      predicate: contribution.predicate,
      text: contribution.text,
      sourceId: source.id,
      status: "accepted",
      contributionId: contribution.id,
    });

    if (contribution.predicate === "owners") {
      for (const name of splitOwnerNames(contribution.text)) {
        const personId = await findOrCreatePerson(tx, name);
        const [existing] = await tx
          .select({ id: estatePeople.id })
          .from(estatePeople)
          .where(
            and(
              eq(estatePeople.estateId, contribution.estateId),
              eq(estatePeople.personId, personId),
              eq(estatePeople.role, "last_owner"),
              eq(estatePeople.origin, "human"),
            ),
          )
          .limit(1);
        if (existing) continue;
        await tx.insert(estatePeople).values({
          estateId: contribution.estateId,
          personId,
          role: "last_owner",
          sourceId: source.id,
          origin: "human",
        });
      }
    }

    await tx.update(contributions).set({ status: "accepted" }).where(eq(contributions.id, contribution.id));
  });

  if (estate) revalidatePath(`/estates/${estate.slug}`);
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

async function findOrCreatePerson(tx: Pick<typeof db, "select" | "insert">, name: string) {
  const [found] = await tx
    .select({ id: people.id })
    .from(people)
    .where(sql`lower(${people.name}) = ${name.toLowerCase()}`)
    .limit(1);
  if (found) return found.id;
  const [created] = await tx.insert(people).values({ name }).returning({ id: people.id });
  if (!created) throw new Error("Человек не записался");
  return created.id;
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
