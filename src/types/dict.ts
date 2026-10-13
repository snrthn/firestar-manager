// 字典模块前后端共享类型（与后端 com.firestar.dto.DictTypeVO / DictDataVO 对齐）

/** 分页结果（与后端 MyBatis-Plus IPage 序列化字段对齐：records/total/size/current/pages） */
export interface DictDataPageVO {
  records: DictDataVO[]
  total: number
  size: number
  current: number
  pages: number
}

/** 字典类型分页结果（字段同 DictDataPageVO） */
export interface DictTypePageVO {
  records: DictTypeVO[]
  total: number
  size: number
  current: number
  pages: number
}

export interface DictTypeVO {
  id: number
  /** 类型编码（业务键，创建后不可改） */
  typeCode: string
  /** 类型名称 */
  typeName: string
  /** 状态：ENABLED / DISABLED */
  status: string
  remark: string | null
}

export interface DictDataVO {
  id: number
  /** 所属类型编码 → sys_dict_type.type_code */
  typeCode: string
  /** 字典标签（展示名） */
  dictLabel: string
  /** 字典键值（存库值） */
  dictValue: string
  sortNo: number
  /** 样式（tag class：primary/success/info/warning/danger） */
  style: string | null
  /** 是否默认：0 否 1 是 */
  isDefault: number
  /** 状态：ENABLED / DISABLED */
  status: string
  remark: string | null
}

// 字典类型表单（新增 / 修改共用，与后端 DictTypeRequest 对齐）
export interface DictTypeFormData {
  id?: number
  typeCode: string
  typeName: string
  status: string
  remark: string
}

// 字典数据表单（新增 / 修改共用，与后端 DictDataRequest 对齐）
export interface DictDataFormData {
  id?: number
  /** 新增时由页面上下文（路由 query typeCode）带入；修改时后端忽略该字段 */
  typeCode: string
  dictLabel: string
  dictValue: string
  sortNo: number
  style: string
  isDefault: number
  status: string
  remark: string
}
