// 数据看板（L1/L2）前后端契约类型
// 后端返回 BigDecimal → JSON number；比率/百分比同为 number（0~1）

export type PeriodPreset =
  | 'THIS_MONTH'
  | 'THIS_QUARTER'
  | 'THIS_YEAR'
  | 'LAST_12_MONTH'
  | 'ALL'

/** 看板统一查询条件（对应后端 StatsQuery） */
export interface StatsQuery {
  periodStart?: string
  periodEnd?: string
  periodPreset?: PeriodPreset
  projectId?: number
  customerId?: number
  managerId?: number
  goodsId?: number
}

/** Tab① 经营总览 */
export interface OverviewVO {
  contractAmount: number
  shipmentAmount: number
  receivableOccurred: number
  invoiceAmount: number
  taxAmount: number
  receiptAmount: number
  writeOffAmount: number
  diffPool: number
  arBalance: number
  uninvoicedBalance: number
  overdueAmount: number
  projectCount: number
  customerCount: number
  goodsCount: number
}

/** Tab② 应收与回款摘要（L1） */
export interface ArSummaryVO {
  arBalance: number
  overdueAmount: number
  overdueRate: number
  receiptPeriod: number
  receivablePeriod: number
  collectionRate: number
  writeOffPeriod: number
  diffPool: number
}

/** Tab③ 开票与票税摘要 */
export interface InvoiceSummaryVO {
  invoiceAmount: number
  taxAmount: number
  invoiceAmountNet: number
  uninvoicedBalance: number
  invoiceRate: number
  redInvoiceRate: number
  receiptAmount: number
}

/** Tab④ 项目排名行 */
export interface ProjectRankingRowVO {
  projectId: number
  projectNo: string
  projectName: string
  customerName: string
  managerName: string
  contractAmount: number
  shipmentAmount: number
  receiptAmount: number
  invoiceAmount: number
  receivableAmount: number
  shipRate: number
  invoiceRate: number
  receiptRate: number
}

/** Tab④ 项目排名集合 */
export interface ProjectRankingVO {
  rows: ProjectRankingRowVO[]
  total: number
}

/** Tab⑤ 履约与风控 */
export interface FulfillmentVO {
  returnRate: number
  returnAmountTotal: number
  shipmentAmountTotal: number
  inTransitOverdueCount: number
  redRate: number
}

/** 账龄五段单行 */
export interface AgeingSegmentVO {
  label: string
  amount: number
  ratio: number
}

/** Tab② L2 账龄与周转（FIFO 法） */
export interface AgeingVO {
  method: string
  totalUnreceived: number
  segments: AgeingSegmentVO[]
  dso: number
  turnover: number
  overdueAmount: number
  overdueRate: number
  add: number
  overdueCount: number
}
