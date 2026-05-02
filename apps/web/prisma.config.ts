import "dotenv/config";
import { defineConfig, env } from "prisma/config";

const databaseUrl = env("DATABASE_URL");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: databaseUrl === "file:./dev.db" ? "file:./prisma/dev.db" : databaseUrl
  }
});
