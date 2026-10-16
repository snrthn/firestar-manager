import request from './request'
import type { ApiResult } from '@/types/auth'
import type { LoginLogPageVO, AuditLogPageVO } from '@/types/log'

// 日志管理接口（后端 /logs/**，权限 log:view）。

/** 登录日志分页（账号模糊 / 状态精确 / 时间区间） */
export function listLoginLogs(
  pageNum = 1,
  pageSize = 10,
  params?: { username?: string; status?: string; startTime?: string; endTime?: string },
) {
  return request
    .get<ApiResult<LoginLogPageVO>>('/logs/login', { params: { pageNum, pageSize, ...params } })
    .then((r) => r.data.data!)
}

/** 操作审计分页（操作人模糊 / 目标类型精确 / 操作类型精确 / 时间区间） */
export function listOperationLogs(
  pageNum = 1,
  pageSize = 10,
  params?: {
    operator?: string
    targetType?: string
    operationType?: string
    startTime?: string
    endTime?: string
  },
) {
  return request
    .get<ApiResult<AuditLogPageVO>>('/logs/operation', { params: { pageNum, pageSize, ...params } })
    .then((r) => r.data.data!)
}
