import {
  BlockStack,
  Button,
  Card,
  Checkbox,
  ChoiceList,
  FormLayout,
  InlineStack,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

interface Collection {
  id: string;
  title: string;
  legacyResourceId: string;
}

interface SelectedProduct {
  id: string;
  title: string;
  variants?: { id: string; title: string }[];
}

interface SourceConfigurationProps {
  exportName: string;
  setExportName: (val: string) => void;
  scopeType: string;
  setScopeType: (val: string) => void;
  includeDrafts: boolean;
  setIncludeDrafts: (val: boolean) => void;
  collectionIds: string[];
  setCollectionIds: (val: string[]) => void;
  collections: Collection[];
  vendorFilters: string;
  setVendorFilters: (val: string) => void;
  productTypeFilters: string;
  setProductTypeFilters: (val: string) => void;
  tagFilters: string;
  setTagFilters: (val: string) => void;
  pricingMode: string;
  setPricingMode: (val: string) => void;
  currencyPrefix: string;
  setCurrencyPrefix: (val: string) => void;
  selectedProducts: SelectedProduct[];
  setSelectedProducts: (val: SelectedProduct[]) => void;
  setProductIds: (val: string[]) => void;
  setVariantRestrictions: (val: Record<string, string[]> | undefined) => void;
}

export function SourceConfiguration({
  exportName,
  setExportName,
  scopeType,
  setScopeType,
  includeDrafts,
  setIncludeDrafts,
  collectionIds,
  setCollectionIds,
  collections,
  vendorFilters,
  setVendorFilters,
  productTypeFilters,
  setProductTypeFilters,
  tagFilters,
  setTagFilters,
  pricingMode,
  setPricingMode,
  currencyPrefix,
  setCurrencyPrefix,
  selectedProducts,
  setSelectedProducts,
  setProductIds,
  setVariantRestrictions,
}: SourceConfigurationProps) {
  const shopify = useAppBridge();

  const openProductPicker = async () => {
    const picker = (shopify as unknown as { resourcePicker?: Function }).resourcePicker;
    if (!picker) {
      shopify.toast.show("Resource picker is unavailable.");
      return;
    }
    try {
      const selection = await picker({
        type: "product",
        multiple: true,
        showVariants: true,
        selectionIds: selectedProducts.map((product) => ({
          id: product.id,
          variants: product.variants,
        })),
      });
      if (!selection || !Array.isArray(selection)) {
        return;
      }
      
      const next: SelectedProduct[] = selection.map((product: any) => ({
        id: product.id,
        title: product.title,
        variants: product.variants?.map((v: any) => ({ id: v.id, title: v.title })),
      }));
      
      setSelectedProducts(next);
      setProductIds(next.map((product) => toLegacyProductId(product.id) ?? product.id));

      const restrictions: Record<string, string[]> = {};
      next.forEach((p) => {
        if (p.variants && p.variants.length > 0) {
          restrictions[toLegacyProductId(p.id) ?? p.id] = p.variants.map((v) => v.id);
        }
      });
      setVariantRestrictions(restrictions);
    } catch {
      // Picker dismissed.
    }
  };

  const removeSelectedProduct = (id: string) => {
    const next = selectedProducts.filter((product) => product.id !== id);
    setSelectedProducts(next);
    setProductIds(next.map((product) => toLegacyProductId(product.id) ?? product.id));
    
    const restrictions: Record<string, string[]> = {};
    next.forEach((p) => {
      if (p.variants && p.variants.length > 0) {
        restrictions[toLegacyProductId(p.id) ?? p.id] = p.variants.map((v) => v.id);
      }
    });
    setVariantRestrictions(restrictions);
  };

  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingMd" as="h2">
          Source & Pricing
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
              { label: "Manual selection", value: "PRODUCTS" },
            ]}
            value={scopeType}
            onChange={setScopeType}
          />

          {scopeType === "COLLECTIONS" && (
            <>
              <ChoiceList
                title="Collections"
                allowMultiple
                choices={collections.map((collection) => ({
                  label: collection.title,
                  value: String(collection.legacyResourceId),
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
                      <BlockStack gap="050">
                        <Text as="span" fontWeight="bold">{product.title}</Text>
                        {product.variants && (
                          <Text as="span" tone="subdued" variant="bodySm">
                            {product.variants.length} variant(s) selected
                          </Text>
                        )}
                      </BlockStack>
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
                autoComplete="off"
              />
              <TextField
                label="Product types"
                value={productTypeFilters}
                onChange={setProductTypeFilters}
                multiline={2}
                helpText="Comma or newline separated."
                autoComplete="off"
              />
              <TextField
                label="Tags"
                value={tagFilters}
                onChange={setTagFilters}
                multiline={2}
                helpText="Comma or newline separated."
                autoComplete="off"
              />
            </FormLayout.Group>
          )}

          <Checkbox
            label="Include drafts (active + draft, exclude archived)"
            checked={includeDrafts}
            onChange={setIncludeDrafts}
          />

          <Select
            label="Pricing mode"
            options={[
              { label: "Default variant price", value: "DEFAULT_VARIANT_PRICE" },
              { label: "Min/Max range", value: "MIN_MAX_RANGE" },
              { label: "Variant table", value: "VARIANT_TABLE" },
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
        </FormLayout>
      </BlockStack>
    </Card>
  );
}

function toLegacyProductId(id: string) {
  const match = /gid:\/\/shopify\/Product\/(\d+)/.exec(id);
  return match?.[1] ?? null;
}
