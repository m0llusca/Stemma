import { PrismaClient } from "@prisma/client";
import { runPreparedDemoSeed } from "./demo-seed-bootstrap";
import { mutateDemoSeed } from "./demo-seed-mutation";

const prisma = new PrismaClient();

async function main() {
  await runPreparedDemoSeed(process.env, prisma, mutateDemoSeed);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
