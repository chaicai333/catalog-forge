import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { isRouteErrorResponse, useFetcher, useLoaderData, useRouteError, useLocation } from "@remix-run/react";
import { useEffect, useState } from "react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  Page,
  Text,
  InlineStack,
  ProgressBar,
  Divider
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../models/shop.server";
import { getJobById } from "../models/jobs.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);
  const jobId = params.jobId;

  if (!jobId) {
    throw new Response("Job ID required", { status: 400 });
  }

  const job = await getJobById({ shopId: shop.id, jobId });
  if (!job) {
    throw new Response("Job not found", { status: 404 });
  }

  return json({ job });
};

export default function JobDetail() {
  const initial = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const rerunFetcher = useFetcher<{ jobId: string }>();
  const location = useLocation();
  type Job = typeof initial.job;
  const fetchedJob =
    fetcher.data && typeof fetcher.data === "object" && "id" in fetcher.data
      ? (fetcher.data as Job)
      : undefined;
  const jobData = fetchedJob ?? initial?.job;
  const [downloading, setDownloading] = useState<string | null>(null);
  const jobStatus = fetchedJob?.status ?? initial?.job?.status;

  useEffect(() => {
    if (!initial?.job) {
      return;
    }
    if (jobStatus && ["COMPLETED", "FAILED", "PARTIAL"].includes(jobStatus)) {
      return;
    }

    const timer = setInterval(() => {
      fetcher.load(`/api/jobs/${initial.job.id}${location.search}`);
    }, 4000);
    return () => clearInterval(timer);
  }, [fetcher, initial?.job?.id, jobStatus, location.search]);

  if (!jobData) {
    return (
      <Page title="Job detail">
        <Card>
          <BlockStack gap="200">
            <Text variant="headingMd" as="h2">
              Loading job...
            </Text>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  const job = jobData;
  const files = new Map(job.files.map((file) => [file.type, file]));
  const counts = (job.countsJson as Record<string, number> | null) ?? {};

  useEffect(() => {
    // No-op: keep hook for future polling adjustments.
  }, [job.id]);

  return (
    <Page title={job.name ?? "CatalogForge"}>
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="200">
            <InlineStack align="space-between">
              <Text variant="headingMd" as="h2">
                Status
              </Text>
              <Badge tone={badgeTone(job.status)}>{job.status}</Badge>
            </InlineStack>
            <ProgressBar progress={job.progressPercent ?? 0} />
            <Text as="p">{job.currentStep ?? "Queued"}</Text>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text variant="headingMd" as="h2">
              Outputs
            </Text>
            <InlineStack gap="200">
              <Button
                disabled={!files.get("PDF") || downloading === "PDF"}
                loading={downloading === "PDF"}
                onClick={() =>
                  handleDownload({
                    type: "PDF",
                    url: fileUrl(job.id, "PDF", location.search),
                    setDownloading
                  })
                }
              >
                Download PDF
              </Button>
              <Button
                disabled={!files.get("IMAGES_ZIP") || downloading === "IMAGES_ZIP"}
                loading={downloading === "IMAGES_ZIP"}
                onClick={() =>
                  handleDownload({
                    type: "IMAGES_ZIP",
                    url: fileUrl(job.id, "IMAGES_ZIP", location.search),
                    setDownloading
                  })
                }
              >
                Download images ZIP
              </Button>
              <Button
                disabled={!files.get("MANIFEST") || downloading === "MANIFEST"}
                loading={downloading === "MANIFEST"}
                onClick={() =>
                  handleDownload({
                    type: "MANIFEST",
                    url: fileUrl(job.id, "MANIFEST", location.search),
                    setDownloading
                  })
                }
              >
                Download manifest
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text variant="headingMd" as="h2">
              Counts
            </Text>
            <Text as="p">Products total: {counts.productsTotal ?? 0}</Text>
            <Text as="p">Products processed: {counts.productsProcessed ?? 0}</Text>
            <Text as="p">Images downloaded: {counts.imagesDownloaded ?? 0}</Text>
            <Text as="p">Images failed: {counts.imagesFailed ?? 0}</Text>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text variant="headingMd" as="h2">
              Issues
            </Text>
            {job.issues.length === 0 && <Text as="p">No issues reported.</Text>}
            {job.issues.map((issue) => (
              <BlockStack key={issue.id} gap="100">
                <Text as="p">
                  {issue.type} {issue.productHandle ? `(${issue.productHandle})` : ""}
                </Text>
                {issue.detailsJson && (
                  <Text as="p" tone="subdued">
                    {JSON.stringify(issue.detailsJson)}
                  </Text>
                )}
                <Divider />
              </BlockStack>
            ))}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text variant="headingMd" as="h2">
              Actions
            </Text>
            <Button
              onClick={() =>
                rerunFetcher.submit(null, {
                  method: "POST",
                  action: `/api/jobs/${job.id}/rerun`
                })
              }
            >
              Re-run with same settings
            </Button>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return (
      <Page title="Job detail error">
        <Card>
          <BlockStack gap="200">
            <Text variant="headingMd" as="h2">
              {error.status} {error.statusText}
            </Text>
            <Text as="p">{error.data}</Text>
          </BlockStack>
        </Card>
      </Page>
    );
  }

  return (
    <Page title="Job detail error">
      <Card>
        <BlockStack gap="200">
          <Text variant="headingMd" as="h2">
            Something went wrong
          </Text>
          <Text as="p">{error instanceof Error ? error.message : "Unknown error"}</Text>
        </BlockStack>
      </Card>
    </Page>
  );
}

function badgeTone(status: string) {
  if (status === "COMPLETED") return "success" as const;
  if (status === "FAILED") return "critical" as const;
  if (status === "PARTIAL") return "warning" as const;
  return "attention" as const;
}

function fileUrl(jobId: string, type: string, search: string) {
  if (!type) return undefined;
  const params = new URLSearchParams(search);
  if (!params.toString()) {
    return `/api/jobs/${jobId}/files/${type}/download`;
  }
  return `/api/jobs/${jobId}/files/${type}/download?${params.toString()}`;
}

async function handleDownload(params: {
  type: "PDF" | "IMAGES_ZIP" | "MANIFEST";
  url?: string;
  setDownloading: (value: string | null) => void;
}) {
  if (!params.url) {
    return;
  }
  params.setDownloading(params.type);
  try {
    const response = await fetch(params.url);
    if (!response.ok) {
      throw new Error("Download failed");
    }
    const blob = await response.blob();
    const fileName =
      parseFileName(response.headers.get("content-disposition")) ??
      defaultFileName(params.type);
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(href);
  } finally {
    params.setDownloading(null);
  }
}

function parseFileName(contentDisposition: string | null) {
  if (!contentDisposition) return null;
  const match = /filename=\"?([^\";]+)\"?/i.exec(contentDisposition);
  return match?.[1] ?? null;
}

function defaultFileName(type: "PDF" | "IMAGES_ZIP" | "MANIFEST") {
  if (type === "PDF") return "catalog.pdf";
  if (type === "IMAGES_ZIP") return "images.zip";
  return "manifest.json";
}
