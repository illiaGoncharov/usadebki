import { wikipediaIntro } from "@/lib/wikipedia";
import { styleLabel } from "@/lib/reference";

type Person = { id: string; name: string; role: string };

type Props = {
  summary: string | null;
  summarySource: string | null;
  wikipediaTitle: string | null;
  architects: Person[];
  styleIds: string[];
  createdDateText: string | null;
};

/**
 * Блок «История»: текст из Википедии или реестра + архитектура (стили и авторы).
 */
export async function EstateHistory({
  summary,
  summarySource,
  wikipediaTitle,
  architects,
  styleIds,
  createdDateText,
}: Props) {
  const fromWiki = summarySource === "wikipedia";
  const fromEgrkn = summarySource === "egrkn-passport";

  let body = summary?.trim() ?? "";
  if (fromWiki && wikipediaTitle) {
    const intro = await wikipediaIntro(wikipediaTitle);
    if (intro && intro.length > body.length) body = intro;
  }

  const styles = styleIds.map((id) => styleLabel(id)).filter(Boolean);
  const architectNames = architects.map((p) => p.name).filter(Boolean);
  const credits = buildCredits({ styles, architectNames, createdDateText, fromEgrkn });

  return (
    <>
      {body ? (
        <>
          {fromWiki ? <p className="caption" style={{ marginBottom: "0.35rem" }}>Из статьи в русской Википедии</p> : null}
          {fromEgrkn ? (
            <p className="caption" style={{ marginBottom: "0.35rem" }}>
              Справка из паспорта реестра (не полная история)
            </p>
          ) : null}
          <p>{body}</p>
        </>
      ) : (
        <p>
          История этого места ещё не собрана. Если она есть в книге или статье, её можно дописать со ссылкой на
          источник.
        </p>
      )}
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
    bits.push(
      input.architectNames.length === 1
        ? `Архитектор: ${input.architectNames[0]}`
        : `Архитекторы: ${input.architectNames.join(", ")}`,
    );
  }
  return bits.length > 0 ? bits.join(". ") + "." : null;
}