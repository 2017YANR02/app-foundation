import assert from "node:assert/strict";
import { test } from "node:test";
import { reportReadScope, canReadReport, canWriteProject, decideReportChange, isWorkDate, isResultUrl } from "../dist/index.js";
const member = { kind: "staff", id: 1, role: "member" };
const manager = { kind: "staff", id: 2, role: "manager" };
const admin = { kind: "admin", id: 1, role: "admin" };
const report = { memberId: 1, projectId: "project-a", workDate: "2026-10-19", status: "draft", visibility: "company", version: 1 };
test("drafts belong to their author, never a same-number administrator", () => {
  assert.equal(canReadReport(reportReadScope(member, ["project-a"]), report), true);
  for (const actor of [manager, admin]) assert.equal(canReadReport(reportReadScope(actor, ["project-a"]), report), false);
});
test("project membership is required even for authors and company managers", () => {
  for (const actor of [member, manager]) assert.equal(canReadReport(reportReadScope(actor, []), { ...report, status: "submitted" }), false);
  assert.equal(canReadReport(reportReadScope(admin, []), { ...report, status: "submitted" }), true);
  assert.equal(canReadReport(reportReadScope(manager, ["project-a"]), { ...report, status: "submitted", visibility: "managers" }), true);
  assert.equal(canReadReport(reportReadScope({ ...member, id: 3 }, ["project-a"]), { ...report, status: "submitted", visibility: "managers" }), false);
});
test("unassigned legacy reports preserve prior visibility", () => {
  assert.equal(canReadReport(reportReadScope(manager, []), { ...report, projectId: null, status: "submitted", visibility: "managers" }), true);
  assert.equal(canReadReport(reportReadScope({ ...member, id: 3 }, []), { ...report, projectId: null, status: "submitted" }), true);
});
test("archived projects remain readable but cannot receive new staff work", () => {
  assert.equal(canWriteProject(member, { active: false, assigned: true }), false);
  assert.equal(canWriteProject(member, { active: true, assigned: false }), false);
  assert.equal(canWriteProject(member, { active: true, assigned: true }), true);
  assert.equal(canWriteProject(admin, null), false);
});
test("transitions preserve author, version, date, project and submitted visibility", () => {
  assert.equal(decideReportChange(member, report, report), "allow");
  assert.equal(decideReportChange(admin, report, report), "not-author");
  assert.equal(decideReportChange(member, report, { ...report, version: 0 }), "stale-version");
  assert.equal(decideReportChange(member, report, { ...report, projectId: null }), "project-fixed");
  assert.equal(decideReportChange(member, report, { ...report, workDate: "2026-10-18" }), "date-fixed");
  const submitted = { ...report, status: "submitted", visibility: "managers" };
  assert.equal(decideReportChange(member, submitted, report), "submission-fixed");
  assert.equal(decideReportChange(member, submitted, { ...submitted, visibility: "company" }), "submission-fixed");
});
test("calendar dates and result links are validated without I/O", () => {
  for (const invalid of [null, "2026-02-30", "2026-13-01", "2026-2-01"]) assert.equal(isWorkDate(invalid), false);
  assert.equal(isWorkDate("2024-02-29"), true);
  for (const invalid of [null, "javascript:alert(1)", "http://example.test", "https://user:pass@example.test"]) assert.equal(isResultUrl(invalid), false);
  assert.equal(isResultUrl("https://example.test/result"), true);
});
