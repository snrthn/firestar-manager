// 发票（开票）模块前后端共享类型。
// 字段逐一对齐后端：
//   com.firestar.dto.InvoiceVO      （/invoice/page、/invoice/{id} 返回）
//   com.firestar.dto.InvoiceRequest （/invoice POST、/invoice/{id} PUT 请求体）
// 字典：approval_status / invoice_type / doc_direction / receivable_status
//      （invoice_type 由 V59 建，其余在 V2__init_dict_data.sql 已种）
// 核销分配类型（AllocationItem/AllocationVO）从 './receipt' 引入——收款与发票共用一套双向拆分语义
import type { AllocationItem, AllocationVO } from './receipt'

export type { AllocationItem, AllocationVO }

/** 分页结果（MyBatis-Plus IPage 序列化：records/total/size/current/pages） */
export interface InvoicePageVO {
  records: InvoiceVO[]
  total: number
  size: number
  current: number
  pages: number
}

/** 发票单列表行 / 详情。注意：状态字段真名是 approvalStatus（V75 由 invoiceStatus 改名；不是 status） */
export interface InvoiceVO {
  id: number
  /** 发票号码 */
  invoiceNo: string | null
  /** 发票代码 */
  invoiceCode: string | null
  projectId: number | null
  projectName: string | null
  /** 关联应收单 */
  receivableId: number | null
  receivableNo: string | null

  /** 开票金额 */
  invoiceAmount: number | null
  /** 税率（如 0.1300 = 13%） */
  taxRate: number | null
  /** 税额 */
  taxAmount: number | null

  /** 发票类型（字典 invoice_type：NORMAL 普通发票 / SPECIAL 增值税专用发票） */
  invoiceType: string | null
  invoiceTypeName: string | null
  invoiceTypeStyle: string | null

  /** 单据方向（字典 doc_direction） */
  docDirection: string | null
  docDirectionName: string | null

  /** 红冲原单 ID（docDirection=RED 时非空） */
  originalInvoiceId?: number | null
  /** 红冲原单号（仅详情回填，展示「原单：YS-xxx」） */
  originalInvoiceNo?: string | null

  /** 开票日期 */
  invoiceDate: string | null
  /**
   * ⚠️ 历史废弃列：fin_invoice.invoice_file_path（V1 baseline 的「只存路径」残留，
   * 2026-10-25 V62 起后端不再写入。附件统一走下面的 attachmentFileIds 软关联。）
   */
  invoiceFilePath: string | null
  /**
   * 发票附件文件 ID 列表（软关联：sys_file_storage.bizType='invoice' + bizId=本单 id，
   * 与发货签收证据 V54 shipment_receive_proof 同构）。列表接口不返回、仅详情返回。
   */
  attachmentFileIds?: number[] | null

  /**
   * 核销分配明细（V65 双向拆分；仅详情返回，列表不返回）。
   *
   * <p>哪张应收单分到多少；空数组兜底为主应收单独享（V65 前历史数据）。</p>
   */
  allocations?: AllocationVO[]

  /** 审批状态（字典 approval_status；V75 由 invoice_status 通用化改名） */
  approvalStatus: string | null
  approvalStatusName: string | null
  approvalStatusStyle: string | null

  /** Flowable 流程实例 ID（提交审批后非空） */
  processInstanceId: string | null
  /** 申请人 ID */
  applicantId: number | null
  applicantName: string | null
  /** 开票员 ID（审批通过时后端置为当前用户） */
  clerkId: number | null
  clerkName: string | null
  /**
   * 业务申请单号（V95 发票流程重构：创建即生成，系统唯一，区别于税务发票号 invoiceNo）。
   * 前端申请弹窗不传，创建后由后端回填并展示。
   */
  applyNo?: string | null
  /** 购方名称（发票抬头，快照自客户表） */
  buyerName?: string | null
  /** 购方纳税人识别号 */
  buyerTaxNo?: string | null
  /** 购方地址 */
  buyerAddress?: string | null
  /** 购方电话 */
  buyerPhone?: string | null
  /** 购方开户银行 */
  buyerBankName?: string | null
  /** 购方银行账号 */
  buyerBankAccount?: string | null
  createdAt: string | null
  /** 当前登录用户在该流程实例上的待办任务 ID（无则 null） */
  myPendingTaskId: string | null
  /** 当前审批节点名（审批中由后端回填 Flowable 当前活跃任务名；非审批中为空） */
  currentNodeName?: string | null
}

/**
 * 新建 / 编辑发票单请求。
 *
 * 注意：fin_invoice 表无 remark 列（Invoice 实体也没有），
 * 后端 InvoiceRequest 虽声明 remark，但 InvoiceServiceImpl 未消费 → 前端不提供备注输入位。
 */
export interface InvoiceRequest {
  projectId: number
  /** 应收单 ID（NOT NULL，后端校验存在；发票必须挂在应收单上） */
  receivableId: number
  /** 开票金额 */
  invoiceAmount: number
  /** 税率（如 0.13 = 13%） */
  taxRate?: number | null
  /** 税额 */
  taxAmount?: number | null
  invoiceNo?: string | null
  invoiceCode?: string | null
  /** 字典 invoice_type */
  invoiceType?: string | null
  invoiceDate?: string | null
  /** ⚠️ 历史废弃字段：后端自 V62 起不再写入，保留仅为兼容旧请求体 */
  invoiceFilePath?: string | null
  /**
   * 发票附件文件 ID 列表。
   *
   * V95 发票流程重构：电子发票（票面扫描件）改为「开票」节点由开票员上传（见 InvoiceIssueRequest），
   * 申请阶段不再随本请求提交。字段保留仅为兼容旧请求体；申请提交传 undefined。
   */
  attachmentFileIds?: number[] | null
  /**
   * 关联客户 ID（V95 发票流程重构）。
   * 发票申请选完项目后由前端带出（project.customerId）；购方六要素据此反查客户主表并 upsert 回写。
   */
  customerId?: number | null
  /**
   * 购方六要素（V95 发票流程重构）。
   * 申请阶段填写/编辑，提交时 upsert 进客户主表并快照到发票 buyer* 列；
   * 申请阶段不填税务发票号/代码/日期（那些是开票节点由开票员回填）。
   */
  buyerName?: string | null
  buyerTaxNo?: string | null
  buyerAddress?: string | null
  buyerPhone?: string | null
  buyerBankName?: string | null
  buyerBankAccount?: string | null
  /**
   * 核销分配明细（V65 双向拆分，虎哥拍板 B）。
   *
   * <p>非空时强制 Σ amount = invoiceAmount，每行 ≤ 该应收单未开票余额（后端校验）；
   * 主应收单（receivableId）取第一行，编辑时不可更换。空数组兜底为主应收单独享。</p>
   */
  allocations?: AllocationItem[]
  remark?: string | null
  /**
   * 单据方向（2026-10-25 红冲入口，虎哥拍板「正数+RED 方向」）。
   *
   * BLUE=蓝字（默认）；RED=红字（红冲单，必须配 originalInvoiceId）。
   */
  docDirection?: string | null
  /** 红冲原单 ID（docDirection=RED 时必填；原单须已审批通过、同项目、金额≤原单） */
  originalInvoiceId?: number | null
}

/**
 * 开票请求（V95 发票流程重构）。
 *
 * 开票节点（invoice:issue，ROLE_INVOICER）在审批通过进入 SUBMITTED（待开票）后，由开票员实际开具并回填：
 *   invoiceNo         税务发票号（必填，真实票号，绝不随机生成）
 *   invoiceCode       发票代码（选填，纸质票有）
 *   invoiceDate       开票日期（必填，YYYY-MM-DD，财务凭证关键字段）
 *   attachmentFileIds 电子发票附件文件 ID（必填至少一张，开票产物）
 */
export interface InvoiceIssueRequest {
  invoiceNo: string
  invoiceCode?: string | null
  invoiceDate: string
  attachmentFileIds: number[]
}

/**
 * 发票生命周期状态（V95 发票流程重构，对齐后端 InvoiceServiceImpl + approval_status 字典）。
 *
 *   DRAFT     创建即草稿态（申请填单，未提交审批）
 *   APPROVING 提交审批中（Flowable 单节点流转）
 *   CANCELLED 申请人撤回
 *   REJECTED  审批驳回（可改后重提）
 *   SUBMITTED 审批通过、待开票（V95 起：审批通过不再直接=已开票，而是进入「待开票」）
 *   ISSUED    开票员已开票并上传电子票（终态）
 *
 * 注：列表/详情的状态中文与配色走 useDictLabels('approval_status') 实时翻译，不依赖本常量。
 */
export const INVOICE_STATUS = {
  DRAFT: 'DRAFT',
  APPROVING: 'APPROVING',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED',
  SUBMITTED: 'SUBMITTED',
  ISSUED: 'ISSUED',
} as const
