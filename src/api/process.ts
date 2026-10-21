import request from './request'
import type { ApiResult } from '@/types/auth'
import type { ProcessDef, ProcessDefPageVO, DeployResult, ProcessDefVersionVO } from '@/types/process'

// 流程定义管理接口（后端 /process-defs/**）。
// 响应统一解包：request 返回 ApiResult<T>，.then(r => r.data.data!) 取业务数据。

/** 分页列表（processCode/processName 模糊、status 精确；默认每页 10 条） */
export function listProcessDefPage(
  pageNum = 1,
  pageSize = 10,
  params: { processCode?: string; processName?: string; status?: string } = {},
) {
  return request
    .get<ApiResult<ProcessDefPageVO>>('/process-defs/page', { params: { pageNum, pageSize, ...params } })
    .then((r) => r.data.data!)
}

/** 详情 */
export function getProcessDef(id: number) {
  return request.get<ApiResult<ProcessDef>>(`/process-defs/${id}`).then((r) => r.data.data!)
}

/** 新建 */
export function createProcessDef(data: Partial<ProcessDef>) {
  return request.post<ApiResult<ProcessDef>>('/process-defs', data).then((r) => r.data.data!)
}

/** 更新（元数据 + 节点配置） */
export function updateProcessDef(id: number, data: Partial<ProcessDef>) {
  return request.put<ApiResult<ProcessDef>>(`/process-defs/${id}`, data).then((r) => r.data.data!)
}

/** 部署（读已存节点生成 BPMN 并部署，回写版本） */
export function deployProcessDef(id: number) {
  return request.post<ApiResult<DeployResult>>(`/process-defs/${id}/deploy`).then((r) => r.data.data!)
}

/** 停用 ↔ 启用切换 */
export function toggleProcessDef(id: number) {
  return request.post<ApiResult<ProcessDef>>(`/process-defs/${id}/disable`).then((r) => r.data.data!)
}

/** 历史版本 */
export function listProcessDefVersions(id: number) {
  return request.get<ApiResult<ProcessDefVersionVO[]>>(`/process-defs/${id}/versions`).then((r) => r.data.data!)
}
