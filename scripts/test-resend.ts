/**
 * Проверка Resend: npm run mail:test
 * Нужны CONTACT_EMAIL и RESEND_API_KEY в .env
 */
import { sendInquiryMail, isMailConfigured } from "../src/lib/mail";

async function main() {
  if (!isMailConfigured()) {
    console.error("В .env нет CONTACT_EMAIL или RESEND_API_KEY. Добавьте строки и перезапустите.");
    process.exit(1);
  }
  const ok = await sendInquiryMail({
    topic: "general",
    authorName: "mail:test",
    contact: process.env.CONTACT_EMAIL!.trim(),
    message: "Тестовое письмо из npm run mail:test",
    estateName: null,
    estateSlug: null,
    pageUrl: null,
  });
  console.log(ok ? "OK: Resend принял письмо — проверьте входящие и спам." : "Ошибка: смотрите строку [mail] Resend выше в логе.");
  process.exit(ok ? 0 : 1);
}

main();