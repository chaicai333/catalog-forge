import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData, useNavigate, useLocation } from "@remix-run/react";
import { useEffect } from "react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  Page,
  Text,
  InlineStack
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Redirect } from "@shopify/app-bridge/actions";
import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../models/shop.server";
import { listJobs } from "../models/jobs.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop);
  const result = await listJobs({ shopId: shop.id, limit: 25 });

  return json({ items: result.items, nextCursor: result.nextCursor });
};

export default function Jobs() {
  const initial = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof loader>();
  const navigate = useNavigate();
  const location = useLocation();
  const app = useAppBridge();

  const items = fetcher.data?.items ?? initial.items;
  const shouldPoll = items.some((job) =>
    ["QUEUED", "RUNNING"].includes(job.status)
  );

  useEffect(() => {
    if (!shouldPoll) {
      return;
    }
    const timer = setInterval(() => {
      fetcher.load("/api/jobs?limit=25");
    }, 15000);
    return () => clearInterval(timer);
  }, [fetcher, shouldPoll]);

  return (
    <Page title="Jobs / History">
      <BlockStack gap="400">
        {items.length === 0 && (
          <Card>
            <Text as="p">No jobs yet. Create your first export.</Text>
          </Card>
        )}
        {items.map((job) => (
          <Card key={job.id}>
            <BlockStack gap="200">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h3">
                  {job.name ?? "CatalogForge"}
                </Text>
                <Badge tone={badgeTone(job.status)}>{job.status}</Badge>
              </InlineStack>
              <Text as="p" tone="subdued">
                Created{" "}
                <span suppressHydrationWarning>
                  {new Date(job.createdAt).toISOString()}
                </span>
              </Text>
              <InlineStack gap="200">
                <Button
                  variant="primary"
                  onClick={() => {
                    const target = `/app/jobs/${job.id}${buildEmbeddedQuery(location.search)}`;
                    try {
                      Redirect.create(app).dispatch(Redirect.Action.APP, target);
                    } catch (error) {
                      // Ignore and fallback to Remix navigation.
                    }
                    navigate(target);
                  }}
                >
                  View
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        ))}
      </BlockStack>
    </Page>
  );
}

function badgeTone(status: string) {
  if (status === "COMPLETED") return "success" as const;
  if (status === "FAILED") return "critical" as const;
  if (status === "PARTIAL") return "warning" as const;
  return "attention" as const;
}

function buildEmbeddedQuery(search: string) {
  const params = new URLSearchParams(search);
  if (typeof window !== "undefined") {
    const storedHost =
      window.sessionStorage.getItem("shopify-host") ||
      window.localStorage.getItem("shopify-host") ||
      (window as unknown as { __SHOPIFY_APP_BRIDGE_STATE__?: { host?: string } })
        .__SHOPIFY_APP_BRIDGE_STATE__?.host;
    const storedShop = window.sessionStorage.getItem("shopify-shop");
    if (!params.get("host") && storedHost) {
      params.set("host", storedHost);
    }
    if (!params.get("shop") && storedShop) {
      params.set("shop", storedShop);
    }
  }
  if (!params.toString()) {
    return "";
  }
  return `?${params.toString()}`;
}
