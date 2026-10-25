import request from './request'
import type { ApiResult } from '@/types/auth'
import type {
  AutoMatchResultVO,
  DifferencePoolVO,
  ReverseRequest,
  WriteOffLedgerPageVO,
} from '@/types/writeoff'

// 核销台账接口（后端 /writeoff/**；2026-10-25 阶段一）

/**
 * 核销台账分页（fin_write_off + fin_invoice_allocation 合并，createdAt 倒序）。
 *
 * 后端 WriteOffController.page 声明了全部筛选参数（projectId/ledgerType/status/
 * keyword/dateFrom/dateTo），未声明的键会被忽略——按需传即可。
 */
export function writeoffLedgerPage(
  pageNum = 1,
  pageSize = 10,
  params: {
    projectId?: number
    ledgerType?: string
    status?: string
    keyword?: string
    dateFrom?: string
    dateTo?: string
  } = {},
) {
  return request
    .get<ApiResult<WriteOffLedgerPageVO>>('/writeoff/page', { params: { pageNum, pageSize, ...params } })
    .then((r) => r.data.data!)
}

/** 差异池：按项目分组的「未核销收款单 × 未回款应收单」待配对视图 */
export function differencePool(projectId?: number) {
  return request
    .get<ApiResult<DifferencePoolVO[]>>('/writeoff/difference-pool', {
      params: projectId == null ? {} : { projectId },
    })
    .then((r) => r.data.data!)
}

/**
 * 自动核销（同项目内金额贪心、日期优先，method=AUTO）。
 *
 * 全部配不上抛错（不产生半截结果）；返回配对明细供前端展示「这轮干了什么」。
 */
export function autoMatch(projectId: number) {
  return request
    .post<ApiResult<AutoMatchResultVO>>(`/writeoff/auto-match?projectId=${projectId}`)
    .then((r) => r.data.data!)
}

/**
 * 反核销：原行置 REVERSED 留痕 + 回滚应收单 + 重算主单口径。
 * 原单为红冲单时回滚方向取反（后端处理）。
 */
export function reverseLedger(data: ReverseRequest) {
  return request.post<ApiResult<null>>('/writeoff/reverse', data).then((r) => r.data)
}
