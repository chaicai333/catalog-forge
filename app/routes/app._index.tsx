import { useEffect, useMemo, useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData, useLocation, useNavigate } from "@remix-run/react";
import {
  Page,
  Banner,
  BlockStack,
  Layout,
  TitleBar,
  useAppBridge,
} from "@shopify/app-bridge-react";
// Note: TitleBar and useAppBridge are from @shopify/app-bridge-react
// Page, Banner, Layout etc. are from @shopify/polaris.
// The original import mixed them up or relied on auto-imports behaving specifically.
// Let's fix imports to be standard.
import {
  Page as PolarisPage,
  Layout as PolarisLayout,
  Banner as PolarisBanner,
  BlockStack as PolarisBlockStack,
  Button
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { SourceConfiguration } from "../components/SourceConfiguration";
import { PdfDesignConfiguration } from "../components/PdfDesignConfiguration";
import { AssetConfiguration } from "../components/AssetConfiguration";
import { LivePreview } from "../components/LivePreview";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
      query CatalogForgeCollections {
        collections(first: 50) {
          nodes {
            id
            title
            legacyResourceId
          }
        }
      }`
  );

  const jsonResponse = await response.json();
  const collections = jsonResponse?.data?.collections?.nodes ?? [];

  return { collections };
};

export default function Index() {
  const { collections } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ jobId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const shopify = useAppBridge();

  const [exportName, setExportName] = useState("");
  const [scopeType, setScopeType] = useState("ALL_PRODUCTS");
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<{ id: string; title: string }[]>([]);
  const [vendorFilters, setVendorFilters] = useState("");
  const [productTypeFilters, setProductTypeFilters] = useState("");
  const [tagFilters, setTagFilters] = useState("");
  const [pricingMode, setPricingMode] = useState("DEFAULT_VARIANT_PRICE");
  const [currencyPrefix, setCurrencyPrefix] = useState("$");
  const [layoutType, setLayoutType] = useState("GRID");
  const [gridColumns, setGridColumns] = useState("3");
  const [grouping, setGrouping] = useState("NONE");
  const [sortOrder, setSortOrder] = useState("TITLE_ASC");
  const [brandName, setBrandName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [contactLine, setContactLine] = useState("");
  const [footerNote, setFooterNote] = useState("");
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkText, setWatermarkText] = useState("");
  const [watermarkOpacity, setWatermarkOpacity] = useState("LIGHT");
  const [pageSize, setPageSize] = useState("A4");
  const [overlayEnabled, setOverlayEnabled] = useState(true);
  const [overlayRect, setOverlayRect] = useState({
    x: 0.06,
    y: 0.74,
    width: 0.88,
    height: 0.2
  });
  const [overlayBgColor, setOverlayBgColor] = useState("#000000");
  const [overlayBgOpacity, setOverlayBgOpacity] = useState(0.55);
  const [overlayTextColor, setOverlayTextColor] = useState("#ffffff");
  const [overlayCurrencyPrefix, setOverlayCurrencyPrefix] = useState("$");
  const [variantRestrictions, setVariantRestrictions] = useState<Record<string, string[]> | undefined>(undefined);

  const isSubmitting =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  const errors = (fetcher.data as { errors?: string[] } | undefined)?.errors ?? [];

  const groupingOptions = useMemo(() => {
    const options = [
      { label: "None", value: "NONE" },
      { label: "Vendor", value: "VENDOR" },
      { label: "Product type", value: "PRODUCT_TYPE" },
      { label: "Collection", value: "COLLECTION", disabled: scopeType !== "COLLECTIONS" }
    ];
    return options;
  }, [scopeType]);

  useEffect(() => {
    if (scopeType !== "COLLECTIONS" && grouping === "COLLECTION") {
      setGrouping("NONE");
    }
  }, [scopeType, grouping]);

  const submit = () => {
    if (watermarkEnabled && !watermarkText.trim()) {
      shopify.toast.show("Watermark text is required");
      return;
    }

    const payload = {
      exportName: exportName.trim() || undefined,
      scopeType,
      includeDrafts,
      collectionIds: scopeType === "COLLECTIONS" ? collectionIds : undefined,
      filters:
        scopeType === "FILTERS"
          ? {
              vendor: splitList(vendorFilters),
              productType: splitList(productTypeFilters),
              tag: splitList(tagFilters)
            }
          : undefined,
      productIds: scopeType === "PRODUCTS" ? productIds : undefined,
      variantRestrictions: scopeType === "PRODUCTS" ? variantRestrictions : undefined,
      pricingMode,
      currencyPrefix: currencyPrefix.trim() || undefined,
      layoutType,
      gridColumns: layoutType === "GRID" ? Number(gridColumns) : undefined,
      grouping,
      sortOrder,
      brandName,
      logoUrl,
      contactLine,
      footerNote,
      watermarkEnabled,
      watermarkText: watermarkEnabled ? watermarkText : undefined,
      watermarkOpacity: watermarkEnabled ? watermarkOpacity : undefined,
      pageSize,
      priceOverlay: {
        enabled: overlayEnabled,
        rect: overlayRect,
        backgroundColor: overlayBgColor,
        backgroundOpacity: overlayBgOpacity,
        textColor: overlayTextColor,
        currencyPrefix: overlayCurrencyPrefix.trim() || undefined
      }
    };

    fetcher.submit(payload, {
      method: "POST",
      encType: "application/json",
      action: "/api/jobs"
    });
  };

  useEffect(() => {
    if (!fetcher.data?.jobId) {
      return;
    }
    shopify.toast.show("Export started");
    navigate(`/app/jobs/${fetcher.data.jobId}${buildEmbeddedQuery(location.search)}`);
  }, [fetcher.data?.jobId, location.search, navigate, shopify]);

  return (
    <PolarisPage fullWidth>
      <TitleBar title="Create export">
        <button variant="primary" onClick={submit} disabled={isSubmitting}>
          Generate
        </button>
      </TitleBar>
      <PolarisBlockStack gap="400">
        {errors.length > 0 && (
          <PolarisBanner title="Fix the following issues" tone="critical">
            <ul>
              {errors.map((error: string) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </PolarisBanner>
        )}
        <PolarisLayout>
          <PolarisLayout.Section>
            <PolarisBlockStack gap="500">
              <SourceConfiguration
                exportName={exportName}
                setExportName={setExportName}
                scopeType={scopeType}
                setScopeType={setScopeType}
                includeDrafts={includeDrafts}
                setIncludeDrafts={setIncludeDrafts}
                collectionIds={collectionIds}
                setCollectionIds={setCollectionIds}
                collections={collections}
                vendorFilters={vendorFilters}
                setVendorFilters={setVendorFilters}
                productTypeFilters={productTypeFilters}
                setProductTypeFilters={setProductTypeFilters}
                tagFilters={tagFilters}
                setTagFilters={setTagFilters}
                pricingMode={pricingMode}
                setPricingMode={setPricingMode}
                currencyPrefix={currencyPrefix}
                setCurrencyPrefix={setCurrencyPrefix}
                selectedProducts={selectedProducts}
                setSelectedProducts={setSelectedProducts}
                setProductIds={setProductIds}
                setVariantRestrictions={setVariantRestrictions}
              />

              <PdfDesignConfiguration
                layoutType={layoutType}
                setLayoutType={setLayoutType}
                gridColumns={gridColumns}
                setGridColumns={setGridColumns}
                grouping={grouping}
                setGrouping={setGrouping}
                groupingOptions={groupingOptions}
                sortOrder={sortOrder}
                setSortOrder={setSortOrder}
                pageSize={pageSize}
                setPageSize={setPageSize}
                brandName={brandName}
                setBrandName={setBrandName}
                logoUrl={logoUrl}
                setLogoUrl={setLogoUrl}
                contactLine={contactLine}
                setContactLine={setContactLine}
                footerNote={footerNote}
                setFooterNote={setFooterNote}
                watermarkEnabled={watermarkEnabled}
                setWatermarkEnabled={setWatermarkEnabled}
                watermarkText={watermarkText}
                setWatermarkText={setWatermarkText}
                watermarkOpacity={watermarkOpacity}
                setWatermarkOpacity={setWatermarkOpacity}
              />

              <AssetConfiguration
                overlayEnabled={overlayEnabled}
                setOverlayEnabled={setOverlayEnabled}
                overlayRect={overlayRect}
                setOverlayRect={setOverlayRect}
                overlayBgColor={overlayBgColor}
                setOverlayBgColor={setOverlayBgColor}
                overlayBgOpacity={overlayBgOpacity}
                setOverlayBgOpacity={setOverlayBgOpacity}
                overlayTextColor={overlayTextColor}
                setOverlayTextColor={setOverlayTextColor}
                overlayCurrencyPrefix={overlayCurrencyPrefix}
                setOverlayCurrencyPrefix={setOverlayCurrencyPrefix}
                currencyPrefix={currencyPrefix}
              />
              
              <PolarisBlockStack inlineAlign="end">
                <Button variant="primary" onClick={submit} loading={isSubmitting} size="large">
                  Generate Export
                </Button>
              </PolarisBlockStack>
            </PolarisBlockStack>
          </PolarisLayout.Section>

          <PolarisLayout.Section variant="oneThird">
            <div style={{ position: "sticky", top: "20px" }}>
              <LivePreview
                layoutType={layoutType}
                gridColumns={gridColumns}
                brandName={brandName}
                footerNote={footerNote}
                watermarkEnabled={watermarkEnabled}
                watermarkText={watermarkText}
                pageSize={pageSize}
              />
            </div>
          </PolarisLayout.Section>
        </PolarisLayout>
      </PolarisBlockStack>
    </PolarisPage>
  );
}

function splitList(value: string) {
  return value
    .split(/\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
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
