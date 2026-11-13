import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultPriceSymbol,
  expectedPriceDate,
  fromPriceInt,
  needsPriceFetch,
  priceFetchStart,
  priceOn,
  pricesInRange,
  priceSymbol,
  toPriceInt,
} from "./stock-price.ts";

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

const prices = [
  { date: "2026-05-29", close: 9 },
  { date: "2026-08-12", close: 10 },
  { date: "2026-11-10", close: 11 },
  { date: "2026-11-12", close: 12 },
];

describe("priceOn", () => {
  it("is the latest price on or before the day", () => {
    assert.deepEqual(priceOn(prices, "2026-11-12"), { date: "2026-11-12", close: 12 });
    assert.deepEqual(priceOn(prices, "2026-11-11"), { date: "2026-11-10", close: 11 });
    assert.equal(priceOn(prices, "2026-05-28"), null);
  });
});

describe("pricesInRange", () => {
  it("ends at the latest price", () => {
    assert.deepEqual(pricesInRange(prices, "1M").map((price) => price.close), [11, 12]);
    assert.deepEqual(pricesInRange(prices, "3M").map((price) => price.close), [10, 11, 12]);
    assert.deepEqual(pricesInRange(prices, "6M").map((price) => price.close), [9, 10, 11, 12]);
    assert.equal(pricesInRange(prices, "all"), prices);
    assert.deepEqual(pricesInRange([], "1M"), []);
  });
});

describe("expectedPriceDate", () => {
  it("is the weekday before today", () => {
    // Friday, Saturday, Sunday and Monday.
    assert.equal(expectedPriceDate("2026-11-13"), "2026-11-12");
    assert.equal(expectedPriceDate("2026-11-14"), "2026-11-13");
    assert.equal(expectedPriceDate("2026-11-15"), "2026-11-13");
    assert.equal(expectedPriceDate("2026-11-16"), "2026-11-13");
    assert.equal(expectedPriceDate("2027-01-01"), "2026-12-31");
  });
});

describe("needsPriceFetch", () => {
  // Friday 13.11.2026 at noon in Finnish time.
  const now = new Date("2026-11-13T10:00:00Z");

  it("fetches when the expected day's price is missing", () => {
    assert.equal(needsPriceFetch({ latest: "2026-11-11", fetchedAt: null, now }), true);
    assert.equal(needsPriceFetch({ latest: null, fetchedAt: null, now }), true);
    assert.equal(
      needsPriceFetch({ latest: "2026-11-11", fetchedAt: new Date("2026-11-12T20:00:00Z"), now }),
      true,
    );
  });

  it("doesn't fetch with the expected day's price", () => {
    assert.equal(needsPriceFetch({ latest: "2026-11-12", fetchedAt: null, now }), false);
    assert.equal(needsPriceFetch({ latest: "2026-11-13", fetchedAt: null, now }), false);
  });

  it("fetches at most once a day in Finnish time", () => {
    // 00:30 on the 13th in Finland.
    const fetchedAt = new Date("2026-11-12T22:30:00Z");
    assert.equal(needsPriceFetch({ latest: "2026-11-11", fetchedAt, now }), false);
  });
});
