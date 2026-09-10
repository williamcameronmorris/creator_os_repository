// Run with: deno test supabase/functions/postforme-sync/reconcile_test.ts
// Named *_test.ts (Deno's convention) so vitest's **/*.test.ts glob skips it.
import { isPublishHandle, matchBookedRows, matchByPublishWindow } from "./reconcile.ts";

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

Deno.test("a TikTok publish handle counts as unstamped, a real id does not", () => {
  if (!isPublishHandle("v_pub_file~v2-1.7683720894971250702")) throw new Error("v_pub_file should be a handle");
  if (!isPublishHandle("v_inbox_file~v2-1.1")) throw new Error("v_inbox_file should be a handle");
  if (isPublishHandle("7681186161766698254")) throw new Error("numeric id is not a handle");
  if (isPublishHandle(null)) throw new Error("null is not a handle");
  const m = matchBookedRows([feedItem()], [row({ platform_post_id: "v_pub_file~v2-1.1" })], USER);
  assertEq(m.map((x) => x.row.id), ["row-1"], "handle-stamped row still matches by social_post_id");
});

const T0 = Date.parse("2026-09-10T02:00:00Z");
const WINDOW = 30 * 60_000;

interface FeedWindowItem {
  social_post_id: string | null;
  platform_post_id: string | null;
  social_account_id: string | null;
  external_post_id: string | null;
  posted_at: string | null;
}

function tiktokItem(over: Partial<FeedWindowItem> = {}): FeedWindowItem {
  return {
    social_post_id: null,
    platform_post_id: "7683720894971250702",
    social_account_id: "spc_tt",
    external_post_id: USER,
    posted_at: new Date(T0 + 3 * 60_000).toISOString(),
    ...over,
  };
}

function tiktokRow(over: Partial<ReturnType<typeof row>> & { scheduled_for?: string | null; status?: string | null } = {}) {
  return {
    ...row({ id: "tt-1", postforme_post_id: "sp_tt", social_account_id: "spc_tt" }),
    scheduled_for: new Date(T0).toISOString() as string | null,
    status: "published" as string | null,
    ...over,
  };
}

Deno.test("window fallback pairs a feed item with the one booked row in its window", () => {
  const m = matchByPublishWindow([tiktokItem()], [tiktokRow()], USER, WINDOW);
  assertEq(m.map((x) => [x.post.platform_post_id, x.row.id]), [["7683720894971250702", "tt-1"]], "paired");
});

Deno.test("window fallback accepts a row stamped with a publish handle", () => {
  const m = matchByPublishWindow([tiktokItem()], [tiktokRow({ platform_post_id: "v_pub_file~v2-1.1" })], USER, WINDOW);
  assertEq(m.length, 1, "handle is not a real stamp");
});

Deno.test("window fallback ignores items that carry a social_post_id (id matcher owns those)", () => {
  const m = matchByPublishWindow([tiktokItem({ social_post_id: "sp_x" })], [tiktokRow()], USER, WINDOW);
  assertEq(m.length, 0, "left to the id matcher");
});

Deno.test("window fallback skips when two rows sit in the window", () => {
  const rows = [tiktokRow({ id: "a" }), tiktokRow({ id: "b", scheduled_for: new Date(T0 + 5 * 60_000).toISOString() })];
  assertEq(matchByPublishWindow([tiktokItem()], rows, USER, WINDOW).length, 0, "ambiguous rows");
});

Deno.test("window fallback skips when two items want the same row", () => {
  const items = [tiktokItem(), tiktokItem({ platform_post_id: "999", posted_at: new Date(T0 + 6 * 60_000).toISOString() })];
  assertEq(matchByPublishWindow(items, [tiktokRow()], USER, WINDOW).length, 0, "ambiguous items");
});

Deno.test("window fallback never takes failed rows, other accounts, stamped rows, or claimed rows", () => {
  const item = tiktokItem();
  assertEq(matchByPublishWindow([item], [tiktokRow({ status: "failed" })], USER, WINDOW).length, 0, "failed");
  assertEq(matchByPublishWindow([item], [tiktokRow({ social_account_id: "spc_other" })], USER, WINDOW).length, 0, "other account");
  assertEq(matchByPublishWindow([item], [tiktokRow({ platform_post_id: "123" })], USER, WINDOW).length, 0, "stamped");
  assertEq(matchByPublishWindow([item], [tiktokRow()], USER, WINDOW, new Set(["tt-1"])).length, 0, "claimed row");
  assertEq(matchByPublishWindow([item], [tiktokRow()], USER, WINDOW, new Set(), new Set([item.platform_post_id as string])).length, 0, "claimed post");
});

Deno.test("window fallback respects the window", () => {
  const far = tiktokItem({ posted_at: new Date(T0 + 45 * 60_000).toISOString() });
  assertEq(matchByPublishWindow([far], [tiktokRow()], USER, WINDOW).length, 0, "outside window");
});
