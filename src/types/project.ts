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

/** 项目下拉选项（看板「按项目筛选」用，V80；对齐后端 ProjectOptionVO） */
export interface ProjectOptionVO {
  id: number
  projectNo: string
  projectName: string
}

/** 立项列表行（/project/page） */
export interface ProjectVO {
  id: number
  /** 项目编号（审批通过后才赋予，此前为 null） */
  projectNo: string | null
  projectName: string
  /**
   * 客户名称（**快照**，V68 起不再作为聚合键）。
   *
   * 显示用：客户主表改名不会回改历史单据的名称，这是刻意的（对账时单据抬头要能对上当时）。
   */
  customerName: string | null
  /**
   * 客户 ID → fin_customer.id（V68；0/null = 未关联）。
   *
   * 看板「按客户」维度的聚合键 —— 统计别拿 customerName 做 GROUP BY，文本会重名分裂。
   */
  customerId: number | null
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
  /**
   * 累计已收金额（Σ 审批通过的收款单 receipt_amount，按项目实时聚合，V65）。
   *
   * <p>虎哥 2026-10-25 拍板 A「按回款口径走」：原 receivedAmount 读的
   * fin_shipment.received_amount 全库无写入方恒 0，本字段取代之。</p>
   */
  collectedAmount: number | null
  /** 累计开票金额（Σ 审批通过的发票 invoice_amount，按项目实时聚合，V65） */
  invoicedAmount: number | null
  /** 应收金额合计（Σ 有效应收单 receivable_amount，V65） */
  receivableAmount: number | null
  /** 是否允许回款前开出发票（V77，票款勾稽开关；true=允许默认，false=强制票款勾稽） */
  allowInvoiceBeforeReceipt?: boolean | null
  /**
   * 累计已收货金额（Σ fin_shipment.received_amount）——⚠️ V65 起废弃口径（恒 0），
   * 保留仅为兼容；页面展示请用 collectedAmount
   */
  receivedAmount: number | null
  /** 累计退货金额（Σ fin_shipment.returned_amount） */
  returnedAmount: number | null
  /** 红冲收款额（docDirection=RED 的收款单金额绝对值汇总，V80；与 collectedAmount 净额并列展示红字行） */
  redReceivedAmount?: number | null
  /** 红冲开票额（docDirection=RED 的发票金额绝对值汇总，V80；与 invoicedAmount 净额并列展示红字行） */
  redInvoicedAmount?: number | null
  /** 红冲应收额（docDirection=RED 的应收单金额绝对值汇总，含退货生成的红字应收，V80；与 receivableAmount 净额并列展示红字行） */
  redReceivableAmount?: number | null
  /** 签约描述/签约留言（签约时补录，非必填；V46） */
  contractDesc: string | null
  /** 签约时间（V46） */
  contractSignedAt: string | null
  /** 签约人 ID（V46） */
  contractSignedBy: number | null
  /** 签约人展示名（后端批量翻译，V46） */
  contractSignedByName: string | null
  /** 审批状态（字典 approval_status：DRAFT/APPROVING/APPROVED/REJECTED/CANCELLED） */
  approvalStatus: string
  /** 审批状态中文名（字典翻译，后端回填） */
  approvalStatusName: string | null
  /** 审批状态标签色（字典 style 透传，V45；el-tag type 直接用，空值前端兜底 info） */
  approvalStatusStyle: string | null
  /** 当前审批节点名（审批中由后端回填；非审批中为空） */
  currentNodeName?: string | null
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
  /**
   * 客户 ID → fin_customer.id（V68 起与下面的名称配套）。
   *
   * 优先级：后端以 id 为准（再用主表名称覆盖快照）；没给 id 但有名称时按名称自动建档。
   */
  customerId?: number
  /** 客户名称（快照；下拉 allow-create 手输新客户时只有名称、没有 id，后端会据其建档） */
  customerName?: string
  salesManagerId?: number
  contractAmount?: number
  /** 是否允许回款前开出发票（V77，票款勾稽开关；true=允许默认，false=强制票款勾稽） */
  allowInvoiceBeforeReceipt?: boolean
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
