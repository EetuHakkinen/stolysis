// First row per key. Insert-only tables (result_row, estimate_row,
// valuation_multiple_value) are read newest first
// (by createdAt, then id), so the first row per key is the current one.
export function latestRows<T>(rows: T[], key: (row: T) => string | number): T[] {
  const latest = new Map<string | number, T>();
  for (const row of rows) {
    const rowKey = key(row);
    if (!latest.has(rowKey)) latest.set(rowKey, row);
  }
  return [...latest.values()];
}

// Rows created at or before asOf, in the same order; all rows without asOf.
export function rowsAsOf<T extends { createdAt: Date }>(rows: T[], asOf: Date | undefined): T[] {
  return asOf ? rows.filter((row) => row.createdAt <= asOf) : rows;
}
