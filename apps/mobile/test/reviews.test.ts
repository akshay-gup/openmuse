import assert from "node:assert/strict";
import test from "node:test";
import { isMine, requesterName } from "../src/reviews.ts";

test("a review is yours when your account prepared it, or when nobody is recorded", () => {
  assert.equal(isMine({ createdBy: "google:alice" }, "google:alice"), true);
  assert.equal(isMine({ createdBy: "google:alice" }, "google:bob"), false);
  assert.equal(isMine({}, "google:bob"), true);
  assert.equal(isMine({ createdBy: "google:alice" }, undefined), true);
});

test("a teammate is named when known", () => {
  assert.equal(requesterName({ createdByName: "Alice" }), "Alice");
  assert.equal(requesterName({}), "a teammate");
});
