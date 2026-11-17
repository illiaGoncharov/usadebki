/** Благодарность после фидбэка или правки «уточнить». */
export function SupportThanksBanner({ detail }: { detail?: string }) {
  return (
    <p className="banner">
      Спасибо за поддержку проекта! :)
      {detail ? (
        <>
          <br />
          <span className="muted">{detail}</span>
        </>
      ) : null}
    </p>
  );
}