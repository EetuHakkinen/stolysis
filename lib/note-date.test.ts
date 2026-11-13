import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { endOfNoteDay, fromDbDate, helsinkiNoteDate, parseNoteDate, toDbDate } from "./note-date.ts";

describe("parseNoteDate", () => {
  it("parses valid dates with a 0-based month", () => {
    assert.deepEqual(parseNoteDate("2026-11-13"), { year: 2026, month: 10, day: 13 });
    assert.deepEqual(parseNoteDate("2028-02-29"), { year: 2028, month: 1, day: 29 });
  });

  it("rejects other values", () => {
    for (const value of ["2026-02-30", "2026-13-01", "2026-1-01", "13.11.2026", "", null, 20261113])
      assert.equal(parseNoteDate(value), undefined);
  });
});

describe("endOfNoteDay", () => {
  it("is the last millisecond of the day in Finnish time", () => {
    // Winter time, UTC+2.
    assert.equal(endOfNoteDay("2026-11-13").toISOString(), "2026-11-13T21:59:59.999Z");
    // Summer time, UTC+3.
    assert.equal(endOfNoteDay("2026-06-30").toISOString(), "2026-06-30T20:59:59.999Z");
    // Last day of the month and of the year.
    assert.equal(endOfNoteDay("2026-12-31").toISOString(), "2026-12-31T21:59:59.999Z");
  });
});

describe("db dates", () => {
  it("round-trip through midnight UTC", () => {
    assert.equal(toDbDate("2026-11-13").toISOString(), "2026-11-13T00:00:00.000Z");
    assert.equal(fromDbDate(toDbDate("2026-11-13")), "2026-11-13");
  });
});

describe("helsinkiNoteDate", () => {
  it("is the day in Finnish time", () => {
    assert.equal(helsinkiNoteDate(new Date("2026-11-13T22:30:00Z")), "2026-11-14");
    assert.equal(helsinkiNoteDate(new Date("2026-11-13T21:30:00Z")), "2026-11-13");
  });
});
