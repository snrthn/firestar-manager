import request from './request'
import type { ApiResult } from '@/types/auth'
import type { OrgVO, OrgFormData } from '@/types/org'

// 组织架构管理接口（后端 /system/org/**，全量树不过滤 status）。
// 用户管理页的部门下拉将复用 listOrgs 拍平结果，本文件同时是那一侧的依赖源头。

/** 全量部门树（管理页展示用；leaderName 已由后端回填） */
export function listOrgs() {
  return request.get<ApiResult<OrgVO[]>>('/system/org/list').then((r) => r.data.data!)
}

export function createOrg(data: OrgFormData) {
  return request.post<ApiResult<number>>('/system/org', data).then((r) => r.data.data!)
}

export function updateOrg(id: number, data: OrgFormData) {
  return request.put<ApiResult<null>>(`/system/org/${id}`, data).then((r) => r.data)
}

export function deleteOrg(id: number) {
  return request.delete<ApiResult<null>>(`/system/org/${id}`).then((r) => r.data)
}
