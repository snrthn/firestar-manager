// 权限模块前后端共享类型（与后端 com.firestar.dto.PermissionVO / PermissionRequest 对齐）

/** 分页结果（与后端 MyBatis-Plus IPage 序列化字段对齐：records/total/size/current/pages） */
export interface PermissionPageVO {
  records: PermissionVO[]
  total: number
  size: number
  current: number
  pages: number
}

/** 权限树节点（/system/permission/list）；children 为子权限 */
export interface PermissionVO {
  id: number
  /** 父权限 ID（自引用，0/null = 根级） */
  parentId: number | null
  /** 权限编码（创建后不可改，如 user:manage） */
  permCode: string
  permName: string
  /** 资源类型（字典 permission_resource，如 API / MENU / BUTTON） */
  resourceType: string
  /** 操作类型（字典 permission_action，如 READ / WRITE / EXECUTE） */
  actionType: string
  /** 状态：ENABLED / DISABLED */
  status: string
  /** 上级权限名称（分页列表回填，平铺展示层级用） */
  parentName?: string | null
  children?: PermissionVO[]
}

// 权限表单（新增 / 修改共用，与后端 PermissionRequest 对齐）
export interface PermissionFormData {
  id?: number
  /** 权限编码（创建后不可改） */
  permCode: string
  permName: string
  resourceType: string
  actionType: string
  /** 上级权限 ID（0 = 根级） */
  parentId: number
  status: string
}
