import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../models/shop.server";
import { getJobById } from "../models/jobs.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);

  const jobId = params.jobId;
  if (!jobId) {
    return json({ error: "jobId required" }, { status: 400 });
  }

  const job = await getJobById({ shopId: shop.id, jobId });
  if (!job) {
    return json({ error: "Job not found" }, { status: 404 });
  }

  return json(job);
}
