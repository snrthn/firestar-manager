// 发票（开票）模块前后端共享类型。
// 字段逐一对齐后端：
//   com.firestar.dto.InvoiceVO      （/invoice/page、/invoice/{id} 返回）
//   com.firestar.dto.InvoiceRequest （/invoice POST、/invoice/{id} PUT 请求体）
// 字典：invoice_status / invoice_type / doc_direction / receivable_status
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

/** 发票单列表行 / 详情。注意：状态字段真名是 invoiceStatus（不是 status） */
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

  /** 开票状态（字典 invoice_status） */
  invoiceStatus: string | null
  invoiceStatusName: string | null
  invoiceStatusStyle: string | null

  /** Flowable 流程实例 ID（提交审批后非空） */
  processInstanceId: string | null
  /** 申请人 ID */
  applicantId: number | null
  applicantName: string | null
  /** 开票员 ID（审批通过时后端置为当前用户） */
  clerkId: number | null
  clerkName: string | null
  createdAt: string | null
  /** 当前登录用户在该流程实例上的待办任务 ID（无则 null） */
  myPendingTaskId: string | null
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
   * 前端先调 POST /files/upload（bizType='invoice'，新建时无 id 故 bizId 留空）拿 fileId，
   * 随本请求提交；后端在单据落库后统一把 bizType/bizId 改写挂载（编辑态按全量列表差分解绑）。
   */
  attachmentFileIds?: number[] | null
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
 * 开票状态字典值。
 *
 * 必须与后端 InvoiceServiceImpl 实际写入的状态字面量 + invoice_status 字典（V63 补齐）一一对应：
 *   PENDING   创建即草稿态
 *   ISSUING   提交审批中
 *   CANCELLED 申请人撤回（V63：字典此前缺此值，撤回后标签/样式全空）
 *   ISSUED    审批通过
 *   REJECTED  审批驳回（V63：字典此前同样缺）
 */
export const INVOICE_STATUS = {
  PENDING: 'PENDING',
  ISSUING: 'ISSUING',
  CANCELLED: 'CANCELLED',
  ISSUED: 'ISSUED',
  REJECTED: 'REJECTED',
} as const
