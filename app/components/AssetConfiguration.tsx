import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
  BlockStack,
  Button,
  Card,
  Checkbox,
  FormLayout,
  Text,
  TextField,
} from "@shopify/polaris";

type OverlayRect = { x: number; y: number; width: number; height: number };

interface AssetConfigurationProps {
  overlayEnabled: boolean;
  setOverlayEnabled: (val: boolean) => void;
  overlayRect: OverlayRect;
  setOverlayRect: (val: OverlayRect) => void;
  overlayBgColor: string;
  setOverlayBgColor: (val: string) => void;
  overlayBgOpacity: number;
  setOverlayBgOpacity: (val: number) => void;
  overlayTextColor: string;
  setOverlayTextColor: (val: string) => void;
  overlayCurrencyPrefix: string;
  setOverlayCurrencyPrefix: (val: string) => void;
  currencyPrefix: string; // From source config, for syncing defaults
}

export function AssetConfiguration({
  overlayEnabled,
  setOverlayEnabled,
  overlayRect,
  setOverlayRect,
  overlayBgColor,
  setOverlayBgColor,
  overlayBgOpacity,
  setOverlayBgOpacity,
  overlayTextColor,
  setOverlayTextColor,
  overlayCurrencyPrefix,
  setOverlayCurrencyPrefix,
  currencyPrefix,
}: AssetConfigurationProps) {
  const [overlayCurrencyDirty, setOverlayCurrencyDirty] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const previewSize = 260;

  useEffect(() => {
    if (!overlayCurrencyDirty) {
      setOverlayCurrencyPrefix(currencyPrefix);
    }
  }, [currencyPrefix, overlayCurrencyDirty, setOverlayCurrencyPrefix]);

  return (
    <Card>
      <BlockStack gap="300">
        <Text variant="headingMd" as="h2">
          Image ZIP & Overlays
        </Text>
        <Checkbox
          label="Enable price overlay on images"
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
                  border: "1px solid #dfe3e8",
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
                    userSelect: "none",
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
                      cursor: "nwse-resize",
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
  );
}

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
      height: startRect.height,
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
      height: startRect.height + dy,
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
