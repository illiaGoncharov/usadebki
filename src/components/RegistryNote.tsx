export function RegistryNote({ wikipedia = false }: { wikipedia?: boolean }) {
  return (
    <p className="note">
      Сведения реестра: Минкультуры России, ЕГРОКН.
      {wikipedia ? " Текст: русская Википедия, CC BY-SA." : null}
    </p>
  );
}
