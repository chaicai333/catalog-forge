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
    }
  });

  if (!file) {
    throw new Response("File not found", { status: 404 });
  }

  const bytes = await localStorageAdapter.read(file.storageKey);
  return new Response(bytes, {
    headers: {
      "Content-Type": file.contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename=\"${defaultFileName(type)}\"`
    }
  });
}

function defaultFileName(type: string) {
  if (type === "PDF") return "catalog.pdf";
  if (type === "IMAGES_ZIP") return "images.zip";
  if (type === "MANIFEST") return "manifest.json";
  return "download";
}
