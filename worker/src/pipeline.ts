import type { PrismaClient } from "@prisma/client";
import { Readable } from "node:stream";
import readline from "node:readline";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import archiver from "archiver";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, degrees, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import { localStorageAdapter, storageRoot } from "../../app/storage.server";
import { sessionStorage } from "../../app/shopify.server";

const bulkPollIntervalMs = 2000;
const bulkMaxWaitMs = 10 * 60 * 1000;
const retentionDays = 30;

type GraphqlClient = {
  query: (args: { data: { query: string; variables?: Record<string, unknown> } }) => Promise<any>;
};

type ExportSettings = {
  scopeType?: "ALL_PRODUCTS" | "COLLECTIONS" | "FILTERS";
  includeDrafts?: boolean;
  pricingMode?: "DEFAULT_VARIANT_PRICE" | "MIN_MAX_RANGE" | "VARIANT_TABLE";
  currencyPrefix?: string;
  layoutType?: "GRID" | "ONE_PER_PAGE";
  gridColumns?: 2 | 3 | 4;
  grouping?: "NONE" | "COLLECTION" | "VENDOR" | "PRODUCT_TYPE";
  sortOrder?: "COLLECTION_ORDER" | "TITLE_ASC" | "CREATED_DESC" | "UPDATED_DESC";
  pageSize?: "A4" | "LETTER";
  watermarkEnabled?: boolean;
  watermarkText?: string;
  watermarkOpacity?: "LIGHT" | "MEDIUM" | "HEAVY";
  priceOverlay?: {
    enabled?: boolean;
    rect?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    backgroundColor?: string;
    backgroundOpacity?: number;
    textColor?: string;
    currencyPrefix?: string;
  };
  productIds?: string[];
  collectionIds?: string[];
  filters?: {
    vendor?: string[];
    productType?: string[];
    tag?: string[];
  };
};

type ProductVariant = {
  id: string;
  title: string;
  price: string | null;
};

type ProductAccumulator = {
  id: string;
  title?: string | null;
  handle?: string | null;
  vendor?: string | null;
  productType?: string | null;
  status?: string | null;
  featuredImageUrl?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  collections: { id: string; title: string }[];
  imageUrls: string[];
  variants: ProductVariant[];
};

type ProductRecord = {
  productId: string;
  title: string | null;
  handle: string | null;
  vendor: string | null;
  productType: string | null;
  status: string | null;
  coverUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  collections: { id: string; title: string }[];
  localCoverPath?: string | null;
  coverFileName?: string | null;
  price:
    | string
    | { min: string; max: string }
    | { variants: { title: string; price: string | null }[] }
    | null;
};

export async function runCatalogJob(params: {
  prisma: PrismaClient;
  jobId: string;
}) {
  const job = await params.prisma.job.findUnique({
    where: { id: params.jobId },
    include: { shop: true }
  });

  if (!job) {
    throw new Error("Job not found");
  }

  const shopDomain = job.shop.domain;
  const settings = (job.settingsJson ?? {}) as ExportSettings;
  const logMeta = { jobId: job.id, shopDomain };

  const sessionId = `offline_${shopDomain}`;
  const session = await sessionStorage.loadSession(sessionId);
  if (!session) {
    throw new Error(`Missing offline session for ${shopDomain}`);
  }

  const client = createGraphqlClient(session.shop, session.accessToken);

  await params.prisma.job.update({
    where: { id: job.id },
    data: {
      status: "RUNNING",
      progressPercent: 5,
      currentStep: "Collecting products",
      startedAt: new Date(),
      errorSummary: null
    }
  });

  const query = buildBulkQuery(settings);
  let products: ProductAccumulator[] = [];

  try {
    console.info("bulk_start", logMeta);
    const bulkId = await startBulkOperation(client, query);
    const resultUrl = await waitForBulkResult(client, bulkId);
    products = await parseBulkResults(resultUrl);
    console.info("bulk_complete", { ...logMeta, products: products.length });
  } catch (error) {
    console.warn("bulk_failed", { ...logMeta, error: String(error) });
    await params.prisma.job.update({
      where: { id: job.id },
      data: {
        currentStep: "Collecting products (fallback)"
      }
    });
    products = await fetchProductsPaginated(client, settings);
    console.info("fallback_complete", { ...logMeta, products: products.length });
  }
  const records = products.map((product) => buildProductRecord(product, settings));
  const sortedRecords = sortRecords(records, settings);

  await params.prisma.job.update({
    where: { id: job.id },
    data: {
      countsJson: {
        productsTotal: sortedRecords.length,
        productsProcessed: 0
      },
      progressPercent: 35,
      currentStep: "Downloading cover images"
    }
  });

  const imageResult = await downloadCovers({
    records: sortedRecords,
    jobId: job.id,
    prisma: params.prisma
  });
  console.info("images_complete", {
    ...logMeta,
    total: sortedRecords.length,
    failures: imageResult.hasFailures
  });

  const manifest = {
    jobId: job.id,
    shopDomain,
    generatedAt: new Date().toISOString(),
    settings,
    products: imageResult.records
  };

  const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2));
  const manifestPath = `jobs/${job.id}/manifest.json`;
  const stored = await localStorageAdapter.write(manifestPath, manifestBuffer);

  const manifestFile = await params.prisma.jobFile.create({
    data: {
      jobId: job.id,
      type: "MANIFEST",
      storageKey: stored.key,
      contentType: "application/json",
      sizeBytes: manifestBuffer.length,
      expiresAt: addDays(new Date(), retentionDays)
    }
  });

  await params.prisma.job.update({
    where: { id: job.id },
    data: {
      progressPercent: 70,
      currentStep: "Building PDF"
    }
  });

  const pdfPath = await buildPdf({
    jobId: job.id,
    records: imageResult.records,
    settings
  });
  console.info("pdf_complete", { ...logMeta, sizeBytes: pdfPath.sizeBytes });

  await params.prisma.jobFile.create({
    data: {
      jobId: job.id,
      type: "PDF",
      storageKey: pdfPath.storageKey,
      contentType: "application/pdf",
      sizeBytes: pdfPath.sizeBytes,
      expiresAt: addDays(new Date(), retentionDays)
    }
  });

  await params.prisma.job.update({
    where: { id: job.id },
    data: {
      progressPercent: 85,
      currentStep: "Packaging ZIP"
    }
  });

  const zipPath = await buildImagesZip({
    jobId: job.id,
    records: imageResult.records,
    manifestKey: manifestFile.storageKey,
    settings
  });
  console.info("zip_complete", { ...logMeta, sizeBytes: zipPath.sizeBytes });

  await params.prisma.jobFile.create({
    data: {
      jobId: job.id,
      type: "IMAGES_ZIP",
      storageKey: zipPath.storageKey,
      contentType: "application/zip",
      sizeBytes: zipPath.sizeBytes,
      expiresAt: addDays(new Date(), retentionDays)
    }
  });

  await params.prisma.job.update({
    where: { id: job.id },
    data: {
      progressPercent: 100,
      currentStep: "Completed",
      status: imageResult.hasFailures ? "PARTIAL" : "COMPLETED",
      finishedAt: new Date()
    }
  });
}

function buildBulkQuery(settings: ExportSettings) {
  const includeDrafts = settings.includeDrafts ?? false;
  const scopeQuery = buildProductQuery(settings, includeDrafts);

  return `{
    products(query: "${scopeQuery}", first: 250) {
      edges {
        node {
          id
          title
          handle
          vendor
          productType
          status
          createdAt
          updatedAt
          featuredImage { url }
          images(first: 1) {
            nodes { url }
          }
          ${shouldIncludeCollections(settings) ? "collections(first: 10) { edges { node { id title } } }" : ""}
          variants(first: 250) {
            edges {
              node { id title price }
            }
          }
        }
      }
    }
  }`;
}

function buildProductQuery(settings: ExportSettings, includeDrafts: boolean) {
  const clauses: string[] = [];
  if (includeDrafts) {
    clauses.push("(status:active OR status:draft)");
  } else {
    clauses.push("status:active");
  }

  if (settings.scopeType === "COLLECTIONS" && settings.collectionIds?.length) {
    const ids = settings.collectionIds.map((id) => `collection_id:${escapeQuery(id)}`);
    clauses.push(`(${ids.join(" OR ")})`);
  }

  if (settings.scopeType === "PRODUCTS" && settings.productIds?.length) {
    const ids = settings.productIds.map((id) => {
      const legacy = extractLegacyProductId(id);
      return `id:${legacy ?? escapeQuery(id)}`;
    });
    clauses.push(`(${ids.join(" OR ")})`);
  }

  if (settings.scopeType === "FILTERS" && settings.filters) {
    const vendor = buildOrClause("vendor", settings.filters.vendor);
    if (vendor) clauses.push(vendor);
    const productType = buildOrClause("product_type", settings.filters.productType);
    if (productType) clauses.push(productType);
    const tag = buildOrClause("tag", settings.filters.tag);
    if (tag) clauses.push(tag);
  }

  return clauses.join(" AND ");
}

function buildOrClause(field: string, values?: string[]) {
  if (!values || values.length === 0) {
    return null;
  }
  const escaped = values.map((value) => `${field}:\"${escapeQuery(value)}\"`);
  return `(${escaped.join(" OR ")})`;
}

function escapeQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\"/g, "\\\"");
}

function extractLegacyProductId(value: string) {
  const match = /gid:\/\/shopify\/Product\/(\d+)/.exec(value);
  return match?.[1] ?? null;
}

async function startBulkOperation(
  client: GraphqlClient,
  query: string
) {
  const mutation = `mutation {
    bulkOperationRunQuery(
      query: """
${query}
"""
    ) {
      bulkOperation { id status }
      userErrors { field message }
    }
  }`;

  const response = await client.query({ data: { query: mutation } });
  const payload = response.body?.data?.bulkOperationRunQuery;
  if (!payload || payload.userErrors?.length) {
    const message = payload?.userErrors?.map((error: { message: string }) => error.message).join(", ");
    throw new Error(message || "Bulk operation failed to start");
  }

  return payload.bulkOperation.id as string;
}

async function waitForBulkResult(
  client: GraphqlClient,
  bulkId: string
) {
  const startedAt = Date.now();
  for (;;) {
    if (Date.now() - startedAt > bulkMaxWaitMs) {
      throw new Error("Bulk operation timed out");
    }
    const response = await client.query({
      data: {
        query: `{
          node(id: "${bulkId}") {
            ... on BulkOperation {
              id
              status
              errorCode
              url
            }
          }
        }`
      }
    });

    const node = response.body?.data?.node;
    if (!node) {
      throw new Error("Bulk operation missing");
    }

    if (node.status === "COMPLETED" && node.url) {
      return node.url as string;
    }

    if (node.status === "FAILED" || node.status === "CANCELED") {
      throw new Error(`Bulk operation ${node.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, bulkPollIntervalMs));
  }
}

async function parseBulkResults(url: string) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error("Failed to download bulk results");
  }

  const stream = Readable.fromWeb(response.body as unknown as ReadableStream);
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const products = new Map<string, ProductAccumulator>();

  for await (const line of rl) {
    if (!line) continue;
    const record = JSON.parse(line) as Record<string, unknown>;
    const parentId = record.__parentId as string | undefined;

    if (!parentId && record.id) {
      const id = record.id as string;
      const product = products.get(id) ?? {
        id,
        collections: [],
        imageUrls: [],
        variants: []
      };
      product.title = (record.title as string) ?? null;
      product.handle = (record.handle as string) ?? null;
      product.vendor = (record.vendor as string) ?? null;
      product.productType = (record.productType as string) ?? null;
      product.status = (record.status as string) ?? null;
      product.createdAt = (record.createdAt as string) ?? null;
      product.updatedAt = (record.updatedAt as string) ?? null;
      const featured = record.featuredImage as { url?: string } | null;
      product.featuredImageUrl = featured?.url ?? null;
      const images = record.images as { nodes?: { url?: string }[] } | null;
      const firstImageUrl = images?.nodes?.[0]?.url;
      if (firstImageUrl) {
        product.imageUrls.push(firstImageUrl);
      }
      products.set(id, product);
      continue;
    }

    if (parentId && record.price !== undefined) {
      const product = products.get(parentId) ?? {
        id: parentId,
        collections: [],
        imageUrls: [],
        variants: []
      };
      product.variants.push({
        id: record.id as string,
        title: (record.title as string) ?? "",
        price: (record.price as string) ?? null
      });
      products.set(parentId, product);
      continue;
    }

    if (parentId && record.url) {
      const product = products.get(parentId) ?? {
        id: parentId,
        collections: [],
        imageUrls: [],
        variants: []
      };
      product.imageUrls.push(record.url as string);
      products.set(parentId, product);
    }

    if (parentId && record.title && record.id && String(record.id).includes("Collection")) {
      const product = products.get(parentId) ?? {
        id: parentId,
        collections: [],
        imageUrls: [],
        variants: []
      };
      product.collections.push({
        id: record.id as string,
        title: record.title as string
      });
      products.set(parentId, product);
    }
  }

  return Array.from(products.values());
}

async function fetchProductsPaginated(
  client: GraphqlClient,
  settings: ExportSettings
) {
  const includeDrafts = settings.includeDrafts ?? false;
  const scopeQuery = buildProductQuery(settings, includeDrafts);
  const products: ProductAccumulator[] = [];
  let cursor: string | null = null;
  let hasNext = true;

  while (hasNext) {
    const response = await client.query({
      data: {
        query: `query Products($cursor: String) {
          products(first: 250, query: "${scopeQuery}", after: $cursor) {
            pageInfo { hasNextPage }
            edges {
              cursor
              node {
                id
                title
                handle
                vendor
                productType
                status
                createdAt
                updatedAt
                featuredImage { url }
                images(first: 1) { nodes { url } }
                ${shouldIncludeCollections(settings) ? "collections(first: 10) { nodes { id title } }" : ""}
                variants(first: 250) { nodes { id title price } }
              }
            }
          }
        }`,
        variables: { cursor }
      }
    });

    const payload = response.body?.data?.products;
    if (!payload) {
      break;
    }

    for (const edge of payload.edges) {
      const node = edge.node;
      const accumulator: ProductAccumulator = {
        id: node.id,
        title: node.title ?? null,
        handle: node.handle ?? null,
        vendor: node.vendor ?? null,
        productType: node.productType ?? null,
        status: node.status ?? null,
        createdAt: node.createdAt ?? null,
        updatedAt: node.updatedAt ?? null,
        featuredImageUrl: node.featuredImage?.url ?? null,
        imageUrls: node.images?.nodes?.map((image: { url?: string }) => image.url).filter(Boolean) ?? [],
        variants: node.variants?.nodes?.map((variant: { id: string; title: string; price: string }) => ({
          id: variant.id,
          title: variant.title,
          price: variant.price ?? null
        })) ?? [],
        collections: node.collections?.nodes?.map((collection: { id: string; title: string }) => ({
          id: collection.id,
          title: collection.title
        })) ?? []
      };
      products.push(accumulator);
      cursor = edge.cursor;
    }

    hasNext = payload.pageInfo?.hasNextPage ?? false;
  }

  return products;
}

function buildProductRecord(product: ProductAccumulator, settings: ExportSettings): ProductRecord {
  const pricingMode = settings.pricingMode ?? "DEFAULT_VARIANT_PRICE";
  const variants = product.variants;
  const defaultVariant = variants[0];

  let price: ProductRecord["price"] = null;
  if (pricingMode === "DEFAULT_VARIANT_PRICE") {
    price = defaultVariant?.price ?? null;
  } else if (pricingMode === "MIN_MAX_RANGE") {
    const prices = variants.map((variant) => variant.price).filter(Boolean) as string[];
    if (prices.length > 0) {
      const numeric = prices.map((value) => Number(value));
      const min = Math.min(...numeric);
      const max = Math.max(...numeric);
      price = { min: String(min), max: String(max) };
    }
  } else if (pricingMode === "VARIANT_TABLE") {
    price = {
      variants: variants.map((variant) => ({
        title: variant.title,
        price: variant.price
      }))
    };
  }

  const coverUrl = product.featuredImageUrl ?? product.imageUrls[0] ?? null;

  return {
    productId: product.id,
    title: product.title ?? null,
    handle: product.handle ?? null,
    vendor: product.vendor ?? null,
    productType: product.productType ?? null,
    status: product.status ?? null,
    createdAt: product.createdAt ?? null,
    updatedAt: product.updatedAt ?? null,
    collections: product.collections ?? [],
    coverUrl,
    price
  };
}

function sortRecords(records: ProductRecord[], settings: ExportSettings) {
  const sortOrder = settings.sortOrder ?? "TITLE_ASC";
  const sorted = [...records];
  if (sortOrder === "TITLE_ASC") {
    sorted.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? ""));
  } else if (sortOrder === "CREATED_DESC") {
    sorted.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  } else if (sortOrder === "UPDATED_DESC") {
    sorted.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }
  return sorted;
}

function shouldIncludeCollections(settings: ExportSettings) {
  return settings.grouping === "COLLECTION" || settings.scopeType === "COLLECTIONS";
}

async function downloadCovers(params: {
  records: ProductRecord[];
  jobId: string;
  prisma: PrismaClient;
}) {
  const concurrency = 5;
  const queue = [...params.records];
  let hasFailures = false;

  await params.prisma.job.update({
    where: { id: params.jobId },
    data: {
      countsJson: {
        productsTotal: params.records.length,
        productsProcessed: 0,
        imagesDownloaded: 0,
        imagesFailed: 0
      }
    }
  });

  const workers = Array.from({ length: concurrency }).map(async () => {
    while (queue.length) {
      const record = queue.shift();
      if (!record) break;

      if (!record.coverUrl) {
        hasFailures = true;
        await createIssue(params.prisma, params.jobId, {
          type: "MISSING_COVER",
          productId: record.productId,
          productHandle: record.handle ?? undefined,
          details: { reason: "No cover image found" }
        });
        await incrementCounts(params.prisma, params.jobId, {
          imagesFailed: 1,
          productsProcessed: 1
        });
        continue;
      }

      const result = await downloadWithRetry(record.coverUrl, 3);
      if (!result) {
        hasFailures = true;
        await createIssue(params.prisma, params.jobId, {
          type: "IMAGE_DOWNLOAD_FAILED",
          productId: record.productId,
          productHandle: record.handle ?? undefined,
          details: { url: record.coverUrl }
        });
        await incrementCounts(params.prisma, params.jobId, {
          imagesFailed: 1,
          productsProcessed: 1
        });
        continue;
      }

      const extension = result.extension ?? "jpg";
      const safeHandle = record.handle ?? record.productId;
      const relativePath = `jobs/${params.jobId}/images/products/${safeHandle}/cover.${extension}`;
      await localStorageAdapter.write(relativePath, result.bytes);
      record.localCoverPath = relativePath;
      record.coverFileName = `images/${safeHandle}.${extension}`;

      await incrementCounts(params.prisma, params.jobId, {
        imagesDownloaded: 1,
        productsProcessed: 1
      });
    }
  });

  await Promise.all(workers);
  return { records: params.records, hasFailures };
}

async function downloadWithRetry(url: string, attempts: number) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        continue;
      }
      const contentType = response.headers.get("content-type") ?? "";
      const extension =
        contentType.includes("png") ? "png" : contentType.includes("jpeg") ? "jpg" : undefined;
      const bytes = new Uint8Array(await response.arrayBuffer());
      return { bytes, extension };
    } catch {
      if (attempt === attempts - 1) {
        return null;
      }
    }
  }
  return null;
}

async function createIssue(
  prisma: PrismaClient,
  jobId: string,
  params: {
    type: "MISSING_COVER" | "IMAGE_DOWNLOAD_FAILED";
    productId: string;
    productHandle?: string;
    details?: Record<string, unknown>;
  }
) {
  await prisma.jobIssue.create({
    data: {
      jobId,
      severity: "WARN",
      type: params.type,
      productId: params.productId,
      productHandle: params.productHandle ?? null,
      detailsJson: params.details ?? null
    }
  });
}

async function incrementCounts(
  prisma: PrismaClient,
  jobId: string,
  delta: { productsProcessed?: number; imagesDownloaded?: number; imagesFailed?: number }
) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  const counts = (job?.countsJson as Record<string, number> | null) ?? {};
  const updated = {
    productsTotal: counts.productsTotal ?? 0,
    productsProcessed: (counts.productsProcessed ?? 0) + (delta.productsProcessed ?? 0),
    imagesDownloaded: (counts.imagesDownloaded ?? 0) + (delta.imagesDownloaded ?? 0),
    imagesFailed: (counts.imagesFailed ?? 0) + (delta.imagesFailed ?? 0)
  };
  await prisma.job.update({
    where: { id: jobId },
    data: { countsJson: updated }
  });
}

async function buildImagesZip(params: {
  jobId: string;
  records: ProductRecord[];
  manifestKey?: string;
  settings: ExportSettings;
}) {
  const zipRelative = `jobs/${params.jobId}/images.zip`;
  const zipAbsolute = path.resolve(storageRoot, zipRelative);
  await fsPromises.mkdir(path.dirname(zipAbsolute), { recursive: true });

  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = fs.createWriteStream(zipAbsolute);

  const completion = new Promise<void>((resolve, reject) => {
    stream.on("close", resolve);
    archive.on("error", reject);
  });

  archive.pipe(stream);

  for (const record of params.records) {
    if (!record.localCoverPath || !record.coverFileName) {
      continue;
    }
    try {
      const sourceBytes = await localStorageAdapter.read(record.localCoverPath);
      const priceText = formatPrice(
        record.price,
        params.settings.priceOverlay?.currencyPrefix ?? params.settings.currencyPrefix
      );
      const extension = path.extname(record.localCoverPath);
      const outputBytes = await applyPriceOverlay({
        bytes: sourceBytes,
        priceText,
        extension,
        overlay: params.settings.priceOverlay
      });
      archive.append(outputBytes, { name: record.coverFileName });
    } catch (error) {
      console.warn("zip_image_failed", {
        jobId: params.jobId,
        productId: record.productId,
        error: String(error)
      });
    }
  }

  if (params.manifestKey) {
    const manifestAbsolute = path.resolve(storageRoot, params.manifestKey);
    try {
      archive.file(manifestAbsolute, { name: "manifest.json" });
    } catch {
      // Skip manifest if missing.
    }
  }

  archive.append("CatalogForge - cover images only.\n", { name: "README.txt" });
  await archive.finalize();
  await completion;
  const stats = await fsPromises.stat(zipAbsolute);
  return { storageKey: zipRelative, sizeBytes: Number(stats.size) };
}

async function applyPriceOverlay(params: {
  bytes: Uint8Array;
  priceText: string | null;
  extension: string;
  overlay?: ExportSettings["priceOverlay"];
}) {
  if (!params.priceText || !params.overlay?.enabled) {
    return params.bytes;
  }

  const image = sharp(params.bytes, { failOn: "none" });
  const metadata = await image.metadata();
  const width = metadata.width ?? 800;
  const height = metadata.height ?? 800;
  const resolved = resolveOverlayStyle(params.overlay, width, height);
  const baseFontSize = Math.round(Math.max(12, resolved.height * 0.5));
  const fontSize = fitFontSize(params.priceText, baseFontSize, resolved.width);
  const svg = buildPriceOverlaySvg({
    width,
    height,
    overlayX: resolved.x,
    overlayY: resolved.y,
    overlayWidth: resolved.width,
    overlayHeight: resolved.height,
    fontSize,
    priceText: params.priceText,
    backgroundColor: resolved.backgroundColor,
    backgroundOpacity: resolved.backgroundOpacity,
    textColor: resolved.textColor
  });

  const composite = image.composite([{ input: Buffer.from(svg) }]);
  if (params.extension.toLowerCase() === ".png") {
    return composite.png().toBuffer();
  }
  return composite.jpeg({ quality: 90 }).toBuffer();
}

function resolveOverlayStyle(
  overlay: ExportSettings["priceOverlay"],
  imageWidth: number,
  imageHeight: number
) {
  const rect = overlay?.rect;
  const widthRatio = clamp01(rect?.width ?? 0.88);
  const heightRatio = clamp01(rect?.height ?? 0.2);
  const xRatio = clamp01(rect?.x ?? 0.06);
  const yRatio = clamp01(rect?.y ?? 0.74);

  const width = Math.round(imageWidth * widthRatio);
  const height = Math.round(imageHeight * heightRatio);
  const x = Math.round(Math.min(Math.max(0, imageWidth * xRatio), imageWidth - width));
  const y = Math.round(Math.min(Math.max(0, imageHeight * yRatio), imageHeight - height));

  return {
    x,
    y,
    width,
    height,
    backgroundColor: overlay?.backgroundColor ?? "#000000",
    backgroundOpacity: clamp01(overlay?.backgroundOpacity ?? 0.55),
    textColor: overlay?.textColor ?? "#ffffff"
  };
}

function buildPriceOverlaySvg(params: {
  width: number;
  height: number;
  overlayX: number;
  overlayY: number;
  overlayWidth: number;
  overlayHeight: number;
  fontSize: number;
  priceText: string;
  backgroundColor: string;
  backgroundOpacity: number;
  textColor: string;
}) {
  const safeText = escapeSvgText(params.priceText);
  const rgb = hexToRgb(params.backgroundColor) ?? { r: 0, g: 0, b: 0 };
  const overlayFill = `rgba(${rgb.r},${rgb.g},${rgb.b},${params.backgroundOpacity})`;
  const textColor = escapeSvgText(params.textColor);
  const textX = params.overlayX + params.overlayWidth / 2;
  const textY = params.overlayY + params.overlayHeight / 2;
  const textMaxWidth = Math.max(10, Math.round(params.overlayWidth * 0.9));
  const clipId = "price-clip";

  return `<svg width="${params.width}" height="${params.height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="${clipId}">
      <rect x="${params.overlayX}" y="${params.overlayY}" width="${params.overlayWidth}" height="${params.overlayHeight}" />
    </clipPath>
  </defs>
  <rect x="${params.overlayX}" y="${params.overlayY}" width="${params.overlayWidth}" height="${params.overlayHeight}" fill="${overlayFill}" />
  <text x="${textX}" y="${textY}" dominant-baseline="middle" text-anchor="middle"
    font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="${params.fontSize}" font-weight="600" fill="${textColor}"
    textLength="${textMaxWidth}" lengthAdjust="spacingAndGlyphs" clip-path="url(#${clipId})">
    ${safeText}
  </text>
</svg>`;
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/\'/g, "&apos;");
}

function hexToRgb(hex: string) {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(normalized)) {
    return null;
  }
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;
  const intVal = Number.parseInt(expanded, 16);
  return {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255
  };
}

function clamp01(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function fitFontSize(text: string, baseFontSize: number, maxWidth: number) {
  const length = text.length || 1;
  const estimatedWidth = baseFontSize * length * 0.6;
  if (estimatedWidth <= maxWidth) {
    return baseFontSize;
  }
  const scaled = Math.floor(baseFontSize * (maxWidth / estimatedWidth));
  return Math.max(10, scaled);
}

async function buildPdf(params: {
  jobId: string;
  records: ProductRecord[];
  settings: ExportSettings;
}) {
  const pdf = await PDFDocument.create();
  let font = await pdf.embedFont(StandardFonts.Helvetica);
  try {
    const fontPath = path.resolve(process.cwd(), "worker/assets/DejaVuSans.ttf");
    const fontBytes = await fsPromises.readFile(fontPath);
    pdf.registerFontkit(fontkit);
    font = await pdf.embedFont(fontBytes);
  } catch (error) {
    console.warn("custom_font_failed", { error: String(error) });
  }

  const pageSize = params.settings.pageSize ?? "A4";
  const [pageWidth, pageHeight] = pageSize === "LETTER" ? [612, 792] : [595, 842];
  const currencyPrefix = params.settings.currencyPrefix;

  const layout = params.settings.layoutType ?? "GRID";
  const columns = params.settings.gridColumns ?? 3;
  const groupedItems = buildGroupedItems(params.records, params.settings);
  const watermark = params.settings.watermarkEnabled
    ? {
        text: params.settings.watermarkText ?? "",
        opacity:
          params.settings.watermarkOpacity === "HEAVY"
            ? 0.35
            : params.settings.watermarkOpacity === "MEDIUM"
            ? 0.2
            : 0.12
      }
    : null;

  if (layout === "ONE_PER_PAGE") {
    for (const item of groupedItems) {
      const page = pdf.addPage([pageWidth, pageHeight]);
      drawWatermark(page, watermark, pageWidth, pageHeight, font);
      if (item.kind === "header") {
        drawHeaderPage(page, item.title, font, pageWidth, pageHeight);
        continue;
      }
      await drawOnePerPage({
        pdf,
        page,
        record: item.record,
        font,
        pageWidth,
        pageHeight,
        jobId: params.jobId,
        currencyPrefix
      });
    }
  } else {
    const rows = 3;
    const cellWidth = pageWidth / columns;
    const cellHeight = pageHeight / rows;
    let index = 0;
    while (index < groupedItems.length) {
      const page = pdf.addPage([pageWidth, pageHeight]);
      drawWatermark(page, watermark, pageWidth, pageHeight, font);
      if (groupedItems[index]?.kind === "header") {
        const header = groupedItems[index];
        drawHeaderPage(page, header.title, font, pageWidth, pageHeight);
        index += 1;
        continue;
      }
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < columns; col += 1) {
          if (index >= groupedItems.length) break;
          const item = groupedItems[index];
          if (item.kind === "header") {
            break;
          }
          const record = item.record;
          const x = col * cellWidth;
          const y = pageHeight - (row + 1) * cellHeight;
          await drawGridCell({
            pdf,
            page,
            record,
            font,
            x,
            y,
            width: cellWidth,
            height: cellHeight,
            jobId: params.jobId,
            currencyPrefix
          });
          index += 1;
        }
      }
    }
  }

  const pdfBytes = await pdf.save();
  const pdfPath = `jobs/${params.jobId}/catalog.pdf`;
  await localStorageAdapter.write(pdfPath, pdfBytes);
  return { storageKey: pdfPath, sizeBytes: pdfBytes.length };
}

function drawWatermark(
  page: ReturnType<PDFDocument["addPage"]>,
  watermark: { text: string; opacity: number } | null,
  width: number,
  height: number,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>
) {
  if (!watermark || !watermark.text) {
    return;
  }
  page.drawText(watermark.text, {
    x: width * 0.1,
    y: height * 0.5,
    size: 48,
    font,
    color: rgb(0.6, 0.6, 0.6),
    rotate: degrees(-35),
    opacity: watermark.opacity
  });
}

function drawHeaderPage(
  page: ReturnType<PDFDocument["addPage"]>,
  title: string,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  pageWidth: number,
  pageHeight: number
) {
  page.drawText(title, {
    x: 48,
    y: pageHeight / 2,
    size: 28,
    font,
    color: rgb(0.15, 0.15, 0.15)
  });
}

async function drawOnePerPage(params: {
  pdf: PDFDocument;
  page: ReturnType<PDFDocument["addPage"]>;
  record: ProductRecord;
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  pageWidth: number;
  pageHeight: number;
  jobId: string;
  currencyPrefix?: string;
}) {
  const { page, record, font, pageWidth, pageHeight } = params;
  const margin = 40;
  const imageHeight = pageHeight * 0.55;
  const textY = pageHeight - imageHeight - 80;

  await drawImageOrPlaceholder({
    pdf: params.pdf,
    page,
    record,
    x: margin,
    y: pageHeight - imageHeight - margin,
    width: pageWidth - margin * 2,
    height: imageHeight
  });

  page.drawText(record.title ?? "Untitled", {
    x: margin,
    y: textY,
    size: 18,
    font,
    color: rgb(0.1, 0.1, 0.1)
  });

  const price = record.price;
  if (price && typeof price === "object" && "variants" in price) {
    const headerY = textY - 28;
    page.drawText("Variants", {
      x: margin,
      y: headerY,
      size: 12,
      font,
      color: rgb(0.2, 0.2, 0.2)
    });
    const rows = price.variants.slice(0, 8);
    let rowY = headerY - 18;
    for (const variant of rows) {
      const priceText = formatPriceValue(variant.price, params.currencyPrefix);
      page.drawText(variant.title || "Variant", {
        x: margin,
        y: rowY,
        size: 10,
        font,
        color: rgb(0.2, 0.2, 0.2)
      });
      if (priceText) {
        const priceWidth = font.widthOfTextAtSize(priceText, 10);
        page.drawText(priceText, {
          x: pageWidth - margin - priceWidth,
          y: rowY,
          size: 10,
          font,
          color: rgb(0.2, 0.2, 0.2)
        });
      }
      rowY -= 14;
    }
    if (price.variants.length > rows.length) {
      page.drawText(`+${price.variants.length - rows.length} more variants`, {
        x: margin,
        y: rowY,
        size: 9,
        font,
        color: rgb(0.5, 0.5, 0.5)
      });
    }
  } else {
    const priceText = formatPrice(price, params.currencyPrefix);
    if (priceText) {
      page.drawText(priceText, {
        x: margin,
        y: textY - 28,
        size: 14,
        font,
        color: rgb(0.2, 0.2, 0.2)
      });
    }
  }
}

async function drawGridCell(params: {
  pdf: PDFDocument;
  page: ReturnType<PDFDocument["addPage"]>;
  record: ProductRecord;
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  x: number;
  y: number;
  width: number;
  height: number;
  jobId: string;
  currencyPrefix?: string;
}) {
  const { page, record, font, x, y, width, height } = params;
  const padding = 12;
  const imageHeight = height * 0.6;

  await drawImageOrPlaceholder({
    pdf: params.pdf,
    page,
    record,
    x: x + padding,
    y: y + height - imageHeight - padding,
    width: width - padding * 2,
    height: imageHeight - padding
  });

  page.drawText(record.title ?? "Untitled", {
    x: x + padding,
    y: y + padding + 18,
    size: 10,
    font,
    color: rgb(0.1, 0.1, 0.1)
  });

  const price = record.price;
  if (price && typeof price === "object" && "variants" in price) {
    const rows = price.variants.slice(0, 2);
    let rowY = y + padding + 10;
    for (const variant of rows) {
      const priceText = formatPriceValue(variant.price, params.currencyPrefix);
      const label = variant.title || "Variant";
      page.drawText(label, {
        x: x + padding,
        y: rowY,
        size: 8,
        font,
        color: rgb(0.2, 0.2, 0.2)
      });
      if (priceText) {
        const priceWidth = font.widthOfTextAtSize(priceText, 8);
        page.drawText(priceText, {
          x: x + width - padding - priceWidth,
          y: rowY,
          size: 8,
          font,
          color: rgb(0.2, 0.2, 0.2)
        });
      }
      rowY -= 10;
    }
    if (price.variants.length > rows.length) {
      page.drawText(`+${price.variants.length - rows.length} more`, {
        x: x + padding,
        y: rowY,
        size: 7,
        font,
        color: rgb(0.5, 0.5, 0.5)
      });
    }
  } else {
    const priceText = formatPrice(price, params.currencyPrefix);
    if (priceText) {
      page.drawText(priceText, {
        x: x + padding,
        y: y + padding,
        size: 9,
        font,
        color: rgb(0.2, 0.2, 0.2)
      });
    }
  }
}

async function drawImageOrPlaceholder(params: {
  pdf: PDFDocument;
  page: ReturnType<PDFDocument["addPage"]>;
  record: ProductRecord;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const { record, page, x, y, width, height } = params;
  if (record.localCoverPath) {
  const absolute = path.resolve(storageRoot, record.localCoverPath);
  const bytes = await fsPromises.readFile(absolute);
    try {
      const image = record.localCoverPath.endsWith(".png")
        ? await params.pdf.embedPng(bytes)
        : await params.pdf.embedJpg(bytes);
      const dims = image.scaleToFit(width, height);
      page.drawImage(image, {
        x: x + (width - dims.width) / 2,
        y: y + (height - dims.height) / 2,
        width: dims.width,
        height: dims.height
      });
      return;
    } catch {
      // fall through to placeholder
    }
  }
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: rgb(0.7, 0.7, 0.7),
    borderWidth: 1,
    color: rgb(0.95, 0.95, 0.95)
  });
  page.drawText("No image", {
    x: x + 8,
    y: y + height / 2,
    size: 10,
    color: rgb(0.6, 0.6, 0.6)
  });
}

export function formatPrice(
  price: ProductRecord["price"],
  currencyPrefix?: string
): string | null {
  if (!price) return null;
  const prefix = currencyPrefix ?? "$";
  if (typeof price === "string") return `${prefix}${price}`;
  if ("min" in price && "max" in price) {
    return `${prefix}${price.min} - ${prefix}${price.max}`;
  }
  if ("variants" in price) {
    const first = price.variants[0];
    return first?.price ? `${prefix}${first.price}` : null;
  }
  return null;
}

function formatPriceValue(value: string | null, currencyPrefix?: string) {
  if (!value) return null;
  const prefix = currencyPrefix ?? "$";
  return `${prefix}${value}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildGroupedItems(records: ProductRecord[], settings: ExportSettings) {
  const grouping = settings.grouping ?? "NONE";
  if (grouping === "NONE") {
    return records.map((record) => ({ kind: "product" as const, record }));
  }

  const grouped = new Map<string, ProductRecord[]>();
  for (const record of records) {
    const key =
      grouping === "VENDOR"
        ? record.vendor ?? "Unassigned"
        : grouping === "PRODUCT_TYPE"
        ? record.productType ?? "Unassigned"
        : selectCollectionTitle(record, settings) ?? "Unassigned";
    const bucket = grouped.get(key) ?? [];
    bucket.push(record);
    grouped.set(key, bucket);
  }

  const items: { kind: "header"; title: string } | { kind: "product"; record: ProductRecord }[] =
    [];
  for (const [title, group] of grouped) {
    items.push({ kind: "header", title });
    for (const record of group) {
      items.push({ kind: "product", record });
    }
  }
  return items;
}

function createGraphqlClient(shop: string, accessToken: string): GraphqlClient {
  const apiVersion = "2025-01";
  const endpoint = `https://${shop}/admin/api/${apiVersion}/graphql.json`;

  return {
    async query({ data }) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken
        },
        body: JSON.stringify({
          query: data.query,
          variables: data.variables ?? {}
        })
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.errors?.[0]?.message ?? "GraphQL request failed");
      }
      return { body };
    }
  };
}

function selectCollectionTitle(record: ProductRecord, settings: ExportSettings) {
  if (!record.collections.length) {
    return null;
  }
  if (settings.collectionIds?.length) {
    const match = record.collections.find((collection) =>
      settings.collectionIds?.includes(collection.id)
    );
    if (match) {
      return match.title;
    }
  }
  return record.collections[0]?.title ?? null;
}
