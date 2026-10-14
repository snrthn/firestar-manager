// 认证模块前后端共享类型（与后端 com.firestar.dto 对齐）

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  token: string
  expiresIn: number
  username: string
  nickname: string
  forceChangePassword: boolean
  roles: string[]
}

export interface ChangePasswordRequest {
  oldPassword?: string
  newPassword: string
}

export interface RoleVO {
  roleCode: string
  roleName: string
}

export interface ProfileVO {
  username: string
  nickname: string
  status: string
  forceChangePassword: boolean
  roles: RoleVO[]
  permissions: string[]
}

export interface MenuVO {
  id: number
  parentId: number
  menuName: string
  routePath: string
  component: string
  permCode: string | null
  menuType: string
  sortNo: number
  visible: number
  status: string
  icon?: string | null
  children?: MenuVO[]
}

// 菜单管理页表单（新增 / 修改共用，与后端 MenuRequest 对齐）
export interface MenuFormData {
  id?: number
  parentId: number
  menuName: string
  routePath: string
  component: string
  permCode: string
  menuType: 'CATALOG' | 'MENU'
  sortNo: number
  visible: number
  status: string
  icon?: string
}

// 后端统一响应体结构：{ code, message, data }
export interface ApiResult<T> {
  code: number
  message: string
  data: T
}
