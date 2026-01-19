import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData, useLocation, useNavigate } from "@remix-run/react";
import {
  Page,
  Text,
  Card,
  Button,
  BlockStack,
  FormLayout,
  TextField,
  Select,
  ChoiceList,
  Checkbox,
  Divider,
  Banner,
  InlineStack
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { ResourcePicker } from "@shopify/app-bridge/actions";
import { authenticate } from "../shopify.server";

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
  const [overlayCurrencyDirty, setOverlayCurrencyDirty] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const previewSize = 260;

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
    if (!overlayCurrencyDirty) {
      setOverlayCurrencyPrefix(currencyPrefix);
    }
  }, [currencyPrefix, overlayCurrencyDirty]);

  useEffect(() => {
    if (scopeType !== "COLLECTIONS" && grouping === "COLLECTION") {
      setGrouping("NONE");
    }
  }, [scopeType, grouping]);

  const openProductPicker = () => {
    const picker = ResourcePicker.create(shopify, {
      resourceType: ResourcePicker.ResourceType.Product,
      options: {
        selectMultiple: true,
        initialSelectionIds: selectedProducts.map((product) => ({ id: product.id }))
      }
    });
    picker.subscribe(ResourcePicker.Action.SELECT, ({ selection }) => {
      const next = selection.map((product) => ({
        id: product.id,
        title: product.title
      }));
      setSelectedProducts(next);
      setProductIds(next.map((product) => product.id));
      picker.dispatch(ResourcePicker.Action.CLOSE);
    });
    picker.subscribe(ResourcePicker.Action.CANCEL, () => {
      picker.dispatch(ResourcePicker.Action.CLOSE);
    });
    picker.dispatch(ResourcePicker.Action.OPEN);
  };

  const removeSelectedProduct = (id: string) => {
    const next = selectedProducts.filter((product) => product.id !== id);
    setSelectedProducts(next);
    setProductIds(next.map((product) => product.id));
  };

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
    <Page>
      <TitleBar title="Create export">
        <button variant="primary" onClick={submit} disabled={isSubmitting}>
          Generate
        </button>
      </TitleBar>
      <BlockStack gap="400">
        {errors.length > 0 && (
          <Banner title="Fix the following issues" tone="critical">
            <ul>
              {errors.map((error: string) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </Banner>
        )}
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">
              Export settings
            </Text>
            <FormLayout>
              <TextField
                label="Export name"
                value={exportName}
                onChange={setExportName}
                placeholder="CatalogForge 2025-01-12"
                autoComplete="off"
              />
              <Select
                label="Product scope"
                options={[
                  { label: "All products", value: "ALL_PRODUCTS" },
                  { label: "Collections", value: "COLLECTIONS" },
                  { label: "Filters", value: "FILTERS" },
                  { label: "Manual selection", value: "PRODUCTS" }
                ]}
                value={scopeType}
                onChange={setScopeType}
              />
              {scopeType === "COLLECTIONS" && (
                <>
                  <ChoiceList
                    title="Collections"
                    allowMultiple
                    choices={collections.map((collection: { legacyResourceId: string; title: string }) => ({
                      label: collection.title,
                      value: String(collection.legacyResourceId)
                    }))}
                    selected={collectionIds}
                    onChange={setCollectionIds}
                  />
                  {collections.length === 0 && (
                    <Text as="p" tone="subdued">
                      No collections found. Create a collection or switch to All Products.
                    </Text>
                  )}
                </>
              )}
              {scopeType === "PRODUCTS" && (
                <>
                  <Button onClick={openProductPicker}>Select products</Button>
                  {selectedProducts.length === 0 ? (
                    <Text as="p" tone="subdued">
                      No products selected yet.
                    </Text>
                  ) : (
                    <BlockStack gap="100">
                      {selectedProducts.map((product) => (
                        <InlineStack key={product.id} align="space-between">
                          <Text as="span">{product.title}</Text>
                          <Button
                            variant="plain"
                            tone="critical"
                            onClick={() => removeSelectedProduct(product.id)}
                          >
                            Remove
                          </Button>
                        </InlineStack>
                      ))}
                    </BlockStack>
                  )}
                  <Text as="p" tone="subdued">
                    Use the Shopify picker to search and select products.
                  </Text>
                </>
              )}
              {scopeType === "FILTERS" && (
                <FormLayout.Group>
                  <TextField
                    label="Vendors"
                    value={vendorFilters}
                    onChange={setVendorFilters}
                    multiline={2}
                    helpText="Comma or newline separated."
                  />
                  <TextField
                    label="Product types"
                    value={productTypeFilters}
                    onChange={setProductTypeFilters}
                    multiline={2}
                    helpText="Comma or newline separated."
                  />
                  <TextField
                    label="Tags"
                    value={tagFilters}
                    onChange={setTagFilters}
                    multiline={2}
                    helpText="Comma or newline separated."
                  />
                </FormLayout.Group>
              )}
              <Checkbox
                label="Include drafts (active + draft, exclude archived)"
                checked={includeDrafts}
                onChange={setIncludeDrafts}
              />
            </FormLayout>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">
              Pricing & layout
            </Text>
            <FormLayout>
              <Select
                label="Pricing mode"
                options={[
                  { label: "Default variant price", value: "DEFAULT_VARIANT_PRICE" },
                  { label: "Min/Max range", value: "MIN_MAX_RANGE" },
                  { label: "Variant table", value: "VARIANT_TABLE" }
                ]}
                value={pricingMode}
                onChange={setPricingMode}
              />
              <TextField
                label="Currency prefix"
                value={currencyPrefix}
                onChange={setCurrencyPrefix}
                autoComplete="off"
                helpText="Examples: $, RM, €"
              />
              <Select
                label="Layout"
                options={[
                  { label: "Grid", value: "GRID" },
                  { label: "One per page", value: "ONE_PER_PAGE" }
                ]}
                value={layoutType}
                onChange={setLayoutType}
              />
              {layoutType === "GRID" && (
                <Select
                  label="Grid columns"
                  options={[
                    { label: "2", value: "2" },
                    { label: "3", value: "3" },
                    { label: "4", value: "4" }
                  ]}
                  value={gridColumns}
                  onChange={setGridColumns}
                />
              )}
              <Select
                label="Grouping"
                options={groupingOptions}
                value={grouping}
                onChange={setGrouping}
              />
              <Select
                label="Sort order"
                options={[
                  { label: "Title (A-Z)", value: "TITLE_ASC" },
                  { label: "Created (newest first)", value: "CREATED_DESC" },
                  { label: "Updated (newest first)", value: "UPDATED_DESC" }
                ]}
                value={sortOrder}
                onChange={setSortOrder}
              />
              <Select
                label="Page size"
                options={[
                  { label: "A4", value: "A4" },
                  { label: "Letter", value: "LETTER" }
                ]}
                value={pageSize}
                onChange={setPageSize}
              />
            </FormLayout>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">
              Image ZIP price overlay
            </Text>
            <Checkbox
              label="Enable overlay"
              checked={overlayEnabled}
              onChange={setOverlayEnabled}
            />
            {overlayEnabled && (
              <FormLayout>
                <FormLayout.Group>
                  <TextField
                    label="Background color"
                    value={overlayBgColor}
                    onChange={setOverlayBgColor}
                    autoComplete="off"
                    helpText="Hex color, e.g. #000000"
                  />
                  <div>
                    <Text as="p">Background picker</Text>
                    <input
                      aria-label="Background color picker"
                      type="color"
                      value={overlayBgColor}
                      onChange={(event) => setOverlayBgColor(event.target.value)}
                      style={{ width: "100%", height: "40px", border: "none", padding: 0 }}
                    />
                  </div>
                  <TextField
                    label="Text color"
                    value={overlayTextColor}
                    onChange={setOverlayTextColor}
                    autoComplete="off"
                    helpText="Hex color, e.g. #ffffff"
                  />
                  <div>
                    <Text as="p">Text picker</Text>
                    <input
                      aria-label="Text color picker"
                      type="color"
                      value={overlayTextColor}
                      onChange={(event) => setOverlayTextColor(event.target.value)}
                      style={{ width: "100%", height: "40px", border: "none", padding: 0 }}
                    />
                  </div>
                  <TextField
                    label="Currency prefix"
                    value={overlayCurrencyPrefix}
                    onChange={(value) => {
                      setOverlayCurrencyPrefix(value);
                      setOverlayCurrencyDirty(true);
                    }}
                    autoComplete="off"
                    helpText="Examples: $, RM, €"
                  />
                </FormLayout.Group>
                <div>
                  <Text as="p">Background opacity: {Math.round(overlayBgOpacity * 100)}%</Text>
                  <input
                    aria-label="Background opacity"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={overlayBgOpacity}
                    onChange={(event) => setOverlayBgOpacity(Number(event.target.value))}
                    style={{ width: "100%" }}
                  />
                </div>
                <div>
                  <Text as="p">Preview (drag to move, resize using the corner)</Text>
                  <div
                    ref={previewRef}
                    style={{
                      width: "100%",
                      maxWidth: `${previewSize}px`,
                      aspectRatio: "1 / 1",
                      height: "auto",
                      borderRadius: "12px",
                      position: "relative",
                      overflow: "hidden",
                      background:
                        "linear-gradient(135deg, #f4f1ea 0%, #e8eef6 55%, #d9e5f7 100%)",
                      border: "1px solid #dfe3e8"
                    }}
                  >
                    <div
                      onPointerDown={(event) =>
                        startOverlayDrag(event, previewRef, overlayRect, setOverlayRect)
                      }
                      style={{
                        position: "absolute",
                        left: `${overlayRect.x * 100}%`,
                        top: `${overlayRect.y * 100}%`,
                        width: `${overlayRect.width * 100}%`,
                        height: `${overlayRect.height * 100}%`,
                        backgroundColor: overlayBgColor,
                        opacity: overlayBgOpacity,
                        color: overlayTextColor,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 600,
                        fontSize: `${Math.max(
                          12,
                          Math.min(48, overlayRect.height * previewSize * 0.5)
                        )}px`,
                        border: "1px dashed rgba(255,255,255,0.6)",
                        boxSizing: "border-box",
                        cursor: "move",
                        userSelect: "none"
                      }}
                    >
                      {overlayCurrencyPrefix}129.00
                      <div
                        onPointerDown={(event) =>
                          startOverlayResize(event, previewRef, overlayRect, setOverlayRect)
                        }
                        style={{
                          position: "absolute",
                          right: "6px",
                          bottom: "6px",
                          width: "16px",
                          height: "16px",
                          background: "rgba(255,255,255,0.85)",
                          borderRadius: "4px",
                          border: "1px solid rgba(0,0,0,0.15)",
                          cursor: "nwse-resize"
                        }}
                      />
                    </div>
                  </div>
                  <Button
                    tone="critical"
                    variant="tertiary"
                    onClick={() =>
                      setOverlayRect({ x: 0.06, y: 0.74, width: 0.88, height: 0.2 })
                    }
                  >
                    Reset overlay
                  </Button>
                </div>
              </FormLayout>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">
              Branding
            </Text>
            <FormLayout>
              <TextField
                label="Brand name"
                value={brandName}
                onChange={setBrandName}
                autoComplete="off"
              />
              <TextField
                label="Logo URL"
                value={logoUrl}
                onChange={setLogoUrl}
                autoComplete="off"
              />
              <TextField
                label="Contact line"
                value={contactLine}
                onChange={setContactLine}
                autoComplete="off"
              />
              <TextField
                label="Footer note"
                value={footerNote}
                onChange={setFooterNote}
                autoComplete="off"
              />
            </FormLayout>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">
              Watermark
            </Text>
            <ChoiceList
              title="Enable watermark"
              choices={[{ label: "Enable", value: "enabled" }]}
              selected={watermarkEnabled ? ["enabled"] : []}
              onChange={(value) => setWatermarkEnabled(value.includes("enabled"))}
            />
            {watermarkEnabled && (
              <FormLayout>
                <TextField
                  label="Watermark text"
                  value={watermarkText}
                  onChange={setWatermarkText}
                  autoComplete="off"
                />
                <Select
                  label="Opacity"
                  options={[
                    { label: "Light", value: "LIGHT" },
                    { label: "Medium", value: "MEDIUM" },
                    { label: "Heavy", value: "HEAVY" }
                  ]}
                  value={watermarkOpacity}
                  onChange={setWatermarkOpacity}
                />
              </FormLayout>
            )}
          </BlockStack>
        </Card>

        <Divider />
        <Button variant="primary" onClick={submit} loading={isSubmitting}>
          Generate
        </Button>
      </BlockStack>
    </Page>
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

type OverlayRect = { x: number; y: number; width: number; height: number };

function startOverlayDrag(
  event: ReactPointerEvent,
  containerRef: React.RefObject<HTMLDivElement>,
  rect: OverlayRect,
  setRect: (next: OverlayRect) => void
) {
  event.preventDefault();
  const container = containerRef.current;
  if (!container) return;
  const bounds = container.getBoundingClientRect();
  const startX = event.clientX;
  const startY = event.clientY;
  const startRect = rect;

  const onMove = (moveEvent: PointerEvent) => {
    const dx = (moveEvent.clientX - startX) / bounds.width;
    const dy = (moveEvent.clientY - startY) / bounds.height;
    const next = clampRect({
      x: startRect.x + dx,
      y: startRect.y + dy,
      width: startRect.width,
      height: startRect.height
    });
    setRect(next);
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

function startOverlayResize(
  event: ReactPointerEvent,
  containerRef: React.RefObject<HTMLDivElement>,
  rect: OverlayRect,
  setRect: (next: OverlayRect) => void
) {
  event.preventDefault();
  event.stopPropagation();
  const container = containerRef.current;
  if (!container) return;
  const bounds = container.getBoundingClientRect();
  const startX = event.clientX;
  const startY = event.clientY;
  const startRect = rect;

  const onMove = (moveEvent: PointerEvent) => {
    const dx = (moveEvent.clientX - startX) / bounds.width;
    const dy = (moveEvent.clientY - startY) / bounds.height;
    const next = clampRect({
      x: startRect.x,
      y: startRect.y,
      width: startRect.width + dx,
      height: startRect.height + dy
    });
    setRect(next);
  };
  const onUp = () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

function clampRect(rect: OverlayRect) {
  const minSize = 0.08;
  const width = Math.min(Math.max(rect.width, minSize), 1);
  const height = Math.min(Math.max(rect.height, minSize), 1);
  const x = Math.min(Math.max(rect.x, 0), 1 - width);
  const y = Math.min(Math.max(rect.y, 0), 1 - height);
  return { x, y, width, height };
}
