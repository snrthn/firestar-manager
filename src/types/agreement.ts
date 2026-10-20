// 协议 / 参数设置 前后端共享类型（与后端 com.firestar.dto 对齐）

/** 协议展示 / 弹层 / 个人中心通用 VO（后端 AgreementVO） */
export interface AgreementVO {
  /** → sys_agreement.id（回写 consent/withdraw 用） */
  agreementId: number
  /** TERMS / PRIVACY */
  code: string
  /** 协议名称 */
  name: string
  /** 生效版本号 v1/v2... */
  version: string
  /** 生效版本 id（回写 consent/withdraw 用，存 id 不存字符串，合规可溯源） */
  versionId: number
  /** 变更摘要（弹层左侧 / 版本历史） */
  changeSummary: string | null
  /** Markdown 全文（弹层右侧 / 展示页；consents 场景为 null） */
  content: string | null
  /** 是否要求重同意（弹层文案区分：首次确认 / 协议已更新） */
  needReconsent: boolean | null
  /** 当前用户对生效版本的最后动作 AGREE/WITHDRAW/null（个人中心） */
  lastAction: string | null
  /** 最后同意时间（个人中心） */
  consentedAt: string | null
}

/** 协议版本（后端 AgreementVersion，版本历史展示） */
export interface AgreementVersion {
  id: number
  agreementId: number
  /** 版本号 v1/v2... */
  ver: string
  /** Markdown 快照 */
  content: string
  changeSummary: string | null
  effectiveAt: string | null
  needReconsent: boolean | null
  publishedBy: number | null
  status: string
}

/** 参数设置项（后端 ConfigItemVO） */
export interface ConfigItemVO {
  configKey: string
  configValue: string | null
  configType: string | null
  /** 作为表单 label / 提示 */
  remark: string | null
}

/** 关于我们弹窗聚合数据（后端 AboutVO） */
export interface AboutVO {
  systemName: string
  icpNo: string
  supportContact: string
  /** 关于我们（富文本 HTML） */
  aboutUs: string
  appVersion: string
  /** 系统 Logo 地址（config: logo_url）；空串=未配置，侧栏回落默认标识 */
  logoUrl: string
}

/** 同意请求体（后端 ConsentRequest） */
export interface ConsentRequest {
  versionId: number
  channel?: string
}

/** 撤回请求体（后端 WithdrawRequest） */
export interface WithdrawRequest {
  versionId: number
}

/** 发布新版本请求体（后端 PublishVersionRequest） */
export interface PublishVersionRequest {
  agreementId: number
  content: string
  changeSummary: string
  needReconsent: boolean
}
