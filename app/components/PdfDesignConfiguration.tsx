import {
  BlockStack,
  Card,
  ChoiceList,
  FormLayout,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";

interface Option {
  label: string;
  value: string;
  disabled?: boolean;
}

interface PdfDesignConfigurationProps {
  layoutType: string;
  setLayoutType: (val: string) => void;
  gridColumns: string;
  setGridColumns: (val: string) => void;
  grouping: string;
  setGrouping: (val: string) => void;
  groupingOptions: Option[];
  sortOrder: string;
  setSortOrder: (val: string) => void;
  pageSize: string;
  setPageSize: (val: string) => void;
  brandName: string;
  setBrandName: (val: string) => void;
  logoUrl: string;
  setLogoUrl: (val: string) => void;
  contactLine: string;
  setContactLine: (val: string) => void;
  footerNote: string;
  setFooterNote: (val: string) => void;
  watermarkEnabled: boolean;
  setWatermarkEnabled: (val: boolean) => void;
  watermarkText: string;
  setWatermarkText: (val: string) => void;
  watermarkOpacity: string;
  setWatermarkOpacity: (val: string) => void;
}

export function PdfDesignConfiguration({
  layoutType,
  setLayoutType,
  gridColumns,
  setGridColumns,
  grouping,
  setGrouping,
  groupingOptions,
  sortOrder,
  setSortOrder,
  pageSize,
  setPageSize,
  brandName,
  setBrandName,
  logoUrl,
  setLogoUrl,
  contactLine,
  setContactLine,
  footerNote,
  setFooterNote,
  watermarkEnabled,
  setWatermarkEnabled,
  watermarkText,
  setWatermarkText,
  watermarkOpacity,
  setWatermarkOpacity,
}: PdfDesignConfigurationProps) {
  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingMd" as="h2">
          PDF Design
        </Text>
        <FormLayout>
          <Select
            label="Layout"
            options={[
              { label: "Grid", value: "GRID" },
              { label: "One per page", value: "ONE_PER_PAGE" },
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
                { label: "4", value: "4" },
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
              { label: "Updated (newest first)", value: "UPDATED_DESC" },
            ]}
            value={sortOrder}
            onChange={setSortOrder}
          />
          <Select
            label="Page size"
            options={[
              { label: "A4", value: "A4" },
              { label: "Letter", value: "LETTER" },
            ]}
            value={pageSize}
            onChange={setPageSize}
          />

          <Text variant="headingSm" as="h3">
            Branding
          </Text>
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

          <Text variant="headingSm" as="h3">
            Watermark
          </Text>
          <ChoiceList
            title="Enable watermark"
            choices={[{ label: "Enable", value: "enabled" }]}
            selected={watermarkEnabled ? ["enabled"] : []}
            onChange={(value) => setWatermarkEnabled(value.includes("enabled"))}
          />
          {watermarkEnabled && (
            <FormLayout.Group>
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
                  { label: "Heavy", value: "HEAVY" },
                ]}
                value={watermarkOpacity}
                onChange={setWatermarkOpacity}
              />
            </FormLayout.Group>
          )}
        </FormLayout>
      </BlockStack>
    </Card>
  );
}
