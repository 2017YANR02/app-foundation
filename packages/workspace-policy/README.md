# @app-foundation/workspace-policy

Pure, storage-independent work report rules. Node >=22. Candidate 0.1.0.

- `reportReadScope(actor, assignedProjects)` supplies author, visibility and
  project constraints for an application's database query. Apply every constraint
  **before pagination/count/search**. `null` project IDs preserve legacy company
  records. A company manager still needs project membership; admins can read all
  submitted reports, never private drafts merely because numeric IDs coincide.
- `canReadReport(scope, report)` is the equivalent single-record decision.
- `canWriteProject` blocks writes to archived or unassigned projects.
- `decideReportChange` preserves author, optimistic version, date, project and
  submitted visibility. Applications keep the transaction and atomic update.
- `isWorkDate` and `isResultUrl` validate calendar dates and HTTPS result links.

Inputs must be runtime-validated by the consumer. Re-read actor/grants from trusted
storage on each request. The package does not authenticate, authorize itself,
query databases, mutate sessions, fetch links or read environment variables.
Private draft history remains author-only in the application. Existing comments
use the same read scope as their report. Changing membership takes effect before
subsequent reads/writes, including the former author's access.

Publish a reviewed immutable artifact before production adoption. Local candidate
integration uses the packed, checksummed artifact, never cross-repository source
imports or symlinks. Versioned release approval is separate from website deployment.
