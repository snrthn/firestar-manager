// 货物下拉选项（与后端 GoodsOptionVO 对齐）
export interface GoodsOptionVO {
  /** 货物 ID → fin_goods.id */
  id: number
  /** 货物编号（GOODS-yyyyMMdd-NNNN，下拉里做副标题） */
  goodsNo: string | null
  /** 货物名称（下拉主标题 + 选中后回填为货物行的 itemName） */
  goodsName: string | null
}
