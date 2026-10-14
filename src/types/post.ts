// 岗位模块前后端共享类型（与后端 com.firestar.dto.PostVO / PostRequest 对齐）

/** 分页结果（与后端 MyBatis-Plus IPage 序列化字段对齐：records/total/size/current/pages） */
export interface PostPageVO {
  records: PostVO[]
  total: number
  size: number
  current: number
  pages: number
}

/** 岗位管理列表行（/system/post/page） */
export interface PostVO {
  id: number
  /** 岗位编码（创建后不可改） */
  postCode: string
  /** 岗位名称 */
  postName: string
  /** 排序（同级内数字越小越靠前） */
  sortNo: number
  /** 状态：ENABLED / DISABLED */
  status: string
  remark: string | null
}

/** 岗位下拉选项（用户表单岗位选择等场景） */
export interface PostOptionVO {
  id: number
  postName: string
}

// 岗位表单（新增 / 修改共用，与后端 PostRequest 对齐）
export interface PostFormData {
  id?: number
  /** 岗位编码（创建后不可改） */
  postCode: string
  postName: string
  sortNo: number
  status: string
  remark: string
}
