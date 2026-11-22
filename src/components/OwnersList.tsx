"use client";

import { useMemo, useState } from "react";
import { removeEstatePerson, setEstatePersonAsLastOwner } from "@/app/actions";
import { AdminRemoveButton } from "@/components/AdminRemoveButton";
import { InstantEdit } from "@/components/InstantEdit";
import {
  pickLastPreRevolutionOwner,
  sortOwnersChronologically,
} from "@/lib/owner-chronology";

export type OwnerRow = {
  id: string;
  name: string;
  role: string;
  years?: string | null;
};

/**
 * Владельцы: сверху последний до 1917 (по датам в тексте),
 * остальные — по хронологии за «ранее».
 */
export function OwnersList({
  owners,
  slug,
  editor = false,
}: {
  owners: OwnerRow[];
  slug: string;
  editor?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const { primary, earlier, lastIsGuessed } = useMemo(() => {
    if (owners.length === 0) {
      return { primary: null as OwnerRow | null, earlier: [] as OwnerRow[], lastIsGuessed: false };
    }

    const chronological = sortOwnersChronologically(owners);
    const last = pickLastPreRevolutionOwner(owners);
    const rest = chronological.filter((person) => person.id !== last.id);

    // Метка «последний» показываем всегда у выбранного алгоритмом (или вручную совпавшего).
    const lastIsGuessed = last.role !== "last_owner";

    return { primary: last, earlier: rest, lastIsGuessed };
  }, [owners]);

  if (!primary) return null;

  return (
    <div className="owners-list">
      <OwnerLine
        person={primary}
        slug={slug}
        editor={editor}
        isPrimary
        showLastBadge
        lastHint={lastIsGuessed ? "по датам" : undefined}
        canMarkLast={false}
      />

      {earlier.length > 0 ? (
        <p style={{ margin: "0.35rem 0 0" }}>
          <button
            type="button"
            className="text-button"
            style={{
              fontSize: "0.85em",
              textTransform: "none",
              letterSpacing: "normal",
              color: "var(--muted)",
            }}
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
          >
            {expanded ? "свернуть" : `ранее (${earlier.length})`}
          </button>
        </p>
      ) : null}

      {expanded
        ? earlier.map((person) => (
            <OwnerLine
              key={person.id}
              person={person}
              slug={slug}
              editor={editor}
              isPrimary={false}
              showLastBadge={false}
              canMarkLast={editor}
            />
          ))
        : null}

      {editor ? (
        <p style={{ margin: "0.45rem 0 0" }}>
          <InstantEdit slug={slug} predicate="owners" label="моментально добавить" />
        </p>
      ) : null}
    </div>
  );
}

function OwnerLine({
  person,
  slug,
  editor,
  isPrimary,
  showLastBadge,
  lastHint,
  canMarkLast,
}: {
  person: OwnerRow;
  slug: string;
  editor: boolean;
  isPrimary: boolean;
  showLastBadge: boolean;
  lastHint?: string;
  canMarkLast: boolean;
}) {
  return (
    <p
      className="owners-list__row"
      style={{
        margin: isPrimary ? "0" : "0.45rem 0 0",
        fontSize: isPrimary ? undefined : "0.95em",
      }}
    >
      <span>{person.name}</span>
      {person.years ? <span className="muted"> · {person.years}</span> : null}
      {showLastBadge ? (
        <span className="muted">
          {" "}
          · последний до 1917
          {lastHint ? ` (${lastHint})` : ""}
        </span>
      ) : null}
      {editor ? (
        <>
          {" "}
          {canMarkLast ? (
            <form action={setEstatePersonAsLastOwner} style={{ display: "inline" }}>
              <input type="hidden" name="id" value={person.id} />
              <input type="hidden" name="slug" value={slug} />
              <button
                type="submit"
                className="text-button"
                style={{
                  fontSize: "0.85em",
                  textTransform: "none",
                  letterSpacing: "normal",
                  color: "var(--muted)",
                }}
                title="Отметить как последнего владельца до 1917"
              >
                сделать последним
              </button>
            </form>
          ) : null}
          <AdminRemoveButton
            action={removeEstatePerson}
            id={person.id}
            slug={slug}
            label={`Убрать ${person.name}`}
          />
        </>
      ) : null}
    </p>
  );
}
