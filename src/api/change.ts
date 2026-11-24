import request from './request'
import type { ApiResult } from '@/types/auth'
import type { ChangeCreateReq, ChangeVO } from '@/types/change'
import type { TimelineNodeVO } from '@/types/project'

// 项目变更接口（后端 /api/change/**）

/** 发起变更（创建即发起 project_change 两级审批） */
export function createChange(projectId: number, data: ChangeCreateReq) {
  return request.post<ApiResult<number>>(`/change/project/${projectId}`, data).then((r) => r.data.data!)
}

/** 项目下的变更单列表（立项详情 Tab 用） */
export function listChangesByProject(projectId: number) {
  return request.get<ApiResult<ChangeVO[]>>(`/change/project/${projectId}/list`).then((r) => r.data.data!)
}

/** 变更单详情（含明细 diff + 审批时间线） */
export function changeDetail(id: number) {
  return request.get<ApiResult<ChangeVO>>(`/change/${id}`).then((r) => r.data.data!)
}

/** 审批时间线 */
export function changeTimeline(id: number) {
  return request.get<ApiResult<TimelineNodeVO[]>>(`/change/${id}/timeline`).then((r) => r.data.data!)
}

/** 申请人撤销变更 */
export function cancelChange(id: number) {
  return request.post<ApiResult<null>>(`/change/${id}/cancel`).then((r) => r.data)
}

/** 审批通过变更任务（审批中心分发用） */
export function completeChangeTask(taskId: string, vars?: Record<string, unknown>) {
  return request.post<ApiResult<null>>(`/change/task/${taskId}/complete`, vars ?? {}).then((r) => r.data)
}

/** 审批驳回变更任务（审批中心分发用） */
export function rejectChangeTask(taskId: string, comment: string) {
  return request.post<ApiResult<null>>(`/change/task/${taskId}/reject`, null, { params: { comment } }).then((r) => r.data)
}
