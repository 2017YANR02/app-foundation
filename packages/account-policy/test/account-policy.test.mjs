import assert from "node:assert/strict";
import test from "node:test";
import { decideCredentialClaim, decideCredentialRemoval } from "../dist/index.js";

test("claim keeps ownership conflict ahead of idempotency and slot errors", () => {
  for (const intent of ["add", "replace"]) {
    for (const currentSlot of ["empty", "same-candidate", "different"]) {
      assert.equal(decideCredentialClaim({ intent, candidateOwner: "other-account", currentSlot }), "owner-conflict");
    }
  }
});

test("claim requires explicit add or replace intent", () => {
  const owner = "unclaimed";
  assert.equal(decideCredentialClaim({ intent: "add", candidateOwner: owner, currentSlot: "empty" }), "apply");
  assert.equal(decideCredentialClaim({ intent: "add", candidateOwner: owner, currentSlot: "different" }), "slot-occupied");
  assert.equal(decideCredentialClaim({ intent: "replace", candidateOwner: owner, currentSlot: "empty" }), "missing-current");
  assert.equal(decideCredentialClaim({ intent: "replace", candidateOwner: owner, currentSlot: "different" }), "apply");
});

test("claim permits same-account ownership in a separate system and idempotent claims", () => {
  assert.equal(decideCredentialClaim({ intent: "add", candidateOwner: "same-account", currentSlot: "empty" }), "apply");
  assert.equal(decideCredentialClaim({ intent: "replace", candidateOwner: "same-account", currentSlot: "different" }), "apply");
  for (const intent of ["add", "replace"]) {
    assert.equal(decideCredentialClaim({ intent, candidateOwner: "same-account", currentSlot: "same-candidate" }), "already-bound");
  }
});

test("claim rejects invalid runtime inputs without exposing values", () => {
  for (const input of [null, {}, { intent: "merge", candidateOwner: "unclaimed", currentSlot: "empty" },
    { intent: "add", candidateOwner: "unknown", currentSlot: "empty" },
    { intent: "add", candidateOwner: "unclaimed", currentSlot: "unknown" }]) {
    assert.throws(() => decideCredentialClaim(input), { name: "TypeError", message: "Invalid credential claim input" });
  }
});

test("removal counts all selected aliases and retains a usable identity", () => {
  assert.equal(decideCredentialRemoval({ activeMethodCount: 3, selectedMethodCount: 2 }), "remove");
  assert.equal(decideCredentialRemoval({ activeMethodCount: 2, selectedMethodCount: 2 }), "last-method");
  assert.equal(decideCredentialRemoval({ activeMethodCount: 1, selectedMethodCount: 1 }), "last-method");
  assert.equal(decideCredentialRemoval({ activeMethodCount: 0, selectedMethodCount: 0 }), "method-absent");
  assert.equal(decideCredentialRemoval({ activeMethodCount: 3, selectedMethodCount: 0 }), "method-absent");
});

test("removal rejects invalid counts", () => {
  for (const input of [null, {}, { activeMethodCount: -1, selectedMethodCount: 0 },
    { activeMethodCount: 1, selectedMethodCount: -1 },
    { activeMethodCount: 1, selectedMethodCount: 2 },
    { activeMethodCount: 1.5, selectedMethodCount: 1 },
    { activeMethodCount: Number.MAX_SAFE_INTEGER + 1, selectedMethodCount: 1 },
    { activeMethodCount: 1, selectedMethodCount: Infinity }]) {
    assert.throws(() => decideCredentialRemoval(input), { name: "TypeError", message: "Invalid credential removal input" });
  }
});
