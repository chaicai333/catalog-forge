import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../models/shop.server";
import { createJob, listJobs } from "../models/jobs.server";
import { catalogQueue } from "../queue.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 50);
  const cursor = url.searchParams.get("cursor");

  const result = await listJobs({
    shopId: shop.id,
    limit,
    cursor
  });

  return json({
    items: result.items,
    nextCursor: result.nextCursor
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);

  const payload = await request.json();
  const errors = validatePayload(payload);
  if (errors.length > 0) {
    return json({ errors }, { status: 400 });
  }

  const name = typeof payload?.exportName === "string" ? payload.exportName : null;

  const job = await createJob({
    shopId: shop.id,
    name,
    settings: payload
  });

  await catalogQueue.add("export", {
    jobId: job.id,
    shopId: shop.id
  });

  return json({ jobId: job.id });
}

function validatePayload(payload: unknown) {
  const errors: string[] = [];
  if (!payload || typeof payload !== "object") {
    return ["Invalid payload."];
  }
  const typed = payload as Record<string, unknown>;
  const scopeType = typed.scopeType;
  const grouping = typed.grouping;
  const layoutType = typed.layoutType;
  const gridColumns = typed.gridColumns;
  const watermarkEnabled = typed.watermarkEnabled;
  const watermarkText = typed.watermarkText;
  const currencyPrefix = typed.currencyPrefix;
  const variantRestrictions = typed.variantRestrictions;
  const priceOverlay = typed.priceOverlay as
    | {
        enabled?: boolean;
        rect?: { x: number; y: number; width: number; height: number };
        backgroundColor?: string;
        backgroundOpacity?: number;
        textColor?: string;
        currencyPrefix?: string;
      }
    | undefined;

  if (variantRestrictions !== undefined && (typeof variantRestrictions !== "object" || variantRestrictions === null)) {
    errors.push("Variant restrictions must be a valid object.");
  }

  if (grouping === "COLLECTION" && scopeType !== "COLLECTIONS") {
    errors.push("Grouping by collection requires scope type Collections.");
  }

  if (scopeType === "COLLECTIONS") {
    const collectionIds = typed.collectionIds;
    if (!Array.isArray(collectionIds) || collectionIds.length === 0) {
      errors.push("Select at least one collection.");
    }
  }

  if (scopeType === "PRODUCTS") {
    const productIds = typed.productIds;
    if (!Array.isArray(productIds) || productIds.length === 0) {
      errors.push("Select at least one product.");
    }
  }

  if (layoutType === "GRID") {
    if (![2, 3, 4].includes(Number(gridColumns))) {
      errors.push("Grid columns must be 2, 3, or 4.");
    }
  }

  if (watermarkEnabled && (!watermarkText || String(watermarkText).trim().length === 0)) {
    errors.push("Watermark text is required when watermark is enabled.");
  }

  if (
    currencyPrefix !== undefined &&
    (typeof currencyPrefix !== "string" || currencyPrefix.length > 5)
  ) {
    errors.push("Currency prefix must be 5 characters or fewer.");
  }

  if (priceOverlay?.enabled) {
    const rect = priceOverlay.rect;
    if (
      !rect ||
      !isValidRatio(rect.x) ||
      !isValidRatio(rect.y) ||
      !isValidRatio(rect.width) ||
      !isValidRatio(rect.height)
    ) {
      errors.push("Price overlay position is invalid.");
    }
    if (!isValidHexColor(priceOverlay.backgroundColor)) {
      errors.push("Price overlay background color must be a hex color.");
    }
    if (!isValidHexColor(priceOverlay.textColor)) {
      errors.push("Price overlay text color must be a hex color.");
    }
    if (
      priceOverlay.currencyPrefix !== undefined &&
      (typeof priceOverlay.currencyPrefix !== "string" || priceOverlay.currencyPrefix.length > 5)
    ) {
      errors.push("Price overlay currency prefix must be 5 characters or fewer.");
    }
    const opacity = priceOverlay.backgroundOpacity;
    if (typeof opacity !== "number" || Number.isNaN(opacity) || opacity < 0 || opacity > 1) {
      errors.push("Price overlay opacity must be between 0 and 1.");
    }
  }

  return errors;
}

function isValidRatio(value: unknown) {
  return typeof value === "number" && !Number.isNaN(value) && value >= 0 && value <= 1;
}

function isValidHexColor(value: unknown) {
  if (typeof value !== "string") return false;
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}
