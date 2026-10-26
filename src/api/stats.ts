import request from './request'
import type { ApiResult } from '@/types/auth'
import type {
  StatsQuery,
  OverviewVO,
  ArSummaryVO,
  InvoiceSummaryVO,
  ProjectRankingVO,
  FulfillmentVO,
  AgeingVO,
} from '@/types/stats'

// 数据看板（L1/L2）接口层
// 约定：response 拦截器已把壳 Result{code,msg,data} 透出，取内层 data 即业务载体。
// 与项目/发票等模块一致：request.post<T>(...).then((r) => r.data.data!)

const base = '/stats'

/** Tab① 经营总览 */
export function statsOverview(q: StatsQuery = {}) {
  return request.post<ApiResult<OverviewVO>>(`${base}/overview`, q).then((r) => r.data.data!)
}

/** Tab② 应收与回款摘要（L1） */
export function statsAr(q: StatsQuery = {}) {
  return request.post<ApiResult<ArSummaryVO>>(`${base}/ar`, q).then((r) => r.data.data!)
}

/** Tab③ 开票与票税摘要 */
export function statsInvoice(q: StatsQuery = {}) {
  return request.post<ApiResult<InvoiceSummaryVO>>(`${base}/invoice`, q).then((r) => r.data.data!)
}

/** Tab④ 项目排名（仅已签合同 APPROVED） */
export function statsProject(q: StatsQuery = {}) {
  return request.post<ApiResult<ProjectRankingVO>>(`${base}/project`, q).then((r) => r.data.data!)
}

/** Tab⑤ 履约与风控 */
export function statsFulfillment(q: StatsQuery = {}) {
  return request.post<ApiResult<FulfillmentVO>>(`${base}/fulfillment`, q).then((r) => r.data.data!)
}

/** Tab② L2 账龄与周转（FIFO 法） */
export function statsAgeing(q: StatsQuery = {}) {
  return request.post<ApiResult<AgeingVO>>(`${base}/ageing`, q).then((r) => r.data.data!)
}
