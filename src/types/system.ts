// 系统初始化与重置相关视图对象（与后端 com.firestar.dto.* 对齐）
// 后端真实路径不含 /api（代理层剥离），前端 request.ts 的 baseURL 已处理。

/** 初始化状态视图：GET /system/init/status 返回 */
export interface InitStatusVO {
  /** 是否已完成初始化（sys_initialized） */
  initialized: boolean
  /** 是否试运行模式（trial_mode），仅 true 时可重置 */
  trialMode: boolean
  /** trialMode && initialized，前端据此显示重置入口 */
  canReset: boolean
  /** 是否存在超管账号（admin） */
  adminExists: boolean
}

/** 初始化安装向导请求：POST /system/init，三项均可空（留空回退默认值） */
export interface InitRequest {
  /** 超管账号，默认 admin */
  adminUsername?: string
  /** 超管初始密码，默认 admin123（首次登录强制改密） */
  adminPassword?: string
  /** 超管昵称，默认 系统管理员 */
  adminNickname?: string
}

/** 系统重置请求：POST /system/reset/{light,full} */
export interface ResetRequest {
  /** 必须输入确认词 RESET（二次确认，防误操作） */
  confirmText?: string
  /** 验证码。首次获取时为空，后端生成并回传；二次提交时携带该码 */
  verifyCode?: string
}

/** 系统重置返回 */
export interface ResetResultVO {
  /** 是否已真正执行（false 表示本次仅返回了验证码挑战，未执行） */
  executed: boolean
  /** executed=false 时返回，需用户输入以确认 */
  verifyCode?: string
  /** 提示文案 */
  message?: string
  /** light / full */
  resetType?: string
  /** 本次清理的表名清单（full 重置为 Flyway clean+migrate 占位说明） */
  clearedTables?: string[]
}

/** 环境预检项：GET /system/init/precheck 返回（安装向导 /install 页展示） */
export interface EnvCheckItem {
  /** 检查项名称，如「数据库连通性」 */
  name: string
  /** 是否通过 */
  ok: boolean
  /** 明细，如「SELECT 1 = 1」「可用 1200.0 MB」 */
  detail?: string
}
