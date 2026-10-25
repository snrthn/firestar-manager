// 客户模块前后端共享类型（与后端 com.firestar.dto.CustomerOptionVO 对齐）
// V68 一期：只有下拉选项，没有 CRUD 表单类型 —— 客户端主数据由项目表单自动建档维护。

/** 下拉选项（/customer/options） */
export interface CustomerOptionVO {
  /** 客户 ID → fin_customer.id */
  id: number
  /** 客户编号（CUS-yyyyMMdd-NNNN，与项目编号 PJ- 同范式） */
  customerNo: string | null
  /** 客户名称（下拉主标题，选中后回填为项目的快照 customerName） */
  customerName: string
  /** 联系电话 */
  contactPhone: string | null
}
