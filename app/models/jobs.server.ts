import prisma from "../db.server";
import type { Prisma } from "@prisma/client";

export async function createJob(params: {
  shopId: string;
  name?: string | null;
  settings: Prisma.JsonValue;
  createdByUserId?: string | null;
}) {
  return prisma.job.create({
    data: {
      shopId: params.shopId,
      name: params.name ?? null,
      settingsJson: params.settings,
      createdByUserId: params.createdByUserId ?? null
    }
  });
}

export async function listJobs(params: {
  shopId: string;
  limit: number;
  cursor?: string | null;
}) {
  const jobs = await prisma.job.findMany({
    where: { shopId: params.shopId },
    orderBy: { createdAt: "desc" },
    take: params.limit + 1,
    ...(params.cursor
      ? { cursor: { id: params.cursor }, skip: 1 }
      : {})
  });

  const hasMore = jobs.length > params.limit;
  const items = hasMore ? jobs.slice(0, -1) : jobs;
  const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;

  return { items, nextCursor };
}

export async function getJobById(params: { shopId: string; jobId: string }) {
  return prisma.job.findFirst({
    where: { id: params.jobId, shopId: params.shopId },
    include: { files: true, issues: true }
  });
}

export async function rerunJob(params: { shopId: string; jobId: string }) {
  const job = await getJobById(params);
  if (!job) {
    return null;
  }

  return createJob({
    shopId: job.shopId,
    name: job.name,
    settings: job.settingsJson,
    createdByUserId: job.createdByUserId
  });
}
