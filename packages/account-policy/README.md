# @app-foundation/account-policy

Version 0.1.0 is a pure account credential decision library for Node >=22. It
contains no identity lookup, database, session, provider integration or account
merge implementation. It is not compatible with Mira's Node 16 CloudBase
functions; Mira Web and CubeRoot API are the intended direct consumers.

```ts
import { decideCredentialClaim, decideCredentialRemoval } from "@app-foundation/account-policy";

const claim = decideCredentialClaim({
  intent: "add", // or "replace"; never infer replacement from an occupied slot
  candidateOwner: "unclaimed", // "same-account" or "other-account"
  currentSlot: "empty", // "same-candidate" or "different"
});
// "apply" | "already-bound" | "owner-conflict" | "slot-occupied" | "missing-current"

const removal = decideCredentialRemoval({
  activeMethodCount: 3,
  selectedMethodCount: 2,
});
// "remove" | "method-absent" | "last-method"
```

`candidateOwner` is the ownership of the credential being claimed. `currentSlot`
is the account's present credential in the provider slot being changed. An
application may report `same-account` plus `empty` when, for example, the
candidate already belongs to this account in another identity system but has
not been enabled as this website's login credential. `other-account` always
returns `owner-conflict`, even if the other fields suggest an idempotent claim.
An already bound credential returns `already-bound`. `add` refuses an occupied
slot, while `replace` refuses an empty slot. Invalid runtime inputs throw a
generic `TypeError` and are never interpreted as permission to write. In
particular, `unclaimed` plus `same-candidate` is inconsistent: callers must
include ownership from the current slot when deriving `candidateOwner`.
`other-account` still returns `owner-conflict` before idempotency or slot
decisions, so a conflicting authoritative lookup never authorizes a write.

For removal, count **usable sign-in identities** under the application's own
rules. A password field, unverified address or profile contact is not
automatically a sign-in method. `selectedMethodCount` includes every active
identity selected for the removal, including aliases. Zero selected returns
`method-absent`; removing all active methods returns `last-method`. Counts must
be nonnegative safe integers with `selectedMethodCount <= activeMethodCount`.

The caller owns identity normalization, authoritative ownership lookup,
eligibility, fresh authentication, verification codes, locking, transaction
boundaries, conflict mapping, audit and notifications. Re-read and re-evaluate
ownership, slot state and removal counts inside the transaction or lock that
writes the account. The functions alone provide no concurrency, one-time-use or
cross-system consistency guarantee. They never merge accounts or decide how
orders, entitlements or user records transfer.
