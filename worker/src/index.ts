import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Worker } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { runCatalogJob } from "./pipeline";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, "../..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const prisma = new PrismaClient();
const queueName = "catalogforge";
const connection = {
  host: process.env.REDIS_HOST ?? "127.0.0.1",
  port: Number(process.env.REDIS_PORT ?? 6379)
};

const worker = new Worker(
  queueName,
  async (job) => {
    const { jobId } = job.data as { jobId: string };
    if (!jobId) {
      throw new Error("Missing jobId");
    }
    await runCatalogJob({ prisma, jobId });
    return { ok: true };
  },
  { connection }
);

worker.on("failed", async (job, err) => {
  if (!job) {
    return;
  }
  await prisma.job.update({
    where: { id: job.data.jobId },
    data: {
      status: "FAILED",
      errorSummary: err.message,
      finishedAt: new Date()
    }
  });
});

process.on("SIGINT", async () => {
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
});
