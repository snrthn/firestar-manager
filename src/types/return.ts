// 退货模块前后端共享类型（与后端 com.firestar.dto.ReturnVO 等对齐）

/** 分页结果（与后端 MyBatis-Plus IPage 序列化字段对齐） */
export interface ReturnPageVO {
  records: ReturnVO[]
  total: number
  size: number
  current: number
  pages: number
}

/** 退货单列表行 / 详情（/return/page、/return/{id}） */
export interface ReturnVO {
  id: number
  /** 退货单号（TH-{项目号}-NNN） */
  returnNo: string | null
  projectId: number | null
  projectNo: string | null
  projectName: string | null
  /** 来源发货单 */
  shipmentId: number | null
  shipmentBatchNo: string | null
  /** 退货金额 = Σ(明细行数量 × 行单价)，后端核定 */
  returnAmount: number | null
  returnReason: string | null
  /** 审批状态（return_approval_status：APPROVING/APPROVED/REJECTED/CANCELLED/COMPLETED） */
  approvalStatus: string | null
  approvalStatusName: string | null
  approvalStatusStyle: string | null
  /** 执行状态（return_execute_status：NOT_EXECUTED/PARTIAL/COMPLETED） */
  executeStatus: string | null
  executeStatusName: string | null
  executeStatusStyle: string | null
  processInstanceId: string | null
  applicantId: number | null
  applicantName: string | null
  appliedAt: string | null
  createdAt: string | null
  /** 退货明细行（按发货明细行逐行退） */
  lines: ReturnLineVO[]
  /** 审批时间线（详情才有） */
  timeline: TimelineNodeVO[]
  /** 三冲减明细（审批通过并执行后才有） */
  writeoffDetail: ReturnWriteoffDetailVO | null
  /** 当前用户在流程实例上的待办任务 ID（三级审批中才有） */
  myPendingTaskId: string | null
  /**
   * 当前用户能否撤销（审批中 ∧ 本人申请，后端按 currentUserId 算好）。
   * 后端 cancel 的三道闸仍是唯一权威，此字段仅控列表按钮显隐。
   */
  canCancel: boolean | null
}

/** 退货明细行（V67 fin_return_line，挂发货明细行） */
export interface ReturnLineVO {
  id: number
  /** 来源发货明细行 → fin_shipment_line.id */
  shipmentLineId: number | null
  itemId: number | null
  itemName: string | null
  /** 本次退货数量（>0 才落行） */
  returnQty: number
  /** 行单价（快照自发货明细，防后续变价） */
  unitPrice: number | null
  lineAmount: number | null
}

/**
 * 三冲减明细（/return/{id}/writeoff-detail）。
 * 审批通过瞬间由 ReturnServiceImpl.executeReturn 自动执行，按条件跳过：
 * 未开票则无红字发票、未回款则无退款单。
 */
export interface ReturnWriteoffDetailVO {
  /** ①红字应收单（恒执行） */
  redReceivableId: number | null
  redReceivableNo: string | null
  originalReceivableNo: string | null
  redReceivableAmount: number | null
  /** ②红字发票（原应收单已开票 ≥ 退货金额时才执行） */
  redInvoiceId: number | null
  redInvoiceNo: string | null
  originalInvoiceNo: string | null
  redInvoiceAmount: number | null
  /** ③退款单 = 红字收款单（原应收单已回款 ≥ 退货金额时才执行） */
  redReceiptId: number | null
  redReceiptNo: string | null
  originalReceiptNo: string | null
  refundAmount: number | null
  /** 反向核销记录单号清单（落到核销台账，可在 writeoff 页查） */
  reverseWriteOffNos: string[]
  /** 执行说明（跳过项也在里面，例如「未开票，跳过红字发票」） */
  executionNotes: string[]
}

/** 审批时间线节点（与 types/project.ts 同源，这里再导出避免重复定义） */
import type { TimelineNodeVO } from './project'
export type { TimelineNodeVO }

/** 发起退货申请表单（POST /return/shipments/{shipmentId}/returns） */
export interface ReturnCreateForm {
  lines: ReturnLineForm[]
  returnReason: string
}

/** 退货申请行（发货明细行 ID + 本次退货数量） */
export interface ReturnLineForm {
  shipmentLineId: number
  returnQty: number
}
