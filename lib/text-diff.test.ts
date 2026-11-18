import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { changedParagraphs, textDiff } from "./text-diff.ts";

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

describe("changedParagraphs", () => {
  const before = "Ensimmäinen kappale.\n\nToinen kappale.\n\n- kohta yksi\n- kohta kaksi";

  it("shows only the changed paragraph", () => {
    const after = "Ensimmäinen kappale.\n\nToinen kappale, muutettu.\n\n- kohta yksi\n- kohta kaksi";
    assert.deepEqual(changedParagraphs(before, after), [
      [
        { kind: "same", text: "Toinen kappale" },
        { kind: "added", text: ", muutettu" },
        { kind: "same", text: "." },
      ],
    ]);
  });

  it("treats list items as paragraphs", () => {
    const after = "Ensimmäinen kappale.\n\nToinen kappale.\n\n- kohta yksi\n- kohta kolme";
    assert.deepEqual(changedParagraphs(before, after), [
      [
        { kind: "same", text: "- kohta " },
        { kind: "removed", text: "kaksi" },
        { kind: "added", text: "kolme" },
      ],
    ]);
  });

  it("keeps separate changes apart and shows added and removed paragraphs", () => {
    const after = "Uusi alku.\n\nEnsimmäinen kappale.\n\nToinen kappale.\n\n- kohta yksi";
    assert.deepEqual(changedParagraphs(before, after), [
      [{ kind: "added", text: "Uusi alku." }],
      [{ kind: "removed", text: "- kohta kaksi" }],
    ]);
  });

  it("is empty when nothing changed but blank lines", () => {
    assert.deepEqual(changedParagraphs(before, before.replaceAll("\n\n", "\n")), []);
  });
});
