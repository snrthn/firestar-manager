// 发货模块前后端共享类型（与后端 com.firestar.dto.ShipmentVO 等对齐）

/** 分页结果（与后端 MyBatis-Plus IPage 序列化字段对齐） */
export interface ShipmentPageVO {
  records: ShipmentVO[]
  total: number
  size: number
  current: number
  pages: number
}

/** 发货单列表行 / 详情（/shipment/page、/shipment/{id}） */
export interface ShipmentVO {
  id: number
  projectId: number
  /** 项目编号（批次号 FH-{projectNo}-NNN 取自此处） */
  projectNo: string | null
  projectName: string | null
  customerName: string | null
  /** 批次号（FH-项目编号-NNN，决策#5） */
  batchNo: string | null
  /** 发货时间（标记已发货时写入） */
  shipmentDate: string | null
  shipmentAmount: number | null
  receivedAmount: number | null
  returnedAmount: number | null
  /** 发货状态（字典 shipment_status） */
  shipmentStatus: string | null
  shipmentStatusName: string | null
  shipmentStatusStyle: string | null
  receivableId: number | null
  processInstanceId: string | null
  /** 审批状态（APPROVING/APPROVED/REJECTED/CANCELLED；APPROVED=已通过，前端据此隐藏编辑入口） */
  approvalStatus: string | null
  applicantId: number | null
  applicantName: string | null
  shippedById: number | null
  shippedByName: string | null
  confirmedById: number | null
  confirmedByName: string | null
  createdAt: string | null
  /** 明细行（详情才有） */
  lines: ShipmentLineVO[]
  /** 关联应收单（客户已收货生成后才有） */
  receivable: ReceivableVO | null
  /** 签收证据文件 ID 列表（决策#6；confirmedById 非空时有值） */
  proofFileIds: number[] | null
  /** 当前用户在流程实例上的待办任务 ID（审批中才有；详情页据此「通过/驳回」） */
  myPendingTaskId: string | null
}

/** 发货明细行 */
export interface ShipmentLineVO {
  id: number
  shipmentId: number
  itemId: number
  itemName: string | null
  specModel: string | null
  unit: string | null
  shipmentQty: number
  receivedQty: number
  returnedQty: number
  lineStatus: string | null
  lineStatusName: string | null
  lineStatusStyle: string | null
  unitPrice: number | null
  lineAmount: number | null
  /** 剩余可收 = 已发 - 已收 - 退货 */
  remainingCanReceive: number
}

/** 关联应收单（由发货「客户已收货」生成，决策#2） */
// 应收单类型单一真源：types/receivable.ts（对齐后端 com.firestar.dto.ReceivableVO）。
// 这里改为再导出，避免与内嵌场景（ShipmentVO.receivable）出现两份各自演化的定义。
import type { ReceivableVO } from './receivable'
export type { ReceivableVO }

/** 货物明细（新建发货申请时按项目拉取，/item/list） */
export interface ItemVO {
  id: number
  projectId: number
  itemName: string | null
  specModel: string | null
  unit: string | null
  /** 合同数量 */
  quantity: number
  /** 已发货累计（V49；前端预校验超发用：quantity - shippedQty = 剩余可发） */
  shippedQty: number | null
  unitPrice: number | null
  totalAmount: number | null
}

/** 新建发货申请表单（/shipment，提交即发起审批，决策#1） */
export interface ShipmentCreateForm {
  projectId: number
  lines: ShipmentLineForm[]
}

/** 发货申请单行（itemId + 本次发货数量） */
export interface ShipmentLineForm {
  itemId: number
  shipmentQty: number
}

/** 标记客户收货表单（决策#6：必传证据；支持按行部分收货） */
export interface ShipmentConfirmForm {
  shipmentId: number
  proofFileIds: number[]
  lines: ShipmentLineReceiveForm[]
}

/** 客户收货单行（itemId + 本次收货数量） */
export interface ShipmentLineReceiveForm {
  itemId: number
  receivedQty: number
}
