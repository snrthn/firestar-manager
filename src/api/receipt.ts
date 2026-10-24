import request from './request'
import type { ApiResult } from '@/types/auth'
import type { ReceiptPageVO, ReceiptVO, ReceiptRequest } from '@/types/receipt'
import type { TimelineNodeVO } from '@/types/project'

// 回款（收款）管理接口（后端 /receipt/**；审批动作经 Flowable 任务端点）

/**
 * 分页回款列表。
 *
 * 后端 ReceiptController.page 只声明 pageNum/pageSize/projectId/status 四个参数，
 * 其余键会被忽略（@RequestParam 未声明）——故这里不传 receiptNo/projectName 等模糊条件。
 */
export function receiptPage(
  pageNum = 1,
  pageSize = 10,
  params: { projectId?: number; status?: string } = {},
) {
  return request
    .get<ApiResult<ReceiptPageVO>>('/receipt/page', { params: { pageNum, pageSize, ...params } })
    .then((r) => r.data.data!)
}

/** 回款详情（含字典翻译 + 待办任务） */
export function receiptDetail(id: number) {
  return request.get<ApiResult<ReceiptVO>>(`/receipt/${id}`).then((r) => r.data.data!)
}

/** 审批时间线（按 businessKey=回款单 ID 聚合） */
export function receiptTimeline(id: number) {
  return request
    .get<ApiResult<TimelineNodeVO[]>>(`/receipt/${id}/timeline`)
    .then((r) => r.data.data!)
}

/** 新建回款单（提交即发起审批，状态 PENDING_APPROVAL） */
export function createReceipt(data: ReceiptRequest) {
  return request.post<ApiResult<number>>('/receipt', data).then((r) => r.data.data!)
}

/** 编辑回款单（仅 PENDING_APPROVAL 可改，金额是否允许改由后端决定） */
export function updateReceipt(id: number, data: ReceiptRequest) {
  return request.put<ApiResult<null>>(`/receipt/${id}`, data).then((r) => r.data)
}

/** 申请人提交审批（PENDING_APPROVAL → CASHIER_APPROVING，发起 Flowable 流程） */
export function submitReceipt(id: number) {
  return request.post<ApiResult<null>>(`/receipt/${id}/submit`).then((r) => r.data)
}

/** 申请人撤回（流程未结束即可撤回，状态回到草稿/已撤销，后端决定） */
export function withdrawReceipt(id: number) {
  return request.post<ApiResult<null>>(`/receipt/${id}/withdraw`).then((r) => r.data)
}

/** 审批通过（ROLE_CASHIER 单节点；variables 可选，传审批意见等） */
export function completeReceiptTask(taskId: string, variables?: Record<string, unknown>) {
  return request
    .post<ApiResult<null>>(`/receipt/task/${taskId}/complete`, variables ?? {})
    .then((r) => r.data)
}

/** 审批驳回（单节点：终结实例 + 置 REJECTED + 通知申请人） */
export function rejectReceiptTask(taskId: string, comment: string) {
  return request
    .post<ApiResult<null>>(`/receipt/task/${taskId}/reject?comment=${encodeURIComponent(comment)}`)
    .then((r) => r.data)
}
