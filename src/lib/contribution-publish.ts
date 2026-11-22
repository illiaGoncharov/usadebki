import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contributions, estatePeople, estates, people, sources, statements } from "@/db/schema";
import { isPredicateId, splitOwnerNames } from "@/lib/labels";

type DbTx = Pick<typeof db, "select" | "insert" | "update" | "delete">;

async function findOrCreatePerson(tx: DbTx, name: string) {
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

type PersonRole = "last_owner" | "owner" | "architect";

async function linkPeopleByRole(
  tx: DbTx,
  estateId: string,
  role: PersonRole,
  names: string[],
  sourceId: string | null,
) {
  for (const name of names) {
    const personId = await findOrCreatePerson(tx, name);
    const [existing] = await tx
      .select({ id: estatePeople.id })
      .from(estatePeople)
      .where(
        and(
          eq(estatePeople.estateId, estateId),
          eq(estatePeople.personId, personId),
          eq(estatePeople.role, role),
        ),
      )
      .limit(1);
    if (existing) continue;
    await tx.insert(estatePeople).values({
      estateId,
      personId,
      role,
      sourceId,
      origin: "human",
    });
  }
}

/** Снять отметку «последний» со всех владельцев усадьбы. */
async function clearLastOwnerMarks(tx: DbTx, estateId: string) {
  await tx
    .update(estatePeople)
    .set({ role: "owner" })
    .where(and(eq(estatePeople.estateId, estateId), eq(estatePeople.role, "last_owner")));
}

async function estateHasLastOwner(tx: DbTx, estateId: string) {
  const [row] = await tx
    .select({ id: estatePeople.id })
    .from(estatePeople)
    .where(and(eq(estatePeople.estateId, estateId), eq(estatePeople.role, "last_owner")))
    .limit(1);
  return Boolean(row);
}

/** Перенос правки в statements / людей — то же, что «Принять» в /admin. */
export async function publishContribution(contribution: typeof contributions.$inferSelect) {
  if (!isPredicateId(contribution.predicate)) {
    throw new Error("Неизвестное поле правки.");
  }
  if (contribution.status !== "pending") {
    throw new Error("Правка уже обработана.");
  }

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
      // Первая строка — последний владелец, только если на карточке его ещё нет.
      const names = splitOwnerNames(contribution.text);
      const hasLast = await estateHasLastOwner(tx, contribution.estateId);
      if (!hasLast && names.length > 0) {
        await linkPeopleByRole(tx, contribution.estateId, "last_owner", [names[0]!], source.id);
        await linkPeopleByRole(tx, contribution.estateId, "owner", names.slice(1), source.id);
      } else {
        await linkPeopleByRole(tx, contribution.estateId, "owner", names, source.id);
      }
    }
    if (contribution.predicate === "architects") {
      await linkPeopleByRole(
        tx,
        contribution.estateId,
        "architect",
        splitOwnerNames(contribution.text),
        source.id,
      );
    }

    await tx.update(contributions).set({ status: "accepted" }).where(eq(contributions.id, contribution.id));
  });
}

export async function publishContributionById(contributionId: string) {
  const [contribution] = await db
    .select()
    .from(contributions)
    .where(and(eq(contributions.id, contributionId), eq(contributions.status, "pending")))
    .limit(1);
  if (!contribution) return null;

  await publishContribution(contribution);

  const [estate] = await db
    .select({ slug: estates.slug })
    .from(estates)
    .where(eq(estates.id, contribution.estateId))
    .limit(1);

  return estate?.slug ?? null;
}

/** Моментальное сохранение правки от редактора без лишних полей */
export async function publishInstantEdit({
  slug,
  predicate,
  text,
  asLastOwner = false,
}: {
  slug: string;
  predicate: string;
  text: string;
  /** Для owners: отметить добавленных как последнего владельца. */
  asLastOwner?: boolean;
}) {
  if (!isPredicateId(predicate)) {
    throw new Error("Неизвестное поле правки.");
  }
  const body = text.trim();
  if (!body) {
    throw new Error("Значение не может быть пустым.");
  }

  const [estate] = await db
    .select({ id: estates.id, slug: estates.slug, name: estates.name })
    .from(estates)
    .where(eq(estates.slug, slug))
    .limit(1);

  if (!estate) throw new Error("Усадьба не найдена.");

  await db.transaction(async (tx) => {
    // Не плодим одинаковые утверждения (и дубли «Правка редактора» в источниках).
    const [existing] = await tx
      .select({ id: statements.id, sourceId: statements.sourceId })
      .from(statements)
      .where(
        and(
          eq(statements.estateId, estate.id),
          eq(statements.predicate, predicate),
          eq(statements.text, body),
          eq(statements.status, "accepted"),
        ),
      )
      .limit(1);

    let sourceId = existing?.sourceId ?? null;

    if (!existing) {
      const [source] = await tx
        .insert(sources)
        .values({
          type: "editorial",
          title: "Правка редактора (моментально)",
          author: "Редактор",
        })
        .returning();

      if (!source) throw new Error("Источник не записался");
      sourceId = source.id;

      const [contribution] = await tx
        .insert(contributions)
        .values({
          estateId: estate.id,
          predicate,
          text: body,
          authorName: "Редактор",
          sourceTitle: "Правка редактора (моментально)",
          status: "accepted",
        })
        .returning();

      await tx.insert(statements).values({
        estateId: estate.id,
        predicate,
        text: body,
        sourceId: source.id,
        status: "accepted",
        contributionId: contribution?.id ?? null,
      });
    }

    if (predicate === "owners") {
      const names = splitOwnerNames(body);
      if (asLastOwner) {
        await clearLastOwnerMarks(tx, estate.id);
        await linkPeopleByRole(tx, estate.id, "last_owner", names, sourceId);
      } else if (!(await estateHasLastOwner(tx, estate.id)) && names.length > 0) {
        // На пустой карточке первый добавленный — последний владелец.
        await linkPeopleByRole(tx, estate.id, "last_owner", [names[0]!], sourceId);
        await linkPeopleByRole(tx, estate.id, "owner", names.slice(1), sourceId);
      } else {
        await linkPeopleByRole(tx, estate.id, "owner", names, sourceId);
      }
    }
    if (predicate === "architects") {
      await linkPeopleByRole(tx, estate.id, "architect", splitOwnerNames(body), sourceId);
    }
  });

  return estate.slug;
}

/** Отметить человека как последнего владельца (остальных last_owner → owner). */
export async function setPersonAsLastOwner(estatePersonId: string) {
  const [link] = await db
    .select({
      id: estatePeople.id,
      estateId: estatePeople.estateId,
      personId: estatePeople.personId,
    })
    .from(estatePeople)
    .where(eq(estatePeople.id, estatePersonId))
    .limit(1);

  if (!link) return null;

  await db.transaction(async (tx) => {
    await clearLastOwnerMarks(tx, link.estateId);
    await tx.update(estatePeople).set({ role: "last_owner" }).where(eq(estatePeople.id, link.id));
  });

  const [estate] = await db
    .select({ slug: estates.slug })
    .from(estates)
    .where(eq(estates.id, link.estateId))
    .limit(1);

  return estate?.slug ?? null;
}

/** Отмена утверждения при ошибке (возвращает slug усадьбы) */
export async function revokeStatementById(statementId: string) {
  const [statement] = await db
    .select()
    .from(statements)
    .where(eq(statements.id, statementId))
    .limit(1);

  if (!statement) return null;

  await db.transaction(async (tx) => {
    await tx
      .update(statements)
      .set({ status: "revoked" })
      .where(eq(statements.id, statementId));

    if (
      (statement.predicate === "owners" || statement.predicate === "architects") &&
      statement.sourceId
    ) {
      await tx
        .delete(estatePeople)
        .where(
          and(
            eq(estatePeople.estateId, statement.estateId),
            eq(estatePeople.sourceId, statement.sourceId),
          ),
        );
    }
  });

  const [estate] = await db
    .select({ slug: estates.slug })
    .from(estates)
    .where(eq(estates.id, statement.estateId))
    .limit(1);

  return estate?.slug ?? null;
}

/** Восстановление ранее отменённого утверждения */
export async function restoreStatementById(statementId: string) {
  const [statement] = await db
    .select()
    .from(statements)
    .where(eq(statements.id, statementId))
    .limit(1);

  if (!statement) return null;

  await db.transaction(async (tx) => {
    await tx
      .update(statements)
      .set({ status: "accepted" })
      .where(eq(statements.id, statementId));

    if (statement.predicate === "owners") {
      const names = splitOwnerNames(statement.text);
      const hasLast = await estateHasLastOwner(tx, statement.estateId);
      if (!hasLast && names.length > 0) {
        await linkPeopleByRole(tx, statement.estateId, "last_owner", [names[0]!], statement.sourceId);
        await linkPeopleByRole(tx, statement.estateId, "owner", names.slice(1), statement.sourceId);
      } else {
        await linkPeopleByRole(tx, statement.estateId, "owner", names, statement.sourceId);
      }
    }
    if (statement.predicate === "architects") {
      await linkPeopleByRole(
        tx,
        statement.estateId,
        "architect",
        splitOwnerNames(statement.text),
        statement.sourceId,
      );
    }
  });

  const [estate] = await db
    .select({ slug: estates.slug })
    .from(estates)
    .where(eq(estates.id, statement.estateId))
    .limit(1);

  return estate?.slug ?? null;
}