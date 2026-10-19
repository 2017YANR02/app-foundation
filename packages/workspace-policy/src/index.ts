/** Pure decisions. Consumers authenticate actors and load current grants from storage. */
export type WorkspaceActor =
  | { kind: "staff"; id: number; role: "member" | "manager" }
  | { kind: "admin"; id: number; role: "admin" };
export type ReportStatus = "draft" | "submitted";
export type ReportVisibility = "company" | "managers";
export type ReportState = {
  memberId: number;
  projectId: string | null;
  workDate: string;
  status: ReportStatus;
  visibility: ReportVisibility;
  version: number;
};
export type ReportReadScope = {
  ownMemberId: number | null;
  submittedVisibilities: readonly ReportVisibility[];
  /** null means all projects; [] means only legacy, unassigned reports. */
  projectIds: readonly string[] | null;
};
export function reportReadScope(actor: WorkspaceActor, assignedProjects: readonly string[]): ReportReadScope {
  return {
    ownMemberId: actor.kind === "staff" ? actor.id : null,
    submittedVisibilities: actor.role === "member" ? ["company"] : ["company", "managers"],
    projectIds: actor.kind === "admin" ? null : [...new Set(assignedProjects)],
  };
}
export function canReadReport(scope: ReportReadScope, report: ReportState): boolean {
  if (report.projectId !== null && scope.projectIds !== null && !scope.projectIds.includes(report.projectId)) return false;
  return scope.ownMemberId === report.memberId
    || (report.status === "submitted" && scope.submittedVisibilities.includes(report.visibility));
}
export function canWriteProject(actor: WorkspaceActor, project: { active: boolean; assigned: boolean } | null): boolean {
  return actor.kind === "staff" && (project === null || (project.active && project.assigned));
}
export type ReportChangeDecision = "allow" | "not-author" | "stale-version" | "date-fixed" | "project-fixed" | "submission-fixed";
export function decideReportChange(actor: WorkspaceActor, previous: ReportState | null,
  next: Pick<ReportState, "projectId" | "workDate" | "status" | "visibility" | "version">): ReportChangeDecision {
  if (actor.kind !== "staff" || (previous && previous.memberId !== actor.id)) return "not-author";
  if ((previous?.version ?? 0) !== next.version) return "stale-version";
  if (previous && previous.workDate !== next.workDate) return "date-fixed";
  if (previous && previous.projectId !== next.projectId) return "project-fixed";
  if (previous?.status === "submitted" && (next.status !== "submitted" || next.visibility !== previous.visibility)) return "submission-fixed";
  return "allow";
}
export function isWorkDate(value: unknown): value is string {
  return typeof value === "string" && /^20\d{2}-\d{2}-\d{2}$/u.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function isResultUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }
  catch { return false; }
}
