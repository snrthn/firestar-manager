// 应收单模块前后端共享类型。
// 字段对齐后端 com.firestar.dto.ReceivableVO（/receivable/page、/receivable/{id}）。
// 应收单由发货「客户已收货」时点自动生成（1 发货 = 1 应收单），前端只提供只读列表/详情。
// 字典：receivable_status / receivable_source / doc_direction

/** 分页结果（MyBatis-Plus IPage 序列化：records/total/size/current/pages） */
export interface ReceivablePageVO {
  records: ReceivableVO[]
  total: number
  size: number
  current: number
  pages: number
}

export interface ReceivableVO {
  id: number
  /** 应收单号（业务键） */
  receivableNo: string | null
  projectId: number | null
  /** 项目编号 / 名称（由 projectId 关联项目带出；后端 page 用批量预取，非逐条查） */
  projectNo: string | null
  projectName: string | null
  /** 来源发货单 ID（1:1） */
  shipmentId: number | null

  /** 单据方向（字典 doc_direction） */
  docDirection: string | null
  docDirectionName: string | null

  /** 应收金额 */
  receivableAmount: number | null
  /** 已核销金额 */
  writtenOffAmount: number | null
  /** 未核销金额 */
  unwrittenOffAmount: number | null
  /** 已开票金额 */
  invoicedAmount: number | null
  /** 未开票金额 */
  uninvoicedAmount: number | null
  /** 已回款金额（V65：按 fin_write_off 明细累加） */
  receivedAmount: number | null
  /** 未回款金额（V65：应收金额 - 已回款） */
  unreceivedAmount: number | null

  /** 应收日期 */
  receivableDate: string | null

  /** 状态（字典 receivable_status）——本 VO 中状态字段真名就是 status */
  status: string | null
  statusName: string | null
  statusStyle: string | null

  /** 来源类型（字典 receivable_source：FROM_SHIPMENT 发货生成 / FROM_RETURN 退货红冲） */
  sourceType: string | null
  sourceTypeName: string | null
}

/** 应收状态字典值 */
export const RECEIVABLE_STATUS = {
  PENDING_CONFIRM: 'PENDING_CONFIRM',
  CONFIRMED: 'CONFIRMED',
  PARTIAL_WRITEOFF: 'PARTIAL_WRITEOFF',
  FULL_WRITEOFF: 'FULL_WRITEOFF',
} as const
