import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../models/shop.server";
import { rerunJob } from "../models/jobs.server";
import { catalogQueue } from "../queue.server";

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);

  const jobId = params.jobId;
  if (!jobId) {
    return json({ error: "jobId required" }, { status: 400 });
  }

  const job = await rerunJob({ shopId: shop.id, jobId });
  if (!job) {
    return json({ error: "Job not found" }, { status: 404 });
  }

  await catalogQueue.add("export", {
    jobId: job.id,
    shopId: shop.id
  });

  return json({ jobId: job.id });
}
