"use client";
import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "./host";
import { useResource, Form, Field, ErrorNotice, value, dateTime, today } from "./client";
import type { ReportDetail, StaffActor, WorkReport, MemberDirectory, ProjectList, StaffProject } from "./contract";
export function ReportEditor({ report, onSaved }: { report?: WorkReport; onSaved?: () => void }) {
  const { api, Link, Button, t } = useWorkspace();
  const { navigate } = useWorkspace();
  const projects = useResource<ProjectList>("projects");
  const [projectId, setProjectId] = useState(report?.projectId ?? "");
  const newId = useRef<string | undefined>(undefined);
  useEffect(() => { if (!report) setWorkDate(today()); }, [report]);
  const [workDate, setWorkDate] = useState(report?.workDate ?? "");
  return <section className="staff-panel"><h2>{report ? t("编辑工作记录") : t("记录今日进展")}</h2><p className="staff-muted">{t("写清结果与需要的协助；草稿仅自己可见。每个项目每天一条，可以继续补充。")}</p>
    <Form submit={async (data, button) => {
      if (!projects.data) throw new Error(t("请先加载项目列表"));
      newId.current ??= crypto.randomUUID();
      const saved = await api<{ id: string }>("report", { id: report?.id ?? newId.current, version: report?.version ?? 0,
        projectId: projectId || null, workDate, progress: value(data, "progress"), resultUrl: value(data, "resultUrl"), help: value(data, "help"), next: value(data, "next"),
        visibility: report?.status === "submitted" ? report.visibility : value(data, "visibility"), status: report?.status === "submitted" ? "submitted" : button });
      if (onSaved) onSaved(); else navigate(`/workspace/updates/${saved.id}`);
    }}>
      <ErrorNotice error={projects.error} retry={projects.reload} />
      <Field label={t("项目")}><select name="projectId" value={projectId} disabled={Boolean(report) || !projects.data} onChange={e => setProjectId(e.target.value)}><option value="">{t("公司公共")}</option>{projects.data?.projects.filter(project => project.active || project.id === report?.projectId).map(project => <option key={project.id} value={project.id}>{project.name}{project.active ? "" : t("（已归档）")}</option>)}</select></Field>
      <div className="staff-form-row"><Field label={t("工作日期")}><input type="date" name="workDate" value={workDate} onChange={e => setWorkDate(e.target.value)} readOnly={Boolean(report)} required /></Field>
        <Field label={t("提交后谁可以看")}><select name="visibility" defaultValue={report?.visibility ?? "company"} disabled={report?.status === "submitted"}><option value="company">{projectId ? t("项目成员") : t("公司全员")}</option><option value="managers">{projectId ? t("本人、项目内负责人及管理员") : t("本人、负责人及管理员")}</option></select></Field></div>
      <Field label={t("今日进展")}><textarea name="progress" rows={5} maxLength={5000} defaultValue={report?.progress} placeholder={t("完成了什么，取得了什么结果？")} /></Field>
      <Field label={t("成果链接（选填）")}><input name="resultUrl" type="url" maxLength={2000} defaultValue={report?.resultUrl} placeholder="https://…" /></Field>
      <p className="staff-muted">{t("请确认链接中的资料也已设置合适的访问权限。")}</p>
      <div className="staff-form-row"><Field label={t("需要协助（选填）")}><textarea name="help" rows={3} maxLength={2000} defaultValue={report?.help} placeholder={t("卡在哪里，需要什么帮助？")} /></Field><Field label={t("下一步（选填）")}><textarea name="next" rows={3} maxLength={2000} defaultValue={report?.next} placeholder={t("准备推进什么？")} /></Field></div>
      <div className="staff-actions">{report?.status !== "submitted" && <Button variant="secondary" type="submit" value="draft">{t("保存草稿")}</Button>}<Button type="submit" value="submitted">{report?.status === "submitted" ? t("保存修改") : t("提交工作")}</Button></div>
      {report?.status === "submitted" && <p className="staff-muted">{t("已提交记录保留原可见范围，修改会留下历史版本。")}</p>}
    </Form></section>;
}
export function Reports({ directory, mine = false }: { actor: StaffActor; directory: MemberDirectory; mine?: boolean }) {
  const { api, Link, Button, t } = useWorkspace();
  const projects = useResource<ProjectList>("projects");
  const [filters, setFilters] = useState({ projectId: "", memberId: "", date: "", search: "", page: 1 });
  const params = new URLSearchParams({ mine: String(mine), ...Object.fromEntries(Object.entries(filters).map(([key, value]) => [key, String(value)])) });
  const resource = useResource<{ reports: WorkReport[]; hasMore: boolean; page: number }>(`reports?${params}`);
  return <><form className="staff-filters" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); setFilters({ projectId: value(data, "projectId"), memberId: value(data, "memberId"), date: value(data, "date"), search: value(data, "search"), page: 1 }); }}>
    <Field label={t("项目")}><select name="projectId"><option value="">{t("全部项目")}</option><option value="unassigned">{t("公司公共")}</option>{projects.data?.projects.map(project => <option key={project.id} value={project.id}>{project.name}{project.active ? "" : t("（已归档）")}</option>)}</select></Field>
    {!mine && <Field label={t("成员")}><select name="memberId"><option value="">{t("所有成员")}</option>{directory.map(member => <option key={member.id} value={member.id}>{member.name}{member.active ? "" : t("（已停用）")}</option>)}</select></Field>}
    <Field label={t("日期")}><input type="date" name="date" /></Field><Field label={t("关键词")}><input name="search" maxLength={100} placeholder={t("搜索进展、协助、下一步")} /></Field><Button type="submit" variant="secondary">{t("筛选")}</Button>
  </form>
    <ErrorNotice error={projects.error} retry={projects.reload} />
    {resource.loading && <p role="status">{t("正在加载工作记录…")}</p>}<ErrorNotice error={resource.error} retry={resource.reload} />
    {resource.data?.reports.length === 0 && <div className="staff-empty">{t("当前条件下还没有工作记录。")}</div>}
    <div className="staff-feed">{resource.data?.reports.map(report => <article className="staff-panel" key={report.id}>
      <div className="staff-report-meta"><strong>{report.name}</strong><time>{report.workDate}</time><span>{report.projectName ?? t("公司公共")}</span><span className="staff-badge">{report.status === "draft" ? t("个人草稿") : report.visibility === "company" ? (report.projectId ? t("项目共享") : t("公司共享")) : t("仅负责人")}</span></div>
      <p className="staff-preserve">{report.progress.length > 300 ? `${report.progress.slice(0, 300)}…` : report.progress || t("尚未填写进展")}</p>
      {report.help && <p className="staff-muted">{t("需要协助：")}{report.help.slice(0, 120)}{report.help.length > 120 ? "…" : ""}</p>}
      <Link href={`/workspace/updates/${report.id}`}>{t("查看记录与讨论 →")}</Link>
    </article>)}</div>
    {resource.data && <div className="staff-pagination"><Button variant="secondary" disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>{t("上一页")}</Button><span>{t("第")}{filters.page} {t("页")}</span><Button variant="secondary" disabled={!resource.data.hasMore} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>{t("下一页")}</Button></div>}
  </>;
}
export function ReportDetailPanel({ actor, id }: { actor: StaffActor; id: string }) {
  const { api, Link, Button, t } = useWorkspace();
  const detail = useResource<ReportDetail>(`detail?id=${encodeURIComponent(id)}`);
  const [editing, setEditing] = useState(false);
  const commentId = useRef<string | undefined>(undefined);
  const [comment, setComment] = useState("");
  const report = detail.data?.report;
  const owner = actor.kind === "staff" && report?.memberId === actor.id;
  const archived = report?.projectActive === false;
  return <><Link href="/workspace/updates">{t("← 团队动态")}</Link><ErrorNotice error={detail.error} retry={detail.reload} />{detail.loading && <p role="status">{t("正在加载记录…")}</p>}
    {report && (editing && owner && !archived ? <><button className="staff-text-button" onClick={() => setEditing(false)}>{t("取消编辑")}</button><ReportEditor report={report} onSaved={() => { setEditing(false); detail.reload(); }} /></> : <>
      <article className="staff-panel"><div className="staff-report-meta"><strong>{report.name}</strong><time>{report.workDate}</time><span>{report.projectName ?? t("公司公共")}</span><span className="staff-badge">{report.status === "draft" ? t("个人草稿") : report.visibility === "company" ? (report.projectId ? t("项目共享") : t("公司共享")) : t("仅本人、负责人及管理员")}</span></div>
        <h2>{t("今日进展")}</h2><p className="staff-preserve">{report.progress || t("尚未填写")}</p>
        {report.resultUrl && <p><a href={report.resultUrl} target="_blank" rel="noopener noreferrer">{t("打开成果链接 ↗")}</a></p>}
        {report.help && <><h3>{t("需要协助")}</h3><p className="staff-preserve">{report.help}</p></>}{report.next && <><h3>{t("下一步")}</h3><p className="staff-preserve">{report.next}</p></>}
        <div className="staff-report-meta"><span>{t("更新于")}{dateTime(report.updatedAt)} {t("· 第")}{report.version} {t("版")}</span>{owner && !archived && <Button variant="secondary" onClick={() => setEditing(true)}>{t("编辑记录")}</Button>}</div>
      </article>
      {report.status === "submitted" && <section className="staff-panel"><h2>{t("讨论")}</h2>{detail.data?.comments.length === 0 && <p className="staff-muted">{t("还没有评论，可以在这里补充信息或回应问题。")}</p>}
        {detail.data?.comments.map(item => <article key={item.id} className="staff-comment"><div className="staff-report-meta"><strong>{item.name}</strong><time>{dateTime(item.createdAt)}</time></div><p className="staff-preserve">{item.body}</p></article>)}
        {archived ? <p className="staff-muted">{t("项目已归档")}</p> : <Form submit={async () => { commentId.current ??= crypto.randomUUID(); await api("comment", { id: commentId.current, reportId: id, body: comment }); commentId.current = undefined; setComment(""); detail.reload(); }}>
          <Field label={t("添加评论")}><textarea rows={3} required maxLength={2000} value={comment} onChange={e => { setComment(e.target.value); commentId.current = undefined; }} /></Field><Button type="submit">{t("发布评论")}</Button>
        </Form>}</section>}
      {owner && (detail.data?.revisions.length ?? 0) > 1 && <details className="staff-panel"><summary>{t("历史版本（仅本人可见）")}</summary>{detail.data?.revisions.slice(1).map(revision => <details className="staff-revision" key={revision.version}><summary>{t("第")}{revision.version} {t("版 ·")}{dateTime(revision.createdAt)}</summary><p className="staff-preserve">{revision.snapshot.progress}</p>{revision.snapshot.help && <p className="staff-preserve">{t("需要协助：")}{revision.snapshot.help}</p>}{revision.snapshot.next && <p className="staff-preserve">{t("下一步：")}{revision.snapshot.next}</p>}{revision.snapshot.resultUrl && <a href={revision.snapshot.resultUrl} target="_blank" rel="noopener noreferrer">{t("当时的成果链接 ↗")}</a>}</details>)}</details>}
    </>)}
  </>;
}
export function Projects({ actor, directory }: { actor: StaffActor; directory: MemberDirectory }) {
  const { api, Link, Button, t } = useWorkspace();
  const resource = useResource<ProjectList>("projects");
  const [editing, setEditing] = useState<StaffProject | "new" | null>(null);
  const newId = useRef<string | undefined>(undefined);
  const project = editing && editing !== "new" ? editing : undefined;
  return <>
    <ErrorNotice error={resource.error} retry={resource.reload} />
    {resource.loading && <p role="status">{t("正在加载项目…")}</p>}
    {actor.kind === "admin" && !editing && <Button onClick={() => { newId.current = crypto.randomUUID(); setEditing("new"); }}>{t("新建项目")}</Button>}
    {actor.kind === "admin" && editing && <section className="staff-panel">
      <h2>{project ? t("编辑项目") : t("新建项目")}</h2>
      <Form key={project?.id ?? "new"} submit={async data => {
        await api("project", { id: project?.id ?? newId.current, version: project?.version ?? 0,
          name: value(data, "name"), url: value(data, "url"), active: value(data, "active") === "true",
          memberIds: data.getAll("memberIds").map(Number) });
        setEditing(null); resource.reload();
      }}>
        <Field label={t("项目名称")}><input name="name" required maxLength={80} defaultValue={project?.name} /></Field>
        <Field label={t("项目网址（选填）")}><input name="url" type="url" maxLength={2000} defaultValue={project?.url} /></Field>
        <Field label={t("状态")}><select name="active" defaultValue={String(project?.active ?? true)}><option value="true">{t("进行中")}</option><option value="false">{t("已归档")}</option></select></Field>
        <Field label={t("项目成员（可多选）")}><select name="memberIds" multiple size={Math.min(8, Math.max(3, directory.length))} defaultValue={project?.memberIds.map(String) ?? []}>
          {directory.map(member => <option key={member.id} value={member.id}>{member.name}{member.active ? "" : t("（已停用）")}</option>)}
        </select></Field>
        <p className="staff-muted">{t("成员可查看项目共享记录；项目内的负责人还可查看受限记录。归档后保留历史，停止新增与修改。")}</p>
        <div className="staff-actions"><Button type="submit">{t("保存项目")}</Button><Button type="button" variant="secondary" onClick={() => setEditing(null)}>{t("取消")}</Button></div>
      </Form>
    </section>}
    {resource.data?.projects.length === 0 && <p className="staff-empty">{t("暂无可访问的项目。")}</p>}
    <div className="staff-feed">{resource.data?.projects.map(item => <article className="staff-panel" key={item.id}>
      <div className="staff-report-meta"><h2>{item.name}</h2><span>{item.active ? t("进行中") : t("已归档")}</span></div>
      <div className="staff-actions">
        {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer">{t("打开项目 ↗")}</a>}
        {actor.kind === "admin" && <Button variant="secondary" onClick={() => setEditing(item)}>{t("成员与设置")}</Button>}
      </div>
    </article>)}</div>
  </>;
}
