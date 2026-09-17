import { gl, encId, AcctCtx } from './request'
export { gl, encId }

export interface GitLabUser { id: number; username: string; name: string; avatar_url: string; web_url: string }

export async function verifyToken(baseUrl: string, token: string): Promise<GitLabUser> {
  return gl<GitLabUser>({ baseUrl, token } as AcctCtx, '/user')
}

export async function currentUser(a: AcctCtx): Promise<GitLabUser> {
  return gl(a, '/user')
}

/* ---------- 项目 ---------- */
export interface GitLabProject {
  id: number; name: string; path_with_namespace: string; description: string | null
  visibility: string; default_branch: string; star_count: number; forked_from_project?: any
  web_url: string; avatar_url?: string; last_activity_at?: string; owner?: { username: string }
  issues_enabled?: boolean; merge_requests_enabled?: boolean; wiki_enabled?: boolean; jobs_enabled?: boolean
}

export async function myProjects(a: AcctCtx, p: { search?: string; page?: number; per?: number; owned?: boolean; membership?: boolean }) {
  const base = {
    search: p.search || undefined,
    membership: p.owned ? undefined : (p.membership ?? true),
    owned: p.owned || undefined,
    page: p.page || 1,
    per_page: p.per || 20,
    simple: true
  }
  try {
    return await gl(a, '/projects', { params: { ...base, order_by: 'last_activity_at', sort: 'desc' }, withTotal: true })
  } catch (e: any) {
    // GitLab.com 对 last_activity_at 排序在大账号上会 500，降级为按 id 倒序
    if (e?.status === 500) return await gl(a, '/projects', { params: { ...base, order_by: 'id', sort: 'desc' }, withTotal: true })
    throw e
  }
}

export function getProject(a: AcctCtx, id: number | string) { return gl(a, `/projects/${encId(id)}`) }
export function createProject(a: AcctCtx, d: { name: string; path?: string; description?: string; visibility?: string; initialize_with_readme?: boolean }) {
  return gl(a, '/projects', { method: 'post', data: d })
}
export function updateProject(a: AcctCtx, id: number, d: any) { return gl(a, `/projects/${id}`, { method: 'put', data: d }) }
export function deleteProject(a: AcctCtx, id: number) { return gl(a, `/projects/${id}`, { method: 'delete' }) }
export function projectMembers(a: AcctCtx, id: number) { return gl(a, `/projects/${id}/members/all`, { params: { per_page: 50 } }) }
export function removeMember(a: AcctCtx, id: number, uid: number) { return gl(a, `/projects/${id}/members/${uid}`, { method: 'delete' }) }
export function addMember(a: AcctCtx, id: number, d: { user_id: number; access_level: number }) { return gl(a, `/projects/${id}/members`, { method: 'post', data: d }) }
export function projectStats(a: AcctCtx, id: number) { return gl(a, `/projects/${id}/statistics`) }

/* ---------- 分支 ---------- */
export function branches(a: AcctCtx, id: number, search?: string) {
  return gl(a, `/projects/${id}/repository/branches`, { params: { search, per_page: 100 } })
}
export function createBranch(a: AcctCtx, id: number, branch: string, ref: string) {
  return gl(a, `/projects/${id}/repository/branches`, { method: 'post', data: { branch, ref } })
}
export function deleteBranch(a: AcctCtx, id: number, branch: string) {
  return gl(a, `/projects/${id}/repository/branches/${encodeURIComponent(branch)}`, { method: 'delete' })
}
export function protectedBranches(a: AcctCtx, id: number) {
  return gl(a, `/projects/${id}/protected_branches`, { params: { per_page: 100 } })
}
export function protectBranch(a: AcctCtx, id: number, name: string) {
  return gl(a, `/projects/${id}/protected_branches`, { method: 'post', data: { name, push_access_level: 40, merge_access_level: 40 } })
}
export function unprotectBranch(a: AcctCtx, id: number, pbId: number) {
  return gl(a, `/projects/${id}/protected_branches/${pbId}`, { method: 'delete' })
}
export function compare(a: AcctCtx, id: number, from: string, to: string) {
  return gl(a, `/projects/${id}/repository/compare`, { params: { from, to } })
}

/* ---------- 提交 ---------- */
export function commits(a: AcctCtx, id: number, p: { ref_name?: string; path?: string; page?: number; per?: number; search?: string }) {
  return gl(a, `/projects/${id}/repository/commits`, {
    params: { ref_name: p.ref_name, path: p.path, since: undefined, search: p.search, page: p.page || 1, per_page: p.per || 20 },
    withTotal: true
  })
}
export function commitDiff(a: AcctCtx, id: number, sha: string) {
  return gl(a, `/projects/${id}/repository/commits/${sha}/diff`, { params: { per_page: 100 } })
}
export function commitRefs(a: AcctCtx, id: number, sha: string) {
  return gl(a, `/projects/${id}/repository/commits/${sha}/refs`, { params: { type: 'branch' } }).catch(() => [])
}

/* ---------- 文件 ---------- */
export function tree(a: AcctCtx, id: number, p: { path?: string; ref: string }) {
  return gl(a, `/projects/${id}/repository/tree`, { params: { path: p.path || undefined, ref: p.ref, per_page: 100 } })
}
export function fileContent(a: AcctCtx, id: number, path: string, ref: string) {
  return gl(a, `/projects/${id}/repository/files/${encodeURIComponent(path)}`, { params: { ref } })
}
export function fileRawBlob(a: AcctCtx, id: number, path: string, ref: string): Promise<Blob> {
  return gl(a, `/projects/${id}/repository/files/${encodeURIComponent(path)}/raw`, { params: { ref }, raw: true })
    .then((text: string) => new Blob([text]))
}
export function upsertFile(a: AcctCtx, id: number, path: string, d: { branch: string; content: string; commit_message: string; encoding?: string }) {
  const ep = `/projects/${id}/repository/files/${encodeURIComponent(path)}`
  return gl(a, ep, { method: d.encoding ? 'post' : 'put', data: { ...d, encoding: 'base64' } })
}
export function createFileB64(a: AcctCtx, id: number, path: string, d: { branch: string; content: string; commit_message: string }) {
  return gl(a, `/projects/${id}/repository/files/${encodeURIComponent(path)}`, { method: 'post', data: { ...d, encoding: 'base64' } })
}
export function deleteFile(a: AcctCtx, id: number, path: string, d: { branch: string; commit_message: string }) {
  return gl(a, `/projects/${id}/repository/files/${encodeURIComponent(path)}`, { method: 'delete', data: d })
}

/* ---------- Issue ---------- */
export function issues(a: AcctCtx, id: number, p: { state?: string; labels?: string; search?: string; page?: number; per?: number }) {
  return gl(a, `/projects/${id}/issues`, {
    params: { state: p.state || 'opened', labels: p.labels || undefined, search: p.search || undefined, order_by: 'updated_at', page: p.page || 1, per_page: p.per || 20 },
    withTotal: true
  })
}
export function getIssue(a: AcctCtx, id: number, iid: number) { return gl(a, `/projects/${id}/issues/${iid}`) }
export function createIssue(a: AcctCtx, id: number, d: any) { return gl(a, `/projects/${id}/issues`, { method: 'post', data: d }) }
export function updateIssue(a: AcctCtx, id: number, iid: number, d: any) { return gl(a, `/projects/${id}/issues/${iid}`, { method: 'put', data: d }) }
export function issueNotes(a: AcctCtx, id: number, iid: number) { return gl(a, `/projects/${id}/issues/${iid}/notes?order_by=created_at&sort=asc`, { params: { per_page: 100 } }) }
export function addIssueNote(a: AcctCtx, id: number, iid: number, body: string) { return gl(a, `/projects/${id}/issues/${iid}/notes`, { method: 'post', data: { body } }) }
export function labels(a: AcctCtx, id: number) { return gl(a, `/projects/${id}/labels`, { params: { per_page: 100 } }) }
export function createLabel(a: AcctCtx, id: number, d: { name: string; color: string; description?: string }) { return gl(a, `/projects/${id}/labels`, { method: 'post', data: d }) }
export function deleteLabel(a: AcctCtx, id: number, labelId: number) { return gl(a, `/projects/${id}/labels/${labelId}`, { method: 'delete' }) }

/* ---------- 合并请求 ---------- */
export function mergeRequests(a: AcctCtx, id: number, p: { state?: string; search?: string; page?: number; per?: number }) {
  return gl(a, `/projects/${id}/merge_requests`, {
    params: { state: p.state || 'opened', search: p.search || undefined, order_by: 'updated_at', page: p.page || 1, per_page: p.per || 20 },
    withTotal: true
  })
}
export function getMr(a: AcctCtx, id: number, iid: number) { return gl(a, `/projects/${id}/merge_requests/${iid}`) }
export function mrChanges(a: AcctCtx, id: number, iid: number) { return gl(a, `/projects/${id}/merge_requests/${iid}/changes`) }
export function mrCommits(a: AcctCtx, id: number, iid: number) { return gl(a, `/projects/${id}/merge_requests/${iid}/commits`, { params: { per_page: 100 } }) }
export function mrNotes(a: AcctCtx, id: number, iid: number) { return gl(a, `/projects/${id}/merge_requests/${iid}/notes?order_by=created_at&sort=asc`, { params: { per_page: 100 } }) }
export function addMrNote(a: AcctCtx, id: number, iid: number, body: string) { return gl(a, `/projects/${id}/merge_requests/${iid}/notes`, { method: 'post', data: { body } }) }
export function approveMr(a: AcctCtx, id: number, iid: number) { return gl(a, `/projects/${id}/merge_requests/${iid}/approve`, { method: 'post', data: {} }) }
export function unapproveMr(a: AcctCtx, id: number, iid: number) { return gl(a, `/projects/${id}/merge_requests/${iid}/approve`, { method: 'post', data: { sha: '' } }).catch(() => gl(a, `/projects/${id}/merge_requests/${iid}/unapprove`, { method: 'post' })) }
export function mergeMr(a: AcctCtx, id: number, iid: number, d: any) { return gl(a, `/projects/${id}/merge_requests/${iid}/merge`, { method: 'put', data: d }) }
export function updateMr(a: AcctCtx, id: number, iid: number, d: any) { return gl(a, `/projects/${id}/merge_requests/${iid}`, { method: 'put', data: d }) }
export function createMr(a: AcctCtx, id: number, d: any) { return gl(a, `/projects/${id}/merge_requests`, { method: 'post', data: d }) }

/* ---------- 流水线 ---------- */
export function pipelines(a: AcctCtx, id: number, p: { status?: string; page?: number; per?: number }) {
  return gl(a, `/projects/${id}/pipelines`, {
    params: { status: p.status || undefined, page: p.page || 1, per_page: p.per || 20 },
    withTotal: true
  })
}
export function pipelineJobs(a: AcctCtx, id: number, pid: number) { return gl(a, `/projects/${id}/pipelines/${pid}/jobs`, { params: { per_page: 100, include_retried_jobs: false } }) }
export function createPipeline(a: AcctCtx, id: number, ref: string, variables?: { key: string; value: string }[]) {
  return gl(a, `/projects/${id}/pipeline`, { method: 'post', data: { ref, variables } })
}
export function retryPipeline(a: AcctCtx, id: number, pid: number) { return gl(a, `/projects/${id}/pipelines/${pid}/retry`, { method: 'post' }) }
export function cancelPipeline(a: AcctCtx, id: number, pid: number) { return gl(a, `/projects/${id}/pipelines/${pid}/cancel`, { method: 'post' }) }
export function jobTrace(a: AcctCtx, id: number, jobId: number): Promise<string> {
  return gl(a, `/projects/${id}/jobs/${jobId}/trace`, { raw: true })
}
export function retryJob(a: AcctCtx, id: number, jobId: number) { return gl(a, `/projects/${id}/jobs/${jobId}/retry`, { method: 'post' }) }
export function cancelJob(a: AcctCtx, id: number, jobId: number) { return gl(a, `/projects/${id}/jobs/${jobId}/cancel`, { method: 'post' }) }
export function playJob(a: AcctCtx, id: number, jobId: number) { return gl(a, `/projects/${id}/jobs/${jobId}/play`, { method: 'post' }) }
export function variables(a: AcctCtx, id: number) { return gl(a, `/projects/${id}/variables`, { params: { per_page: 100 } }) }
export function upsertVariable(a: AcctCtx, id: number, d: { key: string; value: string; variable_type?: string; protected?: boolean; masked?: boolean }) {
  return gl(a, `/projects/${id}/variables/${d.key}`, { method: 'put', data: d }).catch((e) => {
    if (e.status === 404) return gl(a, `/projects/${id}/variables`, { method: 'post', data: d })
    throw e
  })
}
export function deleteVariable(a: AcctCtx, id: number, key: string) { return gl(a, `/projects/${id}/variables/${key}`, { method: 'delete' }) }

/* ---------- Release ---------- */
export function releases(a: AcctCtx, id: number) { return gl(a, `/projects/${id}/releases`, { params: { per_page: 50 } }) }
export function createRelease(a: AcctCtx, id: number, d: any) { return gl(a, `/projects/${id}/releases`, { method: 'post', data: d }) }
export function updateRelease(a: AcctCtx, id: number, tag: string, d: any) { return gl(a, `/projects/${id}/releases/${encodeURIComponent(tag)}`, { method: 'put', data: d }) }
export function deleteRelease(a: AcctCtx, id: number, tag: string) { return gl(a, `/projects/${id}/releases/${encodeURIComponent(tag)}`, { method: 'delete' }) }
export function tags(a: AcctCtx, id: number) { return gl(a, `/projects/${id}/repository/tags`, { params: { per_page: 100 } }) }

/* ---------- SSH 公钥 ---------- */
export function sshKeys(a: AcctCtx) { return gl(a, '/user/keys', { params: { per_page: 50 } }) }
export function addSshKey(a: AcctCtx, title: string, key: string) { return gl(a, '/user/keys', { method: 'post', data: { title, key } }) }
export function deleteSshKey(a: AcctCtx, kid: number) { return gl(a, `/user/keys/${kid}`, { method: 'delete' }) }

/* ---------- 搜索（跨项目） ---------- */
export function globalProjectsSearch(a: AcctCtx, kw: string) {
  return gl(a, '/projects', { params: { search: kw, membership: true, per_page: 30, order_by: 'last_activity_at' } })
}
