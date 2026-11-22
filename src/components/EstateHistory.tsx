import { InstantEdit } from "@/components/InstantEdit";
import { ExpandableHistory } from "@/components/ExpandableHistory";
import { mergeRegistryNoteIntoHistory } from "@/lib/estate-display-name";
import { formatNameList } from "@/lib/labels";
import { wikipediaIntro } from "@/lib/wikipedia";
import { styleLabel } from "@/lib/reference";

type Person = { id: string; name: string; role: string };

type Props = {
  summary: string | null;
  summarySource: string | null;
  /** Принятая правка «история» — перекрывает Википедию / паспорт. */
  historyOverride: string | null;
  wikipediaTitle: string | null;
  wikipediaUrl: string | null;
  registryNameNote: string | null;
  architects: Person[];
  styleIds: string[];
  createdDateText: string | null;
  slug: string;
  editor?: boolean;
};

/**
 * Блок «История»: текст из правки, Википедии или реестра + архитектура (стили и авторы).
 * Длинный текст свёрнут, чтобы карта оставалась на экране.
 */
export async function EstateHistory({
  summary,
  summarySource,
  historyOverride,
  wikipediaTitle,
  wikipediaUrl,
  registryNameNote,
  architects,
  styleIds,
  createdDateText,
  slug,
  editor = false,
}: Props) {
  const humanHistory = historyOverride?.trim() || null;
  const fromWiki = !humanHistory && summarySource === "wikipedia";
  const fromEgrkn = !humanHistory && summarySource === "egrkn-passport";
  const fromHuman = Boolean(humanHistory);

  let body = humanHistory ?? summary?.trim() ?? "";
  if (!humanHistory && fromWiki && wikipediaTitle) {
    const intro = await wikipediaIntro(wikipediaTitle);
    if (intro && intro.length > body.length) body = intro;
  }

  const bodyBeforeRegistry = body;
  if (!humanHistory) {
    body = mergeRegistryNoteIntoHistory(body, registryNameNote);
  }
  const addedRegistryTail =
    !humanHistory &&
    Boolean(registryNameNote?.trim()) &&
    body.length > bodyBeforeRegistry.trim().length + 12;

  const styles = styleIds.map((id) => styleLabel(id)).filter(Boolean);
  const architectNames = architects.map((p) => p.name).filter(Boolean);
  const credits = buildCredits({ styles, architectNames, createdDateText, fromEgrkn });

  // В моментальную форму подставляем то, что сейчас на экране — удобно править.
  const editableBody = body;

  return (
    <>
      {body ? (
        <>
          {fromHuman ? (
            <p className="caption" style={{ marginBottom: "0.35rem" }}>
              Уточнённая история
            </p>
          ) : fromWiki && wikipediaUrl ? (
            <p className="caption" style={{ marginBottom: "0.35rem" }}>
              Из{" "}
              <a className="text-link" href={wikipediaUrl} target="_blank" rel="noopener noreferrer">
                статьи в русской Википедии
              </a>
            </p>
          ) : null}
          {fromEgrkn ? (
            <p className="caption" style={{ marginBottom: "0.35rem" }}>
              Справка из паспорта реестра (не полная история)
            </p>
          ) : addedRegistryTail && fromWiki ? (
            <p className="caption" style={{ marginBottom: "0.35rem" }}>
              В начале — уточнения из наименования в реестре, ниже — статья Википедии
            </p>
          ) : addedRegistryTail ? (
            <p className="caption" style={{ marginBottom: "0.35rem" }}>
              Из наименования в реестре
            </p>
          ) : null}
          <ExpandableHistory>
            {body.includes("\n\n") ? (
              body.split("\n\n").map((paragraph, index) => <p key={index}>{paragraph}</p>)
            ) : (
              <p>{body}</p>
            )}
          </ExpandableHistory>
        </>
      ) : (
        <p>
          История этого места ещё не собрана. Если она есть в книге или статье, её можно{" "}
          <a className="text-link" href={`/estates/${slug}/contribute?field=history`}>
            дописать со ссылкой на источник
          </a>
          .
        </p>
      )}

      <p style={{ marginTop: "0.55rem" }}>
        {editor ? (
          <InstantEdit
            slug={slug}
            predicate="history"
            currentValue={editableBody}
            label="моментально"
          />
        ) : (
          <a className="text-link" href={`/estates/${slug}/contribute?field=history`}>
            уточнить
          </a>
        )}
      </p>

      {credits ? (
        <p className="muted" style={{ marginTop: "0.9rem" }}>
          {credits}
        </p>
      ) : null}
    </>
  );
}

function buildCredits(input: {
  styles: string[];
  architectNames: string[];
  createdDateText: string | null;
  fromEgrkn: boolean;
}): string | null {
  const bits: string[] = [];
  if (input.createdDateText && !input.fromEgrkn) {
    bits.push(`Датировка: ${input.createdDateText}`);
  }
  if (input.styles.length > 0) {
    bits.push(`Стиль: ${input.styles.join(", ")}`);
  }
  if (input.architectNames.length > 0) {
    bits.push(`Архитектор(ы): ${formatNameList(input.architectNames)}`);
  }
  return bits.length > 0 ? bits.join(". ") + "." : null;
}
