/** Маленькая кнопка «×» для удаления с карточки (только редактор). */
export function AdminRemoveButton({
  action,
  id,
  slug,
  label,
}: {
  action: (formData: FormData) => void | Promise<void>;
  id: string;
  slug: string;
  label: string;
}) {
  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="slug" value={slug} />
      <button
        type="submit"
        className="admin-remove"
        title={label}
        aria-label={label}
      >
        ×
      </button>
    </form>
  );
}
