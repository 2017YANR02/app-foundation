/** A candidate credential's owner after authoritative application lookup. */
export type CandidateOwner = "unclaimed" | "same-account" | "other-account";

/** The account's current credential in the provider slot being changed. */
export type CurrentSlot = "empty" | "same-candidate" | "different";

export type CredentialClaimIntent = "add" | "replace";

export interface CredentialClaimInput {
  intent: CredentialClaimIntent;
  candidateOwner: CandidateOwner;
  currentSlot: CurrentSlot;
}

export type CredentialClaimDecision =
  | "apply"
  | "already-bound"
  | "owner-conflict"
  | "slot-occupied"
  | "missing-current";

/**
 * Decide whether to add or replace a sign-in credential. The caller must
 * establish ownership and slot state from authoritative storage, then recheck
 * both inside its own transaction or lock before writing.
 */
export function decideCredentialClaim(input: CredentialClaimInput): CredentialClaimDecision {
  if (!input || (input.intent !== "add" && input.intent !== "replace")
    || !["unclaimed", "same-account", "other-account"].includes(input.candidateOwner)
    || !["empty", "same-candidate", "different"].includes(input.currentSlot)) {
    throw new TypeError("Invalid credential claim input");
  }

  if (input.candidateOwner === "other-account") return "owner-conflict";
  if (input.currentSlot === "same-candidate") return "already-bound";
  if (input.intent === "add" && input.currentSlot === "different") return "slot-occupied";
  if (input.intent === "replace" && input.currentSlot === "empty") return "missing-current";
  return "apply";
}

export interface CredentialRemovalInput {
  /** Count only currently usable sign-in identities, not profile or password metadata. */
  activeMethodCount: number;
  /** Count the active identities selected for this removal, including provider aliases. */
  selectedMethodCount: number;
}

export type CredentialRemovalDecision = "remove" | "method-absent" | "last-method";

/**
 * Keep at least one usable sign-in identity after removal. Counts are supplied
 * by the caller from authoritative state under its own transaction or lock.
 */
export function decideCredentialRemoval(input: CredentialRemovalInput): CredentialRemovalDecision {
  if (!input || !Number.isSafeInteger(input.activeMethodCount)
    || !Number.isSafeInteger(input.selectedMethodCount)
    || input.activeMethodCount < 0 || input.selectedMethodCount < 0
    || input.selectedMethodCount > input.activeMethodCount) {
    throw new TypeError("Invalid credential removal input");
  }

  if (input.selectedMethodCount === 0) return "method-absent";
  if (input.activeMethodCount === input.selectedMethodCount) return "last-method";
  return "remove";
}
