import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultPriceSymbol, fromPriceInt, priceFetchStart, priceSymbol, toPriceInt } from "./stock-price.ts";

describe("priceSymbol", () => {
  it("defaults to the ticker on Nasdaq Helsinki", () => {
    assert.equal(defaultPriceSymbol("HARVIA"), "HARVIA.HE");
    assert.equal(priceSymbol({ ticker: "HARVIA", priceSymbol: null }), "HARVIA.HE");
  });

  it("uses the company's own symbol", () => {
    assert.equal(priceSymbol({ ticker: "NOKIA", priceSymbol: "NOK.US" }), "NOK.US");
  });
});

describe("toPriceInt", () => {
  it("stores thousandths, rounded", () => {
    assert.equal(toPriceInt(41.3), 41300);
    assert.equal(toPriceInt(1.935), 1935);
    assert.equal(toPriceInt(0.12345), 123);
    assert.equal(fromPriceInt(1935), 1.935);
  });
});

describe("priceFetchStart", () => {
  it("starts from the latest saved day", () => {
    assert.equal(priceFetchStart("2026-11-10", "2026-11-13"), "2026-11-10");
  });

  it("goes a year back without saved prices", () => {
    assert.equal(priceFetchStart(null, "2026-11-13"), "2025-11-13");
    assert.equal(priceFetchStart(null, "2028-02-29"), "2027-03-01");
  });
});
