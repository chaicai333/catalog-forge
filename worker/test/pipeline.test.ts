import test from "node:test";
import assert from "node:assert/strict";
import { formatPrice } from "../src/pipeline";

test("formatPrice handles default price", () => {
  assert.equal(formatPrice("19.99"), "$19.99");
});

test("formatPrice handles range", () => {
  assert.equal(formatPrice({ min: "10", max: "25" }), "$10 - $25");
});

test("formatPrice handles variant table", () => {
  assert.equal(
    formatPrice({ variants: [{ title: "Small", price: "5.00" }] }),
    "$5.00"
  );
});

