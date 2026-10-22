import request from './request'
import type { ApiResult } from '@/types/auth'
import type { ProjectPageVO, ProjectFormData, ProjectSignFormData, ProjectVO, TimelineNodeVO } from '@/types/project'

// 立项管理接口（后端 /project/**）

/** 分页立项列表（projectName 模糊、approvalStatus 精确；默认每页 10 条） */
export function projectPage(
  pageNum = 1,
  pageSize = 10,
  params: { projectName?: string; approvalStatus?: string } = {},
) {
  return request
    .get<ApiResult<ProjectPageVO>>('/project/page', { params: { pageNum, pageSize, ...params } })
    .then((r) => r.data.data!)
}

/** 新建立项草稿 */
export function createProject(data: ProjectFormData) {
  return request.post<ApiResult<number>>('/project', data).then((r) => r.data.data!)
}

/** 提交审批：DRAFT / REJECTED → 发起流程 → APPROVING */
export function submitProject(id: number) {
  return request.post<ApiResult<null>>(`/project/${id}/submit`).then((r) => r.data)
}

/** 立项详情（编辑回填用，含字典翻译） */
export function projectDetail(id: number) {
  return request
    .get<ApiResult<ProjectVO>>(`/project/${id}`)
    .then((r) => r.data.data!)
}

/** 编辑草稿（仅 DRAFT / REJECTED 态可改，后端校验） */
export function updateProject(id: number, data: ProjectFormData) {
  return request.put<ApiResult<null>>(`/project/${id}`, data).then((r) => r.data)
}

/** 审批进度：某立项单据的完整审批时间线（ACT_HI_TASKINST 单源，无流程实例时返回空数组） */
export function projectTimeline(id: number) {
  return request
    .get<ApiResult<TimelineNodeVO[]>>(`/project/${id}/timeline`)
    .then((r) => r.data.data!)
}

/** 签约：审批通过后的独立动作（可修正最终合同金额 + 补录签约描述；终态不可撤销） */
export function signProject(id: number, data: ProjectSignFormData) {
  return request.post<ApiResult<null>>(`/project/${id}/sign`, data).then((r) => r.data)
}
