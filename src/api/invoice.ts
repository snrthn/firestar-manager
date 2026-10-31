import request from './request'
import type { ApiResult } from '@/types/auth'
import type { InvoicePageVO, InvoiceVO, InvoiceRequest, InvoiceIssueRequest } from '@/types/invoice'
import type { TimelineNodeVO } from '@/types/project'

// 发票（开票）管理接口（后端 /invoice/**；审批动作经 Flowable 任务端点）

/**
 * 分页发票列表。
 *
 * 2026-10-28 补齐查询条件（口径对齐核销台账）：projectId/receivableId/status/invoiceType/
 * docDirection 精确、invoiceNo / projectName 模糊、dateFrom~dateTo 按开票日期闭区间。
 * 后端 InvoiceController.page 已声明全部参数，未声明的键会被忽略——按需传即可。
 */
export function invoicePage(
  pageNum = 1,
  pageSize = 10,
  params: {
    projectId?: number
    receivableId?: number
    status?: string
    invoiceNo?: string
    projectName?: string
    invoiceType?: string
    docDirection?: string
    dateFrom?: string
    dateTo?: string
  } = {},
) {
  return request
    .get<ApiResult<InvoicePageVO>>('/invoice/page', { params: { pageNum, pageSize, ...params } })
    .then((r) => r.data.data!)
}

/** 发票详情（含字典翻译 + 待办任务） */
export function invoiceDetail(id: number) {
  return request.get<ApiResult<InvoiceVO>>(`/invoice/${id}`).then((r) => r.data.data!)
}

/** 审批时间线（按 businessKey=发票单 ID 聚合） */
export function invoiceTimeline(id: number) {
  return request
    .get<ApiResult<TimelineNodeVO[]>>(`/invoice/${id}/timeline`)
    .then((r) => r.data.data!)
}

/** 新建发票单（提交即发起审批，状态 PENDING） */
export function createInvoice(data: InvoiceRequest) {
  return request.post<ApiResult<number>>('/invoice', data).then((r) => r.data.data!)
}

/** 编辑发票单（仅 PENDING 可改） */
export function updateInvoice(id: number, data: InvoiceRequest) {
  return request.put<ApiResult<null>>(`/invoice/${id}`, data).then((r) => r.data)
}

/** 申请人提交审批（DRAFT → APPROVING，发起 Flowable 流程） */
export function submitInvoice(id: number) {
  return request.post<ApiResult<null>>(`/invoice/${id}/submit`).then((r) => r.data)
}

/** 申请人撤回（流程未结束即可撤回） */
export function withdrawInvoice(id: number) {
  return request.post<ApiResult<null>>(`/invoice/${id}/withdraw`).then((r) => r.data)
}

/** 审批通过（ROLE_INVOICER 单节点；variables 可选） */
export function completeInvoiceTask(taskId: string, variables?: Record<string, unknown>) {
  return request
    .post<ApiResult<null>>(`/invoice/task/${taskId}/complete`, variables ?? {})
    .then((r) => r.data)
}

/** 审批驳回（单节点：终结实例 + 置 REJECTED + 通知申请人） */
export function rejectInvoiceTask(taskId: string, comment: string) {
  return request
    .post<ApiResult<null>>(`/invoice/task/${taskId}/reject?comment=${encodeURIComponent(comment)}`)
    .then((r) => r.data)
}

/**
 * 开票（V95 发票流程重构）。
 *
 * 开票节点（ROLE_INVOICER，invoice:issue）在审批通过进入 SUBMITTED（待开票）后调用：
 * 由开票员实际开具并回填票号/代码/日期 + 上传电子票。后端校验 SUBMITTED 态、必填项、发票号查重。
 */
export function issueInvoice(id: number, data: InvoiceIssueRequest) {
  return request.post<ApiResult<null>>(`/invoice/${id}/issue`, data).then((r) => r.data)
}
