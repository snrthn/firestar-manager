// 日志管理模块前后端共享类型（与后端 com.firestar.dto.LoginLogVO / AuditLogVO 对齐）

/** 登录日志分页结果 */
export interface LoginLogPageVO {
  records: LoginLogVO[]
  total: number
  size: number
  current: number
  pages: number
}

export interface LoginLogVO {
  id: number
  userId: number | null
  username: string | null
  /** 结果：SUCCESS 成功 / FAIL 失败 / KICKED_OUT 被顶下线 */
  loginStatus: string | null
  ipAddress: string | null
  userAgent: string | null
  failReason: string | null
  loginAt: string | null
}

/** 操作审计分页结果 */
export interface AuditLogPageVO {
  records: AuditLogVO[]
  total: number
  size: number
  current: number
  pages: number
}

export interface AuditLogVO {
  id: number
  operatorId: number | null
  /** 操作人账号（后端按 operatorId 回填） */
  operatorName: string | null
  /** 操作类型：CREATE / UPDATE / DELETE / UPLOAD ... */
  operationType: string | null
  /** 目标对象类型：USER / ROLE / MENU / DICT_TYPE / DICT_DATA / FILE ... */
  targetType: string | null
  targetId: number | null
  /** 改前关键字段快照（Map，只含声明过的字段） */
  beforeValue: Record<string, unknown> | null
  /** 改后关键字段快照 */
  afterValue: Record<string, unknown> | null
  operatedAt: string | null
  ipAddress: string | null
  remark: string | null
}
