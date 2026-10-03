// Merging two copies of DealDesk data (this device and the Google Drive file).
// Used by index.html and by tools/test-sync.js. Pure: it changes neither input.
//
// Rules: a record that exists on only one side is kept. When both sides have
// it, the one changed most recently wins (ties keep this device's copy).
// Anything deleted on either side stays deleted.
function mergeData(local, remote) {
  const L = local || {}, R = (remote && typeof remote === "object") ? remote : {};
  const arr = x => Array.isArray(x) ? x : [];
  const when = x => String((x && x.updatedAt) || "");
  const summary = { added: 0, updated: 0, removed: 0 };
  const removed = [...new Set([...arr(L.removed), ...arr(R.removed)])];
  const removedOwned = [...new Set([...arr(L.removedOwned), ...arr(R.removedOwned)])];
  function mergeList(a, b, gone) {
    const dead = new Set(gone), out = new Map();
    for (const x of arr(a)) if (x && x.id) { if (dead.has(x.id)) summary.removed++; else out.set(x.id, x); }
    for (const y of arr(b)) {
      if (!y || !y.id || dead.has(y.id)) continue;
      const mine = out.get(y.id);
      if (!mine) { out.set(y.id, y); summary.added++; }
      else if (when(y) > when(mine)) { out.set(y.id, y); summary.updated++; }
    }
    return [...out.values()];
  }
  const settings = when(R.settings) > when(L.settings) ? R.settings : (L.settings || R.settings || {});
  return {
    payload: {
      app: "DealDesk", format: 1,
      deals: mergeList(L.deals, R.deals, removed),
      owned: mergeList(L.owned, R.owned, removedOwned),
      removed, removedOwned, settings
    },
    summary
  };
}
if (typeof module !== "undefined") module.exports = { mergeData };
