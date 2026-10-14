// 用户模块前后端共享类型（与后端 com.firestar.dto.UserVO / UserRequest 对齐）

/** 分页结果（与后端 MyBatis-Plus IPage 序列化字段对齐：records/total/size/current/pages） */
export interface UserPageVO {
  records: UserVO[]
  total: number
  size: number
  current: number
  pages: number
}

/** 用户下拉选项（负责人选择等场景） */
export interface UserOptionVO {
  id: number
  nickname: string
}

/** 用户管理列表行（/system/user/page） */
export interface UserVO {
  id: number
  /** 用户名/账号（创建后不可改） */
  username: string
  /** 姓名 */
  nickname: string
  /** 所属部门 ID → sys_org.id（null = 未分配） */
  deptId: number | null
  /** 部门名称（服务层回填） */
  deptName: string | null
  /** 角色 ID 集合（编辑弹窗回显） */
  roleIds: number[]
  /** 角色名称集合（服务层回填） */
  roleNames: string[]
  /** 状态：ENABLED / DISABLED */
  status: string
  /** 是否首次登录强制改密：0 否 1 是 */
  forceChangePassword: number
  lastLoginAt: string | null
  /** 手机号（nullable，未填为空） */
  phone: string | null
  /** 邮箱（nullable，未填为空） */
  email: string | null
  /** 岗位 ID → sys_post.id（null = 未分配） */
  postId: number | null
  /** 岗位名称（服务层回填） */
  postName: string | null
}

// 用户表单（新增 / 修改共用，与后端 UserRequest 对齐）
export interface UserFormData {
  id?: number
  /** 用户名/账号（创建后不可改；修改时提交原值，后端拒改） */
  username: string
  nickname: string
  /** 密码（仅新增必填，≥6 位；修改时忽略） */
  password: string
  deptId: number | null
  roleIds: number[]
  status: string
  /** 手机号（非必填；填了需 11 位，页面层校验） */
  phone: string
  /** 邮箱（非必填；填了需符合邮箱格式，页面层校验） */
  email: string
  /** 岗位 ID → sys_post.id（null = 未分配；创建/修改非必填） */
  postId: number | null
}
