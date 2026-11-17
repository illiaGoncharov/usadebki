/** Обёртка HTML-письма в стиле каталога (бумага / чернила). */

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export type MailRow = { label: string; value: string; href?: string };

export function renderMailHtml(options: {
  preheader?: string;
  title: string;
  lead?: string;
  rows?: MailRow[];
  quote?: string;
  primaryButton?: { label: string; href: string };
  secondaryLink?: { label: string; href: string };
  footnote?: string;
}) {
  const preheader = options.preheader ? escapeHtml(options.preheader) : "";
  const title = escapeHtml(options.title);
  const lead = options.lead ? escapeHtml(options.lead) : "";
  const quote = options.quote
    ? `<blockquote style="margin:20px 0;padding:14px 16px;border-left:3px solid #161616;background:#ebe6dc;color:#161616;font-size:15px;line-height:1.5;">${escapeHtml(options.quote)}</blockquote>`
    : "";

  const rows =
    options.rows
      ?.map((row) => {
        const label = escapeHtml(row.label);
        const value = row.href
          ? `<a href="${escapeHtml(row.href)}" style="color:#161616;text-decoration:underline;">${escapeHtml(row.value)}</a>`
          : escapeHtml(row.value);
        return `<tr>
          <td style="padding:10px 0 4px;color:#5e5a53;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;">${label}</td>
        </tr>
        <tr>
          <td style="padding:0 0 16px;font-size:15px;line-height:1.45;color:#161616;">${value}</td>
        </tr>`;
      })
      .join("") ?? "";

  const button = options.primaryButton
    ? `<p style="margin:24px 0 8px;">
        <a href="${escapeHtml(options.primaryButton.href)}" style="display:inline-block;padding:12px 20px;background:#161616;color:#f6f4ef;text-decoration:none;font-size:15px;">${escapeHtml(options.primaryButton.label)}</a>
       </p>`
  : "";

  const secondary = options.secondaryLink
    ? `<p style="margin:8px 0 0;font-size:14px;"><a href="${escapeHtml(options.secondaryLink.href)}" style="color:#161616;">${escapeHtml(options.secondaryLink.label)}</a></p>`
    : "";

  const footnote = options.footnote
    ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#5e5a53;">${escapeHtml(options.footnote)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:24px 16px;background:#e8e4dc;font-family:Georgia,'Times New Roman',serif;">
  <span style="display:none;max-height:0;overflow:hidden;">${preheader}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;">
    <tr>
      <td style="background:#f6f4ef;border:1px solid #161616;padding:28px 24px 32px;color:#161616;">
        <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#5e5a53;">Усадебки</p>
        <h1 style="margin:0 0 12px;font-size:22px;font-weight:600;line-height:1.3;">${title}</h1>
        ${lead ? `<p style="margin:0 0 20px;font-size:15px;line-height:1.55;">${lead}</p>` : ""}
        ${quote}
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>
        ${button}
        ${secondary}
        ${footnote}
      </td>
    </tr>
  </table>
</body>
</html>`;
}