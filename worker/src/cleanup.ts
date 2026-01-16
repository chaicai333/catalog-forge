import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { storageRoot } from "../../app/storage.server";

const prisma = new PrismaClient();
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, "../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

async function main() {
  const now = new Date();
  const expired = await prisma.jobFile.findMany({
    where: {
      expiresAt: { lt: now }
    }
  });

  for (const file of expired) {
    const absolutePath = path.resolve(storageRoot, file.storageKey);
    try {
      await fs.unlink(absolutePath);
    } catch {
      // Ignore missing files.
    }
    await prisma.jobFile.delete({ where: { id: file.id } });
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error("cleanup_failed", error);
  await prisma.$disconnect();
  process.exit(1);
});
