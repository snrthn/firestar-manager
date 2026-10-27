import request from './request'
import type { ApiResult } from '@/types/auth'
import type {
  ReturnPageVO,
  ReturnVO,
  ReturnCreateForm,
  ReturnWriteoffDetailVO,
} from '@/types/return'
import type { TimelineNodeVO } from '@/types/project'

// 退货管理接口（后端 /return/**）
// 三级审批（return_approval：主管→财务→销售经理）末节点通过后，
// 后端自动执行三冲减链（红字应收单/红字发票/退款单+反向核销），前端只展示结果。

/** 退货列表（分页 + 项目号/项目名/退货单号模糊、审批状态+执行状态精确、申请时间闭区间） */
export function returnPage(
  pageNum = 1,
  pageSize = 10,
  params: {
    projectNo?: string
    projectName?: string
    returnNo?: string
    status?: string
    executeStatus?: string
    dateFrom?: string
    dateTo?: string
  } = {},
) {
  return request
    .get<ApiResult<ReturnPageVO>>('/return/page', { params: { pageNum, pageSize, ...params } })
    .then((r) => r.data.data!)
}

/** 待我审批的退货列表（按当前用户在流程实例上的待办任务过滤） */
export function returnPending(pageNum = 1, pageSize = 10) {
  return request
    .get<ApiResult<ReturnPageVO>>('/return/pending', { params: { pageNum, pageSize } })
    .then((r) => r.data.data!)
}

/** 退货详情（含明细行 + 审批时间线 + 三冲减明细 + 待办任务） */
export function returnDetail(id: number) {
  return request.get<ApiResult<ReturnVO>>(`/return/${id}`).then((r) => r.data.data!)
}

/** 审批时间线（businessKey=退货单 ID，流程类型 return_approval） */
export function returnTimeline(id: number) {
  return request
    .get<ApiResult<TimelineNodeVO[]>>(`/return/${id}/timeline`)
    .then((r) => r.data.data!)
}

/** 三冲减明细（红字应收/红字发票/退款单/反向核销/执行说明） */
export function returnWriteoffDetail(id: number) {
  return request
    .get<ApiResult<ReturnWriteoffDetailVO>>(`/return/${id}/writeoff-detail`)
    .then((r) => r.data.data!)
}

/**
 * 发起退货申请（挂在发货单下，逐行选退货数量）。
 * 提交即发起三级审批，审批通过才落库存与账务冲减。
 */
export function createReturn(shipmentId: number, data: ReturnCreateForm) {
  return request
    .post<ApiResult<number>>(`/return/shipments/${shipmentId}/returns`, data)
    .then((r) => r.data.data!)
}

/** 撤销退货申请（仅审批中可撤；后端三道闸：发起人身份 + 流程运行中 + 并发） */
export function cancelReturn(id: number) {
  return request.put<ApiResult<null>>(`/return/${id}/cancel`).then((r) => r.data)
}

/** 三级审批通过（末节点通过自动执行三冲减链） */
export function completeReturnTask(taskId: string, variables?: Record<string, unknown>) {
  return request
    .post<ApiResult<null>>(`/return/task/${taskId}/complete`, variables ?? {})
    .then((r) => r.data)
}

/** 审批驳回（终结实例 + REJECTED + 通知申请人） */
export function rejectReturnTask(taskId: string, comment: string) {
  return request
    .post<ApiResult<null>>(`/return/task/${taskId}/reject?comment=${encodeURIComponent(comment)}`)
    .then((r) => r.data)
}
