"use client";

import { useEffect, useRef, useState } from "react";
import { submitInstantEdit } from "@/app/actions";
import { StylePicker } from "@/components/StylePicker";
import { CONDITION_PICK_HINT, CONDITIONS, type PredicateId } from "@/lib/labels";

export function InstantEdit({
  slug,
  predicate,
  currentValue,
  label = "моментально",
  /** После сохранения — вернуться на админ-страницу (например историю карточки). */
  returnTo,
}: {
  slug: string;
  predicate: PredicateId;
  currentValue?: string | null;
  label?: string;
  returnTo?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button
        type="button"
        className="text-button"
        style={{
          fontSize: "0.85em",
          textTransform: "none",
          letterSpacing: "normal",
          color: "var(--muted)",
        }}
        onClick={() => setIsOpen(true)}
        title="Моментально обновить поле без заполнения лишних данных"
      >
        {label}
      </button>
    );
  }

  const longText =
    predicate === "history" ||
    predicate === "note" ||
    predicate === "owners" ||
    predicate === "architects" ||
    predicate === "composition";

  return (
    <form
      action={submitInstantEdit}
      className="instant-edit"
      style={{
        margin: "0.5rem 0",
        padding: "0.75rem 0.9rem",
        border: "1px dashed var(--line)",
        background: "rgba(0, 0, 0, 0.02)",
        width: "100%",
        maxWidth: "100%",
      }}
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="predicate" value={predicate} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      {predicate === "condition" ? (
        <>
          <select
            name="text"
            className="field"
            defaultValue={currentValue && currentValue !== "unknown" ? currentValue : "ruins"}
            style={{ margin: "0 0 0.35rem", padding: "0.2rem 0" }}
          >
            {CONDITIONS.filter((item) => item.id !== "unknown").map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <p className="fact__hint" style={{ margin: "0 0 0.5rem" }}>
            {CONDITION_PICK_HINT}
          </p>
        </>
      ) : predicate === "style" ? (
        <StylePicker value={currentValue} />
      ) : longText ? (
        <>
          <GrowingTextarea
            name="text"
            required
            placeholder={
              predicate === "owners" || predicate === "architects"
                ? "Каждое имя с новой строки"
                : predicate === "composition"
                  ? "Каждая часть ансамбля с новой строки (флигель, церковь…)"
                  : predicate === "history"
                    ? "Текст истории усадьбы"
                    : "Короткая заметка"
            }
            defaultValue={currentValue ?? ""}
            minRows={predicate === "history" ? 12 : predicate === "composition" ? 6 : 8}
          />
          {predicate === "owners" ? (
            <label
              className="check"
              style={{ margin: "0 0 0.55rem", display: "flex", gap: "0.45rem", alignItems: "center" }}
            >
              <input type="checkbox" name="asLastOwner" value="1" defaultChecked />
              <span style={{ textTransform: "none", letterSpacing: "normal" }}>
                последний владелец до 1917
              </span>
            </label>
          ) : null}
        </>
      ) : (
        <input
          name="text"
          className="field"
          required
          placeholder={
            predicate === "year"
              ? "Например: 1790-е гг."
              : predicate === "title"
                ? "Короткое название на карточке"
                : "Короткая справка"
          }
          defaultValue={currentValue ?? ""}
          maxLength={predicate === "title" ? 160 : undefined}
          style={{ margin: "0 0 0.4rem" }}
        />
      )}

      <div style={{ display: "flex", gap: "0.8rem", alignItems: "center" }}>
        <button className="text-button" type="submit">
          Сохранить
        </button>
        <button
          className="text-button"
          type="button"
          style={{ color: "var(--muted)" }}
          onClick={() => setIsOpen(false)}
        >
          Отмена
        </button>
      </div>
    </form>
  );
}

/** Textarea на всю ширину, сам подрастает под текст — удобно править длинные правки. */
function GrowingTextarea({
  name,
  required,
  placeholder,
  defaultValue,
  minRows = 8,
}: {
  name: string;
  required?: boolean;
  placeholder?: string;
  defaultValue: string;
  minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function fit() {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    const line = 24;
    const min = minRows * line;
    node.style.height = `${Math.max(min, node.scrollHeight)}px`;
  }

  useEffect(() => {
    fit();
  }, [defaultValue, minRows]);

  return (
    <textarea
      ref={ref}
      name={name}
      className="field instant-edit__text"
      required={required}
      placeholder={placeholder}
      defaultValue={defaultValue}
      rows={minRows}
      onInput={fit}
      style={{
        display: "block",
        width: "100%",
        margin: "0 0 0.5rem",
        padding: "0.45rem 0",
        minHeight: `${minRows * 1.5}rem`,
        lineHeight: 1.5,
        resize: "vertical",
        overflow: "hidden",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}
    />
  );
}
