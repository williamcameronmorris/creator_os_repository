// Run with: deno test supabase/functions/postforme-sync/reconcile_test.ts
// Named *_test.ts (Deno's convention) so vitest's **/*.test.ts glob skips it.
import { matchBookedRows } from "./reconcile.ts";

const USER = "user-1";

function feedItem(over: Partial<Parameters<typeof matchBookedRows>[0][number]> = {}) {
  return {
    social_post_id: "sp_1",
    platform_post_id: "ig_100",
    social_account_id: "spc_ig",
    external_post_id: USER,
    ...over,
  };
}

function row(over: Partial<Parameters<typeof matchBookedRows>[1][number]> = {}) {
  return {
    id: "row-1",
    postforme_post_id: "sp_1",
    social_account_id: "spc_ig",
    platform_post_id: null,
    ...over,
  };
}

function assertEq<T>(actual: T, expected: T, msg: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  expected ${e}\n  actual   ${a}`);
}

Deno.test("matches a booked row by social_post_id + account", () => {
  const m = matchBookedRows([feedItem()], [row()], USER);
  assertEq(m.map((x) => x.row.id), ["row-1"], "one match");
});

Deno.test("prefers the row for the same account when two accounts share a PFM post", () => {
  const rows = [
    row({ id: "row-ig", social_account_id: "spc_ig" }),
    row({ id: "row-ig2", social_account_id: "spc_ig_second" }),
  ];
  const feed = [
    feedItem({ platform_post_id: "ig_100", social_account_id: "spc_ig" }),
    feedItem({ platform_post_id: "ig_200", social_account_id: "spc_ig_second" }),
  ];
  const m = matchBookedRows(feed, rows, USER);
  assertEq(
    m.map((x) => [x.post.platform_post_id, x.row.id]),
    [["ig_100", "row-ig"], ["ig_200", "row-ig2"]],
    "each account gets its own row",
  );
});

Deno.test("falls back to a single legacy row with no social_account_id", () => {
  const m = matchBookedRows([feedItem()], [row({ social_account_id: null })], USER);
  assertEq(m.map((x) => x.row.id), ["row-1"], "legacy row matched");
});

Deno.test("does not guess between two legacy rows", () => {
  const rows = [
    row({ id: "a", social_account_id: null }),
    row({ id: "b", social_account_id: null }),
  ];
  assertEq(matchBookedRows([feedItem()], rows, USER).length, 0, "ambiguous, skipped");
});

Deno.test("re-running with an already stamped row is idempotent", () => {
  const m = matchBookedRows([feedItem()], [row({ platform_post_id: "ig_100" })], USER);
  assertEq(m.map((x) => x.row.id), ["row-1"], "same platform id still matches");
});

Deno.test("never rebinds a row stamped with a different platform post id", () => {
  const m = matchBookedRows([feedItem()], [row({ platform_post_id: "ig_999" })], USER);
  assertEq(m.length, 0, "different id, skipped");
});

Deno.test("ignores feed items without ids and items belonging to another user", () => {
  const feed = [
    feedItem({ social_post_id: null }),
    feedItem({ platform_post_id: null }),
    feedItem({ external_post_id: "someone-else" }),
  ];
  assertEq(matchBookedRows(feed, [row()], USER).length, 0, "nothing matched");
});

Deno.test("a feed item with no external_post_id still matches (older posts)", () => {
  const m = matchBookedRows([feedItem({ external_post_id: null })], [row()], USER);
  assertEq(m.length, 1, "matched");
});

Deno.test("one row per item and one item per row", () => {
  // YouTube's feed repeats entries across pages; the caller dedupes by
  // platform_post_id, but a repeated item must not claim a second row either.
  const feed = [feedItem(), feedItem()];
  const rows = [row({ id: "a" }), row({ id: "b" })];
  const m = matchBookedRows(feed, rows, USER);
  assertEq(m.length, 1, "duplicate feed item does not claim a second row");
});
