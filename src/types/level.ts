// 职级模块前后端共享类型（与后端 com.firestar.dto.LevelVO / LevelRequest 对齐）

/** 分页结果（与后端 MyBatis-Plus IPage 序列化字段对齐：records/total/size/current/pages） */
export interface LevelPageVO {
  records: LevelVO[]
  total: number
  size: number
  current: number
  pages: number
}

/** 职级管理列表行（/system/level/page） */
export interface LevelVO {
  id: number
  /** 职级编码（创建后不可改，如 L1 / L2 / L3） */
  levelCode: string
  /** 职级名称 */
  levelName: string
  /** 层级数值（1=最低，逐级+1） */
  levelNo: number
  /** 排序（同级内数字越小越靠前） */
  sortNo: number
  /** 状态：ENABLED / DISABLED */
  status: string
  remark: string | null
}

/** 职级下拉选项（用户表单职级选择、流程节点 LEVEL 配置等场景） */
export interface LevelOptionVO {
  id: number
  levelCode: string
  levelName: string
}

// 职级表单（新增 / 修改共用，与后端 LevelRequest 对齐）
export interface LevelFormData {
  id?: number
  /** 职级编码（创建后不可改） */
  levelCode: string
  levelName: string
  levelNo: number
  sortNo: number
  status: string
  remark: string
}
