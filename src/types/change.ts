// 合同变更模块类型（与后端 com.firestar.dto.ChangeVO / ChangeCreateReq 对齐，V220）
import type { TimelineNodeVO } from './project'

/** 变更明细 diff 行请求 */
export interface ChangeItemReq {
  /** ADD / MODIFY / DELETE */
  opType: 'ADD' | 'MODIFY' | 'DELETE'
  /** 原明细行 ID（MODIFY/DELETE 必填；ADD 为空） */
  itemId?: number | null
  itemName?: string
  specModel?: string
  unit?: string
  quantity?: number
  unitPrice?: number
  /** 关联货物 ID（服务行传 0） */
  goodsId?: number | null
}

/** 发起变更请求 */
export interface ChangeCreateReq {
  changeReason: string
  /** null = 不改金额，仅应用明细 diff */
  newContractAmount: number | null
  items: ChangeItemReq[]
}

/** 变更明细 diff 行 VO */
export interface ChangeItemVO {
  id: number
  changeId: number
  opType: string
  itemId: number | null
  itemName: string
  specModel: string | null
  unit: string | null
  quantity: number
  unitPrice: number
  goodsId: number | null
}

/** 变更单 VO */
export interface ChangeVO {
  id: number
  changeNo: string
  projectId: number
  projectNo: string | null
  projectName: string | null
  changeReason: string
  oldContractAmount: number | null
  newContractAmount: number | null
  windowType: 'A' | 'B'
  approvalStatus: string
  approvalStatusName: string
  executeStatus: string
  currentNodeName?: string | null
  processInstanceId: string | null
  applicantId: number | null
  applicantName: string | null
  appliedAt: string | null
  executedAt: string | null
  createdAt: string | null
  items?: ChangeItemVO[]
  timeline?: TimelineNodeVO[]
  myPendingTaskId?: string | null
  canCancel?: boolean
}
