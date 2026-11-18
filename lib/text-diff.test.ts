import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { textDiff } from "./text-diff.ts";

describe("textDiff", () => {
  it("marks added and removed words", () => {
    assert.deepEqual(textDiff("Yhtiö myy saunoja Suomessa.", "Yhtiö myy kiukaita Suomessa."), [
      { kind: "same", text: "Yhtiö myy " },
      { kind: "removed", text: "saunoja" },
      { kind: "added", text: "kiukaita" },
      { kind: "same", text: " Suomessa." },
    ]);
  });

  it("marks the whole text added when there was none", () => {
    assert.deepEqual(textDiff("", "Uusi osio"), [{ kind: "added", text: "Uusi osio" }]);
  });

  it("keeps the text of both versions in order", () => {
    const before = "Ensimmäinen kappale.\n\n- kohta yksi\n- kohta kaksi";
    const after = "Ensimmäinen kappale, muutettu.\n\n- kohta yksi\n- kohta kolme";
    const parts = textDiff(before, after);
    const text = (kind: "added" | "removed") =>
      parts.filter((part) => part.kind !== kind).map((part) => part.text).join("");
    assert.equal(text("added"), before);
    assert.equal(text("removed"), after);
  });
});
