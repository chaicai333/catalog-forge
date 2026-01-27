import { BlockStack, Card, Text } from "@shopify/polaris";

interface LivePreviewProps {
  layoutType: string;
  gridColumns: string;
  brandName: string;
  footerNote: string;
  watermarkEnabled: boolean;
  watermarkText: string;
  pageSize: string;
}

export function LivePreview({
  layoutType,
  gridColumns,
  brandName,
  footerNote,
  watermarkEnabled,
  watermarkText,
  pageSize,
}: LivePreviewProps) {
  // Aspect Ratios: width / height
  // A4: 210/297 = 0.707
  // Letter: 8.5/11 = 0.772
  const ratio = pageSize === "LETTER" ? 0.772 : 0.707;
  const height = 400;
  const width = height * ratio;

  const cols = layoutType === "GRID" ? Number(gridColumns) : 1;
  const rows = layoutType === "GRID" ? 3 : 1;
  const padding = 20;

  // Simple grid generation
  const cells = [];
  const cellWidth = (width - padding * 2) / cols;
  const cellHeight = (height - padding * 2 - 40) / rows; // minus header/footer space

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        x: padding + c * cellWidth + 5,
        y: padding + 30 + r * cellHeight + 5,
        w: cellWidth - 10,
        h: cellHeight - 10,
      });
    }
  }

  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingMd" as="h2">
          Live Preview
        </Text>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            background: "#f1f2f4",
            padding: "20px",
            borderRadius: "8px",
          }}
        >
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{
              background: "white",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            }}
          >
            {/* Header / Brand Name */}
            <text
              x={padding}
              y={padding + 15}
              fontSize="14"
              fontWeight="bold"
              fill="#333"
              fontFamily="sans-serif"
            >
              {brandName || "Brand Name"}
            </text>

            {/* Grid Cells */}
            {cells.map((cell, i) => (
              <g key={i}>
                <rect
                  x={cell.x}
                  y={cell.y}
                  width={cell.w}
                  height={cell.h * 0.7}
                  fill="#e1e3e5"
                />
                <rect
                  x={cell.x}
                  y={cell.y + cell.h * 0.75}
                  width={cell.w * 0.6}
                  height={8}
                  fill="#c4cdd5"
                />
                <rect
                  x={cell.x + cell.w * 0.7}
                  y={cell.y + cell.h * 0.75}
                  width={cell.w * 0.3}
                  height={8}
                  fill="#c4cdd5"
                />
              </g>
            ))}

            {/* Footer */}
            <text
              x={width / 2}
              y={height - 10}
              fontSize="10"
              fill="#666"
              textAnchor="middle"
              fontFamily="sans-serif"
            >
              {footerNote || "Page 1"}
            </text>

            {/* Watermark */}
            {watermarkEnabled && watermarkText && (
              <text
                x={width / 2}
                y={height / 2}
                fontSize="32"
                fill="rgba(0,0,0,0.1)"
                transform={`rotate(-45, ${width / 2}, ${height / 2})`}
                textAnchor="middle"
                dominantBaseline="middle"
                fontWeight="bold"
                fontFamily="sans-serif"
              >
                {watermarkText}
              </text>
            )}
          </svg>
        </div>
        <Text as="p" tone="subdued">
          Rough approximation. Actual PDF layout may vary.
        </Text>
      </BlockStack>
    </Card>
  );
}
