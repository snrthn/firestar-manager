// 组织架构模块前后端共享类型（与后端 com.firestar.dto.OrgVO / OrgRequest 对齐）

/** 组织架构树节点（/system/org/list）；children 为下级部门 */
export interface OrgVO {
  id: number
  /** 上级部门 ID（自引用，0 = 主部门/根） */
  parentId: number
  orgName: string
  /** 部门负责人 ID → sys_user.id（null = 暂未指定） */
  leaderId: number | null
  /** 负责人姓名（服务层回填；leaderId 为空时为空串） */
  leaderName: string
  sortNo: number
  /** 状态：ENABLED / DISABLED */
  status: string
  children?: OrgVO[]
}

// 组织架构表单（新增 / 修改共用，与后端 OrgRequest 对齐）
export interface OrgFormData {
  id?: number
  /** 上级部门 ID（0 = 主部门/根） */
  parentId: number
  orgName: string
  /** 部门负责人 ID（null = 暂未指定） */
  leaderId: number | null
  sortNo: number
  status: string
}
