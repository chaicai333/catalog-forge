import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../models/shop.server";
import prisma from "../db.server";
import { localStorageAdapter } from "../storage.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);

  const jobId = params.jobId;
  const type = params.type;

  if (!jobId || !type) {
    throw new Response("jobId and type required", { status: 400 });
  }

  const file = await prisma.jobFile.findFirst({
    where: {
      jobId,
      job: { shopId: shop.id },
      type: type as "PDF" | "IMAGES_ZIP" | "MANIFEST"
    },
    include: { job: true }
  });

  if (!file) {
    throw new Response("File not found", { status: 404 });
  }

  const bytes = await localStorageAdapter.read(file.storageKey);
  return new Response(bytes, {
    headers: {
      "Content-Type": file.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename=\"${defaultFileName(
        type,
        file.job?.name ?? undefined
      )}\"`
    }
  });
}

function defaultFileName(type: string, jobName?: string | null) {
  const base = sanitizeFileName(jobName) ?? "catalog";
  if (type === "PDF") return `${base}.pdf`;
  if (type === "IMAGES_ZIP") return `${base}-images.zip`;
  if (type === "MANIFEST") return `${base}-manifest.json`;
  return `${base}-download`;
}

function sanitizeFileName(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  const slug = trimmed.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : null;
}
