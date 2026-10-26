import request from './request'
import type { ApiResult } from '@/types/auth'
import type {
  ShipmentPageVO,
  ShipmentVO,
  ItemVO,
  ShipmentCreateForm,
  ShipmentConfirmForm,
} from '@/types/shipment'
import type { TimelineNodeVO } from '@/types/project'

// 发货管理接口（后端 /shipment/**、/item/**）

/** 分页发货列表（batchNo / projectName 模糊、status 精确；默认每页 10 条） */
export function shipmentPage(
  pageNum = 1,
  pageSize = 10,
  params: { batchNo?: string; projectName?: string; status?: string } = {},
) {
  return request
    .get<ApiResult<ShipmentPageVO>>('/shipment/page', { params: { pageNum, pageSize, ...params } })
    .then((r) => r.data.data!)
}

/** 发货详情（含明细行 + 关联应收单 + 字典翻译 + 待办任务） */
export function shipmentDetail(id: number) {
  return request.get<ApiResult<ShipmentVO>>(`/shipment/${id}`).then((r) => r.data.data!)
}

/** 审批时间线（按 businessKey=发货单 ID 聚合，含驳回历史） */
export function shipmentTimeline(id: number) {
  return request
    .get<ApiResult<TimelineNodeVO[]>>(`/shipment/${id}/timeline`)
    .then((r) => r.data.data!)
}

/** 新建发货申请（保存草稿，审批由详情面板触发；后端逐行硬卡超发/超合同） */
export function createShipment(data: ShipmentCreateForm) {
  return request.post<ApiResult<number>>('/shipment', data).then((r) => r.data.data!)
}

/** 提交审批（详情面板触发；仅草稿/驳回可提，起流程 + 置审批中） */
export function submitShipment(id: number) {
  return request.post<ApiResult<null>>(`/shipment/${id}/submit`).then((r) => r.data)
}

/** 编辑发货单（2026-10-23 虎哥要求补入口）：仅 PENDING 可改，项目不可更换 */
export function updateShipment(id: number, data: ShipmentCreateForm) {
  return request.put<ApiResult<null>>(`/shipment/${id}`, data).then((r) => r.data)
}

/** 申请人撤回发货申请（方案 B：流程未结束即可撤回 → CANCELLED + 退还货物额度） */
export function withdrawShipment(id: number) {
  return request.post<ApiResult<null>>(`/shipment/${id}/withdraw`).then((r) => r.data)
}

/** 标记已发货（审批通过后；shippedById = 当前操作人，决策#2；后端端点 /shipment/{id}/ship） */
export function markShipped(id: number) {
  return request.post<ApiResult<null>>(`/shipment/${id}/ship`).then((r) => r.data)
}

/** 标记客户收货（决策#6：必传证据；支持按行部分收货；联动生成应收单） */
export function confirmReceive(data: ShipmentConfirmForm) {
  return request.post<ApiResult<null>>(`/shipment/${data.shipmentId}/confirm-receive`, data).then((r) => r.data)
}

/** 审批通过（P3 引擎 complete 后业务回写 + 通知引导发货，决策#2） */
export function completeShipmentTask(taskId: string, variables?: Record<string, unknown>) {
  return request
    .post<ApiResult<null>>(`/shipment/task/${taskId}/complete`, variables ?? {})
    .then((r) => r.data)
}

/** 审批驳回（单节点：终结实例 + 置 REJECTED + 通知申请人） */
export function rejectShipmentTask(taskId: string, comment: string) {
  return request
    .post<ApiResult<null>>(`/shipment/task/${taskId}/reject?comment=${encodeURIComponent(comment)}`)
    .then((r) => r.data)
}

/** 按项目拉取货物明细（新建申请时选择货物，含 shippedQty 供前端预校验超发） */
export function listItems(projectId: number) {
  return request
    .get<ApiResult<ItemVO[]>>('/item/list', { params: { projectId } })
    .then((r) => r.data.data!)
}

/** 应收单详情（详情页点开查看，/shipment 关联生成后才有） */
// 应收单相关接口已收敛到 api/receivable.ts（同一端点 /receivable/**
// 且无人引用本文件版本），避免两份实现各自演化。
