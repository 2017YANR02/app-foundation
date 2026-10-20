import type { WorkspaceActor, ReportStatus, ReportVisibility } from "@app-foundation/workspace-policy";
export type StaffActor = WorkspaceActor & { name: string };

export type WorkReport = {
  projectId: string | null; projectName: string | null; projectActive: boolean | null;
  id: string; memberId: number; name: string; workDate: string;
  progress: string; resultUrl: string; help: string; next: string;
  visibility: ReportVisibility; status: ReportStatus;
  version: number; createdAt: number; updatedAt: number;
};
export type ReportDetail = {
  report: WorkReport;
  comments: { id: string; name: string; body: string; createdAt: number }[];
  revisions: { version: number; createdAt: number; snapshot: Omit<WorkReport, "name" | "projectName" | "projectActive" | "projectId"> & { projectId?: string | null } }[];
};
export type MemberDirectory = { id: number; name: string; active: boolean }[];
export type MemberAdminData = {
  members: { id: number; email: string; name: string; role: "member" | "manager"; active: boolean }[];
  invitations: { id: string; email: string; name: string; memberId: number | null; expiresAt: number }[];
};

export type StaffProject = { id: string; name: string; url: string; active: boolean; version: number; createdAt: number; memberIds: number[] };
export type ProjectList = { projects: StaffProject[] };
