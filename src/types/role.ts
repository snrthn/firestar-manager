// 角色模块前后端共享类型（与后端 com.firestar.dto.RoleManageVO / RoleRequest 对齐）

/** 分页结果（与后端 MyBatis-Plus IPage 序列化字段对齐：records/total/size/current/pages） */
export interface RolePageVO {
  records: RoleManageVO[]
  total: number
  size: number
  current: number
  pages: number
}

/** 角色管理列表行（/system/role/page） */
export interface RoleManageVO {
  id: number
  /** 角色编码（创建后不可改） */
  roleCode: string
  /** 角色名称 */
  roleName: string
  /** 排序（同级内数字越小越靠前） */
  sortNo: number
  /** 状态：ENABLED / DISABLED */
  status: string
  remark: string | null
}

// 角色表单（新增 / 修改共用，与后端 RoleRequest 对齐；权限分配走独立接口）
export interface RoleFormData {
  id?: number
  /** 角色编码（创建后不可改） */
  roleCode: string
  roleName: string
  sortNo: number
  status: string
  remark: string
}

/** 角色权限分配请求（PUT /system/role/{id}/perms；整体替换语义） */
export interface RolePermFormData {
  permIds: number[]
}

/** 角色菜单分配请求（PUT /system/role/{id}/menus；整体替换语义） */
export interface RoleMenuFormData {
  menuIds: number[]
}
