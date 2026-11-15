import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  matchExistingNews,
  matchIssuer,
  needsNewsFetch,
  newsFetchStart,
  normalizeTitle,
  shareOptions,
  withoutShareClass,
  withoutTranslations,
} from "./nasdaq-news.ts";

const ISSUERS = ["Harvia Oyj", "Inderes Oyj", "Nokia", "Nokian Tyres plc", "Revenio Group Oyj", "Sampo"];

describe("matchIssuer", () => {
  it("matches the name with or without the company form", () => {
    assert.equal(matchIssuer("Harvia Oyj", ISSUERS), "Harvia Oyj");
    assert.equal(matchIssuer("harvia", ISSUERS), "Harvia Oyj");
    assert.equal(matchIssuer("Revenio", ISSUERS), "Revenio Group Oyj");
    assert.equal(matchIssuer("Sampo Oyj", ISSUERS), "Sampo");
  });

  it("doesn't match a name that only starts the issuer's name", () => {
    assert.equal(matchIssuer("Nokia Oyj", ISSUERS), "Nokia");
    assert.equal(matchIssuer("Nokian", ISSUERS), undefined);
  });

  it("matches nothing when the match is ambiguous", () => {
    assert.equal(matchIssuer("Acme", ["Acme Oyj", "Acme Group Oyj"]), undefined);
    assert.equal(matchIssuer("Acme Oyj", ["Acme Oyj", "Acme Group Oyj"]), "Acme Oyj");
  });
});

describe("needsNewsFetch", () => {
  const now = new Date("2026-11-15T12:00:00Z");

  it("fetches news never fetched", () => {
    assert.equal(needsNewsFetch({ fetchedAt: null, now }), true);
  });

  it("fetches at most once in 4 hours", () => {
    assert.equal(needsNewsFetch({ fetchedAt: new Date("2026-11-15T08:00:01Z"), now }), false);
    assert.equal(needsNewsFetch({ fetchedAt: new Date("2026-11-15T08:00:00Z"), now }), true);
  });
});

describe("newsFetchStart", () => {
  const now = new Date("2026-11-15T12:00:00Z");

  it("starts from the latest news fetched from Nasdaq", () => {
    const latest = new Date("2026-10-30T14:00:00Z");
    assert.equal(newsFetchStart(latest, now), latest);
  });

  it("goes 5 years back without news from Nasdaq", () => {
    assert.deepEqual(newsFetchStart(null, now), new Date("2021-11-15T12:00:00Z"));
  });
});

describe("normalizeTitle", () => {
  it("ignores case, whitespace, quotes and dashes", () => {
    assert.equal(
      normalizeTitle("Harvia’s Interim report 1 January – 30 September 2026 "),
      normalizeTitle("harvia's  interim report 1 january - 30 september 2026"),
    );
  });
});

describe("matchExistingNews", () => {
  const at = (time: string) => new Date(`2026-10-29T${time}Z`);

  it("pairs news with the announcement of the same title released at about the same time", () => {
    const pairs = matchExistingNews(
      [
        { id: 1, headline: "Harvian osavuosikatsaus", publishedAt: at("07:00:00") },
        { id: 2, headline: "Harvia julkaisee", publishedAt: at("07:00:00") },
      ],
      [],
      [
        { id: 10, title: "harvian  osavuosikatsaus", releasedAt: at("07:02:00") },
        { id: 11, title: "Harvia julkaisee", releasedAt: at("07:30:00") },
      ],
    );
    assert.deepEqual([...pairs], [[1, 10]]);
  });

  it("pairs news titled like the other-language version published at the same time", () => {
    const pairs = matchExistingNews(
      [
        { id: 1, headline: "Harvian osavuosikatsaus", publishedAt: at("07:00:00") },
        { id: 2, headline: "Harvia Oyj: Johtohenkilöiden liiketoimet", publishedAt: at("07:01:00") },
      ],
      [
        { headline: "Harvia's Interim report", publishedAt: at("07:00:00") },
        { headline: "Harvia Plc: Managers' transactions", publishedAt: at("07:01:00") },
      ],
      [{ id: 10, title: "Harvia’s Interim report", releasedAt: at("07:01:00") }],
    );
    assert.deepEqual([...pairs], [[1, 10]]);
  });

  it("pairs each announcement with one news item", () => {
    const announcements = [1, 2, 3].map((id) => ({
      id,
      headline: "Harvia Oyj: Johtohenkilöiden liiketoimet",
      publishedAt: at("10:30:00"),
    }));
    const pairs = matchExistingNews(announcements, [], [
      { id: 10, title: "Harvia Oyj: Johtohenkilöiden liiketoimet", releasedAt: at("10:30:00") },
      { id: 11, title: "Harvia Oyj: Johtohenkilöiden liiketoimet", releasedAt: at("10:30:00") },
    ]);
    assert.equal(pairs.size, 2);
    assert.deepEqual(new Set(pairs.values()), new Set([10, 11]));
  });
});

describe("withoutTranslations", () => {
  const at = (time: string) => new Date(`2026-10-27T${time}Z`);
  const announcement = (id: number, language: string, time: string, categoryId = 6, languages = [language]) => ({
    id,
    language,
    languages,
    categoryId,
    publishedAt: at(time),
  });
  const ids = (list: { id: number }[]) => list.map((item) => item.id);

  it("keeps the Finnish versions of releases published separately in each language", () => {
    const list = [
      announcement(1, "fi", "06:30:00"),
      announcement(2, "en", "06:30:00"),
      announcement(3, "en", "06:35:00", 10),
      announcement(4, "fi", "06:35:00", 10),
    ];
    assert.deepEqual(ids(withoutTranslations(list)), [1, 4]);
  });

  it("pairs groups of several releases at the same time", () => {
    const list = [1, 2].map((id) => announcement(id, "fi", "10:30:00")).concat(
      [3, 4].map((id) => announcement(id, "en", "10:30:00")),
    );
    assert.deepEqual(ids(withoutTranslations(list)), [1, 2]);
  });

  it("keeps all when the languages don't pair up", () => {
    const list = [announcement(1, "fi", "06:30:00"), announcement(2, "en", "06:30:00"), announcement(3, "en", "06:30:00")];
    assert.deepEqual(ids(withoutTranslations(list)), [1, 2, 3]);
  });

  it("keeps releases of another time or category and English-only releases", () => {
    const list = [
      announcement(1, "fi", "06:30:00"),
      announcement(2, "en", "06:31:00"),
      announcement(3, "en", "06:30:00", 10),
      announcement(4, "en", "07:00:00"),
    ];
    assert.deepEqual(ids(withoutTranslations(list)), [1, 2, 3, 4]);
  });

  it("leaves releases that Nasdaq links in both languages alone", () => {
    const list = [announcement(1, "fi", "06:30:00", 6, ["fi", "en"]), announcement(2, "en", "06:30:00")];
    assert.deepEqual(ids(withoutTranslations(list)), [1, 2]);
  });
});

describe("withoutShareClass", () => {
  it("drops the share class letter or name", () => {
    assert.equal(withoutShareClass("Sampo Oyj A"), "Sampo Oyj");
    assert.equal(withoutShareClass("Stora Enso Oyj R"), "Stora Enso Oyj");
    assert.equal(withoutShareClass("Raisio Oyj Vaihto-osake"), "Raisio Oyj");
    assert.equal(withoutShareClass("Ponsse Oyj 1"), "Ponsse Oyj");
    assert.equal(withoutShareClass("Wärtsilä Oyj Abp"), "Wärtsilä Oyj Abp");
  });
});

describe("shareOptions", () => {
  it("names the company after its issuer, or the share without an issuer", () => {
    const issuers = ["Wärtsilä", "Sampo", "Harvia Oyj", "Nokian Tyres plc"];
    assert.deepEqual(
      shareOptions(
        [
          { ticker: "WRT1V", name: "Wärtsilä Oyj Abp" },
          { ticker: "SAMPO", name: "Sampo Oyj A" },
          { ticker: "HARVIA", name: "Harvia Oyj" },
          { ticker: "TYRES", name: "Nokian Renkaat Oyj" },
        ],
        issuers,
      ),
      [
        { ticker: "WRT1V", name: "Wärtsilä", nasdaqName: "Wärtsilä" },
        { ticker: "SAMPO", name: "Sampo", nasdaqName: "Sampo" },
        { ticker: "HARVIA", name: "Harvia Oyj", nasdaqName: "Harvia Oyj" },
        { ticker: "TYRES", name: "Nokian Renkaat Oyj", nasdaqName: null },
      ],
    );
  });
});
