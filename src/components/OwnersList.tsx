"use client";

import { useMemo, useState } from "react";
import { removeEstatePerson, setEstatePersonAsLastOwner } from "@/app/actions";
import { AdminRemoveButton } from "@/components/AdminRemoveButton";
import { InstantEdit } from "@/components/InstantEdit";
import {
  partitionOwnersByRevolution,
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
 * С 1918 / советская судьба — отдельным блоком в самом конце.
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
  const [postExpanded, setPostExpanded] = useState(false);

  const { primary, earlier, lastIsGuessed, postRevolution } = useMemo(() => {
    if (owners.length === 0) {
      return {
        primary: null as OwnerRow | null,
        earlier: [] as OwnerRow[],
        lastIsGuessed: false,
        postRevolution: [] as OwnerRow[],
      };
    }

    const { preRev, postRev } = partitionOwnersByRevolution(owners);
    if (preRev.length === 0) {
      return {
        primary: null,
        earlier: [],
        lastIsGuessed: false,
        postRevolution: postRev,
      };
    }

    const chronological = sortOwnersChronologically(preRev);
    const last = pickLastPreRevolutionOwner(preRev);
    const rest = chronological.filter((person) => person.id !== last.id);
    const lastIsGuessed = last.role !== "last_owner";

    return { primary: last, earlier: rest, lastIsGuessed, postRevolution: postRev };
  }, [owners]);

  if (!primary && postRevolution.length === 0) return null;

  return (
    <div className="owners-list">
      {primary ? (
        <OwnerLine
          person={primary}
          slug={slug}
          editor={editor}
          isPrimary
          showLastBadge
          lastHint={lastIsGuessed ? "по датам" : undefined}
          canMarkLast={false}
        />
      ) : null}

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

      {postRevolution.length > 0 ? (
        <>
          <p style={{ margin: primary || earlier.length > 0 ? "0.85rem 0 0" : "0" }}>
            <button
              type="button"
              className="text-button"
              style={{
                fontSize: "0.85em",
                textTransform: "none",
                letterSpacing: "normal",
                color: "var(--muted)",
              }}
              onClick={() => setPostExpanded((value) => !value)}
              aria-expanded={postExpanded}
            >
              {postExpanded ? "свернуть" : `после 1917 (${postRevolution.length})`}
            </button>
          </p>
          {postExpanded
            ? postRevolution.map((person) => (
                <OwnerLine
                  key={person.id}
                  person={person}
                  slug={slug}
                  editor={editor}
                  isPrimary={false}
                  showLastBadge={false}
                  canMarkLast={false}
                  variant="post"
                />
              ))
            : null}
        </>
      ) : null}

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
  variant = "pre",
}: {
  person: OwnerRow;
  slug: string;
  editor: boolean;
  isPrimary: boolean;
  showLastBadge: boolean;
  lastHint?: string;
  canMarkLast: boolean;
  variant?: "pre" | "post";
}) {
  return (
    <div
      className={`owners-list__row${variant === "post" ? " owners-list__row--post" : ""}`}
      style={{
        margin: isPrimary ? "0" : "0.45rem 0 0",
        fontSize: isPrimary ? undefined : "0.95em",
      }}
    >
      <p className="owners-list__text" style={{ margin: 0 }}>
        <span>{person.name}</span>
        {person.years ? <span className="muted"> · {person.years}</span> : null}
        {showLastBadge ? (
          <span className="muted">
            {" "}
            · последний до 1917
            {lastHint ? ` (${lastHint})` : ""}
          </span>
        ) : null}
      </p>
      {editor ? (
        <div className="owners-list__tools">
          {canMarkLast ? (
            <form action={setEstatePersonAsLastOwner} className="owners-list__tool">
              <input type="hidden" name="id" value={person.id} />
              <input type="hidden" name="slug" value={slug} />
              <button type="submit" className="photo-edit-link" title="Отметить как последнего владельца до 1917">
                сделать последним
              </button>
            </form>
          ) : null}
          <AdminRemoveButton action={removeEstatePerson} id={person.id} slug={slug} label={`Убрать ${person.name}`} />
        </div>
      ) : null}
    </div>
  );
}