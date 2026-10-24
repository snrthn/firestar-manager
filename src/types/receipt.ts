// 回款（收款）模块前后端共享类型。
// 字段逐一对齐后端：
//   com.firestar.dto.ReceiptVO        （/receipt/page、/receipt/{id} 返回）
//   com.firestar.dto.ReceiptRequest   （/receipt POST、/receipt/{id} PUT 请求体）
// 字典：receipt_status / receipt_type / doc_direction（均在 V2__init_dict_data.sql 已种）

/** 分页结果（MyBatis-Plus IPage 序列化：records/total/size/current/pages） */
export interface ReceiptPageVO {
  records: ReceiptVO[]
  total: number
  size: number
  current: number
  pages: number
}

/** 回款单列表行 / 详情。注意：状态字段真名是 approvalStatus（不是 receiptStatus） */
export interface ReceiptVO {
  id: number
  /** 收款单号（业务键，生成规则 SK-yyyyMMdd-NNN） */
  receiptNo: string | null
  projectId: number | null
  projectNo: string | null
  projectName: string | null
  customerName: string | null
  /** 收款金额 */
  receiptAmount: number | null

  /** 单据方向（字典 doc_direction：BLUE 蓝字 / RED 红字） */
  docDirection: string | null
  docDirectionName: string | null
  docDirectionStyle: string | null

  /** 款项类型（字典 receipt_type：NORMAL 正常收款 / PREPAY 预收款 / OVERPAY 多收款） */
  receiptType: string | null
  receiptTypeName: string | null
  receiptTypeStyle: string | null

  /** 收款日期 */
  receiptDate: string | null
  /**
   * ⚠️ 历史废弃列：fin_receipt.bank_receipt_path（V1 baseline 的「只存路径」残留，
   * 2026-10-25 V62 起后端不再写入。附件统一走下面的 attachmentFileIds 软关联。）
   */
  bankReceiptPath: string | null
  /**
   * 银行回单附件文件 ID 列表（软关联：sys_file_storage.bizType='receipt' + bizId=本单 id，
   * 与发货签收证据 V54 shipment_receive_proof 同构）。列表接口不返回、仅详情返回。
   */
  attachmentFileIds?: number[] | null

  /** 审批状态（字典 receipt_status） */
  approvalStatus: string | null
  approvalStatusName: string | null
  approvalStatusStyle: string | null

  /** Flowable 流程实例 ID（提交审批后非空） */
  processInstanceId: string | null
  /** 申请人 ID（归属人 = LogicDeleteEntity.createdBy） */
  applicantId: number | null
  applicantName: string | null
  createdAt: string | null
  /** 当前登录用户在该流程实例上的待办任务 ID（无则 null） */
  myPendingTaskId: string | null
}

/**
 * 新建 / 编辑回款单请求。
 *
 * 注意：fin_receipt 表当前无 remark 列（Receipt 实体也没有该字段），
 * 后端 ReceiptRequest 虽声明 remark，但实体无映射 → 暂不落库。
 * 前端保留该输入位（发送无害），待后续补列即可自动生效。
 */
export interface ReceiptRequest {
  projectId: number
  receiptAmount: number
  /** 字典 receipt_type，后端未显式校验必填 */
  receiptType?: string | null
  receiptDate?: string | null
  /** ⚠️ 历史废弃字段：后端自 V62 起不再写入，保留仅为兼容旧请求体 */
  bankReceiptPath?: string | null
  /**
   * 银行回单附件文件 ID 列表。
   *
   * 前端先调 POST /files/upload（bizType='receipt'，新建时无 id 故 bizId 留空）拿 fileId，
   * 随本请求提交；后端在单据落库后统一把 bizType/bizId 改写挂载（编辑态按全量列表差分解绑）。
   */
  attachmentFileIds?: number[] | null
  remark?: string | null
}

/**
 * 收款审批状态字典值。
 *
 * 必须与后端 ReceiptServiceImpl 实际写入 approval_status 的字面量 + receipt_status 字典（V64 补齐）一一对应：
 *   PENDING_APPROVAL   创建即草稿态
 *   CASHIER_APPROVING  提交审批中
 *   CANCELLED          申请人撤回（V64：字典此前缺此值，撤回后标签/样式全空）
 *   RECEIVED           已收款
 *   PARTIAL_WRITEOFF   部分核销
 *   FULL_WRITEOFF      全部核销
 *   REJECTED           审批驳回
 */
export const RECEIPT_STATUS = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  CASHIER_APPROVING: 'CASHIER_APPROVING',
  CANCELLED: 'CANCELLED',
  RECEIVED: 'RECEIVED',
  PARTIAL_WRITEOFF: 'PARTIAL_WRITEOFF',
  FULL_WRITEOFF: 'FULL_WRITEOFF',
  REJECTED: 'REJECTED',
} as const
