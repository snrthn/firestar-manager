import request from './request'
import type { ApiResult } from '@/types/auth'
import type { TaskPageVO, ApprovalHistoryPageVO } from '@/types/approval'
import type { ProjectPageVO } from '@/types/project'

// 审批中心接口（后端 /project/**）

/**
 * 审批中心「我审批的」分页（2026-10-22 虎哥：标准页面查询+表格+分页）。
 * bizTitleKw 按业务标题模糊、taskNameKw 按节点名模糊；服务端取当前登录用户。
 */
export function myTasksPage(
  pageNum = 1,
  pageSize = 10,
  params: { bizTitleKw?: string; taskNameKw?: string } = {},
) {
  return request
    .get<ApiResult<TaskPageVO>>('/project/tasks/mine/page', { params: { pageNum, pageSize, ...params } })
    .then((r) => r.data.data!)
}

/**
 * 审批中心「我发起的」分页（2026-10-22 虎哥：审批中心 Tab 化）。
 * 服务端自动按当前登录用户过滤 + 排除 DRAFT；projectName 模糊、approvalStatus 精确。
 */
export function myStartedPage(
  pageNum = 1,
  pageSize = 10,
  params: { projectName?: string; approvalStatus?: string } = {},
) {
  return request
    .get<ApiResult<ProjectPageVO>>('/project/page/mine', { params: { pageNum, pageSize, ...params } })
    .then((r) => r.data.data!)
}

/**
 * 审批中心「我审批的」历史分页（2026-10-22 虎哥：看不到自己审批过的记录）。
 * bizTitleKw 按业务标题模糊、taskNameKw 按节点名模糊；服务端取当前登录用户。
 */
export function myApprovedHistoryPage(
  pageNum = 1,
  pageSize = 10,
  params: { bizTitleKw?: string; taskNameKw?: string } = {},
) {
  return request
    .get<ApiResult<ApprovalHistoryPageVO>>('/project/approvals/history/page', {
      params: { pageNum, pageSize, ...params },
    })
    .then((r) => r.data.data!)
}

/** 审批通过：完成指定任务（variables 可选，向后端传审批意见等） */
export function completeTask(taskId: string, variables?: Record<string, unknown>) {
  return request.post<ApiResult<null>>(`/project/task/${taskId}/complete`, variables ?? {}).then((r) => r.data)
}

/** 驳回：把任务退回目标节点（toNode 为目标节点 id；comment 驳回理由，必填） */
export function rejectTask(taskId: string, toNode: string, comment: string) {
  return request
    .post<ApiResult<null>>(
      `/project/task/${taskId}/reject?toNode=${encodeURIComponent(toNode)}&comment=${encodeURIComponent(comment)}`,
    )
    .then((r) => r.data)
}
