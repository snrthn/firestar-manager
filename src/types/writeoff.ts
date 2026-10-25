// 核销台账模块前后端共享类型（2026-10-25 阶段一）。
// 字段逐一对齐后端：
//   com.firestar.dto.WriteOffLedgerVO  （/writeoff/page 返回）
//   com.firestar.dto.DifferencePoolVO   （/writeoff/difference-pool 返回）
//   com.firestar.dto.AutoMatchResultVO  （/writeoff/auto-match 返回）
//   com.firestar.dto.ReverseRequest     （/writeoff/reverse 请求体）
// 字典：writeoff_status（NORMAL/REVERSED）、writeoff_method（MANUAL/AUTO）

/** 分页结果（MyBatis-Plus IPage 序列化：records/total/size/current/pages） */
export interface WriteOffLedgerPageVO {
  records: WriteOffLedgerVO[]
  total: number
  size: number
  current: number
  pages: number
}

/**
 * 核销台账行（fin_write_off + fin_invoice_allocation 双表统一视图）。
 *
 * ledgerType：RECEIPT=回款核销 / INVOICE=开票核销。
 * bizId/bizNo = 主单（收款单或发票）；method 仅回款侧有意义（开票侧恒 MANUAL）。
 */
export interface WriteOffLedgerVO {
  id: number
  ledgerType: 'RECEIPT' | 'INVOICE'
  /** 核销单号（WO-yyyyMMdd-NNN / IA-yyyyMMdd-NNN） */
  ledgerNo: string | null
  projectId: number | null
  projectNo: string | null
  /** 主单（收款单/发票）ID / 单号 */
  bizId: number | null
  bizNo: string | null
  receivableId: number | null
  receivableNo: string | null
  amount: number | null
  /** 状态（字典 writeoff_status）：NORMAL 正常 / REVERSED 已反核销 */
  status: string | null
  /** 核销方式（字典 writeoff_method）：MANUAL / AUTO */
  method: string | null
  /** 核销日期（ISO yyyy-MM-dd；开票侧回落创建日） */
  ledgerDate: string | null
  createdAt: string | null
  /** 创建人 ID（后端翻译 createdByName 用，前端可忽略） */
  createdBy: number | null
  createdByName: string | null
  /** 反核销链：原核销行 ID（REVERSED 行回填自身） */
  originalLedgerId: number | null
  /** 反核销原因（REVERSED 行的 ext.reverseReason） */
  reverseReason: string | null
}

/** 差异池条目：一张还没配平的单据（收款单或应收单） */
export interface PoolItemVO {
  id: number
  no: string | null
  /** 单据全额 */
  amount: number | null
  /** 未核销余额（收款单=未核销 / 应收单=未回款） */
  unmatchedAmount: number | null
  /** 单据日期（ISO yyyy-MM-dd，自动核销「日期优先」的排序依据） */
  docDate: string | null
}

/** 差异池：按项目分组的「未核销收款单 × 未回款应收单」待配对视图 */
export interface DifferencePoolVO {
  projectId: number
  projectNo: string | null
  /** 未核销收款单（已收款 + 蓝字 + 未核销余额 > 0） */
  receipts: PoolItemVO[]
  /** 未回款应收单（未回款余额 > 0） */
  receivables: PoolItemVO[]
}

/** 自动核销配对结果行 */
export interface MatchedPairVO {
  writeOffNo: string | null
  receiptId: number
  receiptNo: string | null
  receivableId: number
  receivableNo: string | null
  amount: number | null
}

/** 自动核销结果（虎哥拍板 auto：同项目金额贪心、日期优先） */
export interface AutoMatchResultVO {
  matchCount: number
  totalAmount: number
  pairs: MatchedPairVO[]
}

/** 反核销请求（V1 范式：原行置 REVERSED 留痕 + 回滚） */
export interface ReverseRequest {
  ledgerType: 'RECEIPT' | 'INVOICE'
  ledgerId: number
  /** 反核销原因（必填；落 ext.reverseReason 留痕） */
  reason: string
}
