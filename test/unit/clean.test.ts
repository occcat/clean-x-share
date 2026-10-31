import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLink, cleanXLink, displayLink } from "../../src/clean.ts";

test("post link from Share → Copy link loses the ? part", () => {
  assert.equal(
    cleanXLink("https://x.com/RedefineFX/status/2112161593392038386?a=Sample0Share1Token2&s=20"),
    "https://x.com/RedefineFX/status/2112161593392038386",
  );
});

test("profile link from Copy link to profile loses ?s=20", () => {
  assert.equal(cleanXLink("https://x.com/RedefineFX?s=20"), "https://x.com/RedefineFX");
});

test("the split point is the first ?", () => {
  assert.deepEqual(checkLink("https://x.com/a/status/1?s=46&t=abc?x"), { kind: "clean", keep: "https://x.com/a/status/1", cut: "?s=46&t=abc?x" });
});

test("twitter.com, www. and mobile. hosts count; case does not matter", () => {
  for (const host of ["twitter.com", "www.x.com", "mobile.twitter.com", "X.COM", "Mobile.X.com"]) {
    assert.equal(cleanXLink(`https://${host}/a/status/1?s=20`), `https://${host}/a/status/1`, host);
  }
});

test("a link without a scheme keeps its own spelling", () => {
  assert.equal(cleanXLink("x.com/a/status/1?s=20"), "x.com/a/status/1");
});

test("surrounding whitespace is dropped", () => {
  assert.equal(cleanXLink("  https://x.com/a?s=20\n"), "https://x.com/a");
});

test("nothing to cut", () => {
  assert.deepEqual(checkLink("https://x.com/a/status/1"), { kind: "noQuery" });
  // A ? after the # belongs to the fragment.
  assert.deepEqual(checkLink("https://x.com/a#b?c"), { kind: "noQuery" });
});

test("other text is left alone", () => {
  for (const s of [
    "",
    "   ",
    "hello?",
    "https://example.com/a?b=1",
    "https://notx.com/a?b=1",
    "https://x.com.evil.com/a?b=1",
    "https://evil.com/?u=https://x.com/a",
    "ftp://x.com/a?b=1",
    "javascript:alert(1)//x.com?a",
    "see https://x.com/a?s=20",
    "https://x.com/a?s=20 https://x.com/b?s=20",
  ]) {
    assert.equal(cleanXLink(s), null, JSON.stringify(s));
  }
});

test("displayLink drops the scheme", () => {
  assert.equal(displayLink("https://x.com/a"), "x.com/a");
  assert.equal(displayLink("x.com/a"), "x.com/a");
});
