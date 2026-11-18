/** Письма через Resend: редактору и подтверждение автору правки. */

import { renderMailHtml } from "./mail-layout";

export type InquiryMailAttachment = {
  filename: string;
  content: Buffer;
};

export type InquiryMailPayload = {
  topic: string;
  authorName: string;
  contact: string | null;
  message: string;
  estateName: string | null;
  estateSlug: string | null;
  pageUrl: string | null;
  suggestedPhotoUrl?: string | null;
  attachment?: InquiryMailAttachment | null;
};

type ResendBody = {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  reply_to?: string | string[];
  attachments?: Array<{ filename: string; content: string }>;
};

export function publicSiteOrigin() {
  const custom = process.env.SITE_URL?.trim().replace(/\/$/, "");
  if (custom && !/localhost|127\.0\.0\.1/i.test(custom)) return custom;
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (prod) return `https://${prod}`;
  // VERCEL_BRANCH_URL не используем — в письмах окажется одноразовый URL деплоя (…-hash-….vercel.app).
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

function defaultFrom() {
  return process.env.RESEND_FROM?.trim() || "onboarding@resend.dev";
}

async function sendResendEmail(body: ResendBody): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[mail] Пропуск: задайте RESEND_API_KEY в .env и перезапустите dev.");
    }
    return false;
  }
  if (!body.to.length) return false;

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, from: body.from || defaultFrom() }),
    });
  } catch (error) {
    console.error("[mail] Resend fetch:", error);
    return false;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`[mail] Resend ${response.status}: ${detail}`);
    return false;
  }
  return true;
}

export async function sendInquiryMail(payload: InquiryMailPayload): Promise<boolean> {
  const to = process.env.CONTACT_EMAIL?.trim();
  if (!to) return false;

  const origin = publicSiteOrigin();
  const subject =
    payload.topic === "photo"
      ? `Усадебки: неточное фото${payload.estateName ? ` — ${payload.estateName}` : ""}`
      : "Усадебки: сообщение с сайта";

  const estatePath = payload.estateSlug ? `${origin}/estates/${payload.estateSlug}` : null;

  const text = [
    payload.estateName ? `Усадьба: ${payload.estateName}` : null,
    estatePath ? `Страница: ${estatePath}` : null,
    payload.suggestedPhotoUrl ? `Ссылка на снимок: ${payload.suggestedPhotoUrl}` : null,
    `От: ${payload.authorName} <${payload.contact}>`,
    "",
    payload.message,
  ]
    .filter(Boolean)
    .join("\n");

  const html = renderMailHtml({
    preheader: "Новое сообщение с сайта",
    title: payload.topic === "photo" ? "Жалоба на снимок" : "Сообщение с сайта",
    lead: "Проверьте письмо и ответьте отправителю при необходимости.",
    rows: [
      ...(payload.estateName
        ? [
            {
              label: "Усадьба",
              value: payload.estateName,
              href: estatePath ?? undefined,
            },
          ]
        : []),
      { label: "От кого", value: `${payload.authorName} · ${payload.contact}` },
      ...(payload.suggestedPhotoUrl
        ? [{ label: "Ссылка на снимок", value: payload.suggestedPhotoUrl, href: payload.suggestedPhotoUrl }]
        : []),
      ...(payload.attachment ? [{ label: "Вложение", value: payload.attachment.filename }] : []),
    ],
    quote: payload.message,
    primaryButton: estatePath ? { label: "Открыть карточку", href: estatePath } : undefined,
  });

  return sendResendEmail({
    from: defaultFrom(),
    to: [to],
    reply_to: payload.contact ?? undefined,
    subject,
    text,
    html,
    attachments: payload.attachment
      ? [{ filename: payload.attachment.filename, content: payload.attachment.content.toString("base64") }]
      : undefined,
  });
}

export async function sendInquiryThanksMail(payload: {
  authorName: string;
  contact: string;
  topic: "photo" | "general";
}): Promise<boolean> {
  const subject = "Спасибо за поддержку проекта! — Усадебки";
  const lead =
    payload.topic === "photo"
      ? `${payload.authorName}, мы получили вашу заметку о снимке. Разберём и поправим карточку, если всё сойдётся.`
      : `${payload.authorName}, ваше сообщение дошло до редакции. Ответим на эту почту, если понадобится уточнение.`;

  const html = renderMailHtml({
    preheader: "Спасибо за поддержку проекта! :)",
    title: "Спасибо за поддержку проекта! :)",
    lead,
    footnote: "Это автоматическое письмо. Его можно не сохранять — мы уже всё записали.",
  });

  const text = `${lead}\n\nСпасибо за поддержку проекта! :)`;

  return sendResendEmail({
    from: defaultFrom(),
    to: [payload.contact],
    subject,
    text,
    html,
  });
}

export type ContributionMailPayload = {
  contributionId: string;
  authorName: string;
  contact: string | null;
  predicateLabel: string;
  textDisplay: string;
  estateName: string;
  estateSlug: string;
  sourceTitle: string;
  sourcePage: string | null;
  sourceUrl: string | null;
};

/** Письмо редактору: новая правка «уточнить» */
export async function sendContributionMail(payload: ContributionMailPayload): Promise<boolean> {
  const to = process.env.CONTACT_EMAIL?.trim();
  if (!to) return false;

  const origin = publicSiteOrigin();
  const estateUrl = `${origin}/estates/${payload.estateSlug}`;
  const adminUrl = `${origin}/admin`;
  const subject = `Усадебки: уточнение — ${payload.estateName}`;

  const sourceLine = [payload.sourceTitle, payload.sourcePage ? `с. ${payload.sourcePage}` : null]
    .filter(Boolean)
    .join(", ");

  const text = [
    "Новая правка ждёт модерации.",
    `Усадьба: ${payload.estateName}`,
    `Поле: ${payload.predicateLabel} → ${payload.textDisplay}`,
    `Источник: ${sourceLine}`,
    payload.sourceUrl ? payload.sourceUrl : null,
    `Автор: ${payload.authorName}`,
    payload.contact ? payload.contact : null,
    `Очередь: ${adminUrl}`,
    `Id: ${payload.contributionId}`,
  ]
    .filter(Boolean)
    .join("\n");

  const html = renderMailHtml({
    preheader: `Правка: ${payload.predicateLabel}`,
    title: "Новая правка на модерации",
    lead: "Кто-то уточнил карточку с указанием источника. Примите или отклоните в очереди.",
    rows: [
      { label: "Усадьба", value: payload.estateName, href: estateUrl },
      { label: "Поле", value: payload.predicateLabel },
      { label: "Значение", value: payload.textDisplay },
      { label: "Источник", value: sourceLine, href: payload.sourceUrl ?? undefined },
      {
        label: "Автор",
        value: payload.contact ? `${payload.authorName} · ${payload.contact}` : payload.authorName,
      },
      { label: "Id правки", value: payload.contributionId },
    ],
    primaryButton: { label: "Открыть очередь", href: adminUrl },
    secondaryLink: { label: "Карточка усадьбы", href: estateUrl },
  });

  return sendResendEmail({
    from: defaultFrom(),
    to: [to],
    reply_to: payload.contact?.includes("@") ? payload.contact : undefined,
    subject,
    text,
    html,
  });
}

/** Благодарность автору правки «уточнить» */
export async function sendContributionThanksMail(payload: {
  authorName: string;
  contact: string;
  estateName: string;
  estateSlug: string;
  predicateLabel: string;
}): Promise<boolean> {
  const origin = publicSiteOrigin();
  const estateUrl = `${origin}/estates/${payload.estateSlug}`;
  const subject = "Спасибо за поддержку проекта! — Усадебки";
  const lead = `${payload.authorName}, мы получили ваше уточнение «${payload.predicateLabel}» по усадьбе «${payload.estateName}». После проверки оно появится в карточке — мы напишем, если понадобится уточнение.`;

  const html = renderMailHtml({
    preheader: "Ваша правка в очереди на модерацию",
    title: "Спасибо за поддержку проекта! :)",
    lead,
    rows: [{ label: "Усадьба", value: payload.estateName, href: estateUrl }],
    footnote: "Каталог живёт благодаря таким заметкам. Ещё раз спасибо!",
    secondaryLink: { label: "Вернуться к карточке", href: estateUrl },
  });

  const text = `${lead}\n\n${estateUrl}\n\nСпасибо за поддержку проекта! :)`;

  return sendResendEmail({
    from: defaultFrom(),
    to: [payload.contact],
    subject,
    text,
    html,
  });
}

export function isMailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.CONTACT_EMAIL?.trim());
}