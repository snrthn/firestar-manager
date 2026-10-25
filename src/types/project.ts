// 立项模块前后端共享类型（与后端 com.firestar.dto.ProjectVO / ProjectRequest 对齐）
import type { ItemVO } from './shipment'

/** 分页结果（与后端 MyBatis-Plus IPage 序列化字段对齐：records/total/size/current/pages） */
export interface ProjectPageVO {
  records: ProjectVO[]
  total: number
  size: number
  current: number
  pages: number
}

/** 立项列表行（/project/page） */
export interface ProjectVO {
  id: number
  /** 项目编号（审批通过后才赋予，此前为 null） */
  projectNo: string | null
  projectName: string
  customerName: string | null
  /** 销售经理 ID → sys_user.id */
  salesManagerId: number | null
  /** 销售经理展示名（后端批量翻译：nickname 优先 username 兜底；空值前端回显 ID） */
  salesManagerName: string | null
  /** 合同签约状态（字典 project_contract_status；V46 起由签约动作后置驱动，建项默认 UNSIGNED） */
  contractStatus: string | null
  /** 合同总金额（BigDecimal，序列化为数值） */
  contractAmount: number | null
  /** 累计发货金额（Σ fin_shipment.shipment_amount，按项目聚合，发货流程起有数） */
  shippedAmount: number | null
  /** 累计已收金额（Σ fin_shipment.received_amount） */
  receivedAmount: number | null
  /** 累计退货金额（Σ fin_shipment.returned_amount） */
  returnedAmount: number | null
  /** 签约描述/签约留言（签约时补录，非必填；V46） */
  contractDesc: string | null
  /** 签约时间（V46） */
  contractSignedAt: string | null
  /** 签约人 ID（V46） */
  contractSignedBy: number | null
  /** 签约人展示名（后端批量翻译，V46） */
  contractSignedByName: string | null
  /** 审批状态（字典 project_approval_status：DRAFT/APPROVING/APPROVED/REJECTED） */
  approvalStatus: string
  /** 审批状态中文名（字典翻译，后端回填） */
  approvalStatusName: string | null
  /** 审批状态标签色（字典 style 透传，V45；el-tag type 直接用，空值前端兜底 info） */
  approvalStatusStyle: string | null
  /** Flowable 流程实例 ID（提交审批后非空） */
  processInstanceId: string | null
  createdAt: string | null
  /** 货物明细列表（方案2：立项带行；仅详情返回，列表页为空） */
  items?: ItemVO[]
}

// 立项表单（新增 / 编辑共用，与后端 ProjectRequest 对齐）
// 注意：contractStatus 已从表单移除（2026-10-22 虎哥拍板签约后置）——
// 建项不再选合同状态，create 强制 UNSIGNED，签约是审批通过后的独立动作。
export interface ProjectFormData {
  id?: number
  projectName: string
  customerName?: string
  salesManagerId?: number
  contractAmount?: number
  /** 货物明细（方案2：立项带行） */
  items?: ProjectItemForm[]
}

/** 立项货物明细行（与后端 ProjectItemReq 对齐） */
export interface ProjectItemForm {
  itemName: string
  specModel?: string
  unit?: string
  quantity?: number
  unitPrice?: number
}

/** 签约表单（审批通过后的独立动作；金额可修正为最终合同额，描述非必填） */
export interface ProjectSignFormData {
  contractAmount?: number
  contractDesc?: string
}

/** 审批时间线节点（与后端 TimelineNodeVO 对齐） */
export interface TimelineNodeVO {
  nodeId: string
  nodeName: string
  /** ACTIVE = 待审批（前端高亮）/ DONE = 已通过 / REJECTED = 已驳回或跳过 / WITHDRAWN = 申请人撤回 / ENDED = 流程结束合成节点 */
  result: 'ACTIVE' | 'DONE' | 'REJECTED' | 'WITHDRAWN' | 'ENDED'
  /** 处理人展示名：DONE/REJECTED 只放实际操作人；ACTIVE 是候选集合 */
  handlerNames: string[] | null
  /** 审批留言（Flowable 评论，无则 null） */
  comment: string | null
  /** 到达时间 */
  startTime: string | null
  /** 完成时间（ACTIVE 为 null） */
  endTime: string | null
}
