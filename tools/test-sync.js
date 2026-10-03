const test = require("node:test");
const assert = require("node:assert");
const { mergeData } = require("../sync.js");

const d = (id, updatedAt, extra) => ({ id, updatedAt, ...extra });

test("records on only one side are kept", () => {
  const { payload, summary } = mergeData({ deals: [d("a", "1")] }, { deals: [d("b", "1")], owned: [d("o1", "1")] });
  assert.deepStrictEqual(payload.deals.map(x => x.id).sort(), ["a", "b"]);
  assert.strictEqual(payload.owned.length, 1);
  assert.strictEqual(summary.added, 2);
});

test("the more recent change wins, and ties keep this device", () => {
  const { payload } = mergeData(
    { deals: [d("a", "2026-10-02", { stage: "Toured" }), d("b", "2026-10-01", { stage: "local" })] },
    { deals: [d("a", "2026-10-01", { stage: "Interested" }), d("b", "2026-10-01", { stage: "remote" })] });
  assert.strictEqual(payload.deals.find(x => x.id === "a").stage, "Toured");
  assert.strictEqual(payload.deals.find(x => x.id === "b").stage, "local");
  const r = mergeData({ deals: [d("a", "2026-10-01", { stage: "old" })] }, { deals: [d("a", "2026-10-03", { stage: "new" })] });
  assert.strictEqual(r.payload.deals[0].stage, "new");
  assert.strictEqual(r.summary.updated, 1);
});

test("a deletion on either side stays deleted", () => {
  const { payload, summary } = mergeData(
    { deals: [d("a", "1"), d("b", "1")], owned: [d("o1", "1")], removed: [] },
    { deals: [d("a", "9")], removed: ["b"], removedOwned: ["o1"] });
  assert.deepStrictEqual(payload.deals.map(x => x.id), ["a"]);
  assert.strictEqual(payload.owned.length, 0);
  assert.strictEqual(summary.removed, 2);
  const back = mergeData({ deals: [], removed: ["a"] }, { deals: [d("a", "9")] });
  assert.strictEqual(back.payload.deals.length, 0);
});

test("a damaged or empty Drive file leaves this device unchanged", () => {
  const local = { deals: [d("a", "1")], owned: [d("o1", "1")], settings: { radius: 75, updatedAt: "1" } };
  for (const bad of [null, "nonsense", {}, { deals: "x" }]) {
    const { payload } = mergeData(local, bad);
    assert.strictEqual(payload.deals.length, 1);
    assert.strictEqual(payload.owned.length, 1);
    assert.strictEqual(payload.settings.radius, 75);
  }
});

test("newer settings win", () => {
  const { payload } = mergeData({ settings: { radius: 50, updatedAt: "1" } }, { settings: { radius: 100, updatedAt: "2" } });
  assert.strictEqual(payload.settings.radius, 100);
});
