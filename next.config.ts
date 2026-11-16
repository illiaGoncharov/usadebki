import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Каталог читает живую базу. Новый кэш Next запекал бы страницы без Postgres.
};

export default nextConfig;
