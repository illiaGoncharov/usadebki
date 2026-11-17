import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contributions, estatePeople, estates, people, sources, statements } from "@/db/schema";
import { isPredicateId, splitOwnerNames } from "@/lib/labels";

type DbTx = Pick<typeof db, "select" | "insert" | "update">;

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