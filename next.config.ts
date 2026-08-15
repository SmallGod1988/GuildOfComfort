import type { NextConfig } from "next";
import { readFileSync } from "fs";

// Версия вшивается в сборку, чтобы на работающем сервере можно было увидеть,
// какой именно код там крутится. Без этого «обновилось или нет» проверяется
// только по косвенным признакам.
const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    APP_VERSION: version,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
