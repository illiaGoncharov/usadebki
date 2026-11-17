import {
  type AnyPgColumn,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Колонки усадьбы — паспорт реестра. Их повторный импорт обновляет.
 * То, что дописал человек (состояние, владельцы, заметки), живёт
 * в statements и не затирается выгрузкой.
 */
export const estates = pgTable(
  "estates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    regionId: text("region_id").notNull(),
    regionName: text("region_name").notNull(),
    address: text("address"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    egrknRegNumber: text("egrkn_reg_number").notNull(),
    egrknNativeId: text("egrkn_native_id").notNull(),
    category: text("category"),
    objectType: text("object_type"),
    createdDateText: text("created_date_text"),
    protectionYear: integer("protection_year"),
    wikidataQid: text("wikidata_qid"),
    wikipediaUrl: text("wikipedia_url"),
    wikipediaTitle: text("wikipedia_title"),
    summary: text("summary"),
    // wikipedia — вступление статьи. Пусто, пока текст не подтянут.
    summarySource: text("summary_source"),
    // Самый определённый стиль из Wikidata. Правка человека в statements его перекрывает.
    wikiStyle: text("wiki_style"),
    // Все стили, которые Wikidata или вступление Википедии назвали у этой усадьбы.
    wikiStyles: text("wiki_styles").array(),
    // Состояние из обогащения (Википедия / Wikidata). Правка в statements важнее.
    wikiCondition: text("wiki_condition"),
    // Дубль паспорта ЕГРОКН → не показываем в ленте, редирект на каноническую карточку.
    canonicalEstateId: uuid("canonical_estate_id").references((): AnyPgColumn => estates.id, {
      onDelete: "set null",
    }),
    rawJson: jsonb("raw_json"),
    importedAt: timestamp("imported_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("estates_slug_idx").on(table.slug),
    uniqueIndex("estates_reg_idx").on(table.egrknRegNumber),
    index("estates_region_idx").on(table.regionId),
    index("estates_native_idx").on(table.egrknNativeId),
    index("estates_canonical_idx").on(table.canonicalEstateId),
  ],
);

export const estateParts = pgTable(
  "estate_parts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    estateId: uuid("estate_id")
      .notNull()
      .references(() => estates.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    egrknRegNumber: text("egrkn_reg_number").notNull(),
    egrknNativeId: text("egrkn_native_id").notNull(),
    objectType: text("object_type"),
    address: text("address"),
    typology: text("typology"),
  },
  (table) => [
    uniqueIndex("estate_parts_reg_idx").on(table.egrknRegNumber),
    index("estate_parts_estate_idx").on(table.estateId),
  ],
);

export const people = pgTable(
  "people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    wikidataQid: text("wikidata_qid"),
    years: text("years"),
  },
  (table) => [uniqueIndex("people_wikidata_idx").on(table.wikidataQid)],
);

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  author: text("author"),
  page: text("page"),
  url: text("url"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const estatePeople = pgTable(
  "estate_people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    estateId: uuid("estate_id")
      .notNull()
      .references(() => estates.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    yearFrom: integer("year_from"),
    yearTo: integer("year_to"),
    sourceId: uuid("source_id").references(() => sources.id),
    // wikidata обновляется скриптом, human остаётся после повторного обогащения
    origin: text("origin").notNull().default("human"),
  },
  (table) => [index("estate_people_estate_idx").on(table.estateId)],
);

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    estateId: uuid("estate_id")
      .notNull()
      .references(() => estates.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    author: text("author"),
    license: text("license"),
    year: integer("year"),
    isPrimary: boolean("is_primary").notNull().default(false),
    sourceUrl: text("source_url"),
    origin: text("origin").notNull().default("commons"),
    // Фото от части ансамбля (не основного объекта)
    isEnsemblePart: boolean("is_ensemble_part").notNull().default(false),
    // Скрыто администратором (неправильное фото)
    isHidden: boolean("is_hidden").notNull().default(false),
    // ЕГРОКН регистрационный номер объекта, которому фото действительно принадлежит
    depictsEgrknNumber: text("depicts_egrkn_number"),
  },
  (table) => [uniqueIndex("photos_estate_url_idx").on(table.estateId, table.url)],
);

export const contributions = pgTable(
  "contributions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    estateId: uuid("estate_id")
      .notNull()
      .references(() => estates.id, { onDelete: "cascade" }),
    predicate: text("predicate").notNull(),
    text: text("text").notNull(),
    authorName: text("author_name").notNull(),
    contact: text("contact"),
    sourceTitle: text("source_title").notNull(),
    sourcePage: text("source_page"),
    sourceUrl: text("source_url"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("contributions_status_idx").on(table.status),
    index("contributions_estate_idx").on(table.estateId),
  ],
);

export const inquiries = pgTable(
  "inquiries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    topic: text("topic").notNull(),
    estateSlug: text("estate_slug"),
    estateName: text("estate_name"),
    message: text("message").notNull(),
    authorName: text("author_name").notNull(),
    contact: text("contact"),
    pageUrl: text("page_url"),
    suggestedPhotoUrl: text("suggested_photo_url"),
    attachmentFilename: text("attachment_filename"),
    attachmentPath: text("attachment_path"),
    emailSent: boolean("email_sent").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("inquiries_created_idx").on(table.createdAt)],
);

export const statements = pgTable(
  "statements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    estateId: uuid("estate_id")
      .notNull()
      .references(() => estates.id, { onDelete: "cascade" }),
    predicate: text("predicate").notNull(),
    text: text("text").notNull(),
    sourceId: uuid("source_id").references(() => sources.id),
    status: text("status").notNull().default("accepted"),
    contributionId: uuid("contribution_id").references(() => contributions.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("statements_lookup_idx").on(table.estateId, table.predicate, table.status),
  ],
);
