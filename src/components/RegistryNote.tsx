export function RegistryNote({ summarySource = null }: { summarySource?: string | null }) {
  const wiki = summarySource === "wikipedia";
  const egrkn = summarySource === "egrkn-passport";
  return (
    <p className="note">
      Сведения реестра: Минкультуры России, ЕГРОКН.
      {wiki ? " Текст истории: русская Википедия, CC BY-SA." : null}
      {egrkn ? " Текст истории: поля паспорта ЕГРОКН." : null}
    </p>
  );
}
