import request from './request'
import type { ApiResult } from '@/types/auth'
import type { PermissionFormData, PermissionVO, PermissionPageVO } from '@/types/permission'

// 权限管理接口（后端 /system/permission/**）。

/** 全量权限树（分配弹窗用，全量不过滤 status） */
export function listPermissions() {
  return request.get<ApiResult<PermissionVO[]>>('/system/permission/list').then((r) => r.data.data!)
}

/** 分页权限列表（permName/permCode 模糊、status 精确；默认每页 10 条） */
export function listPermissionPage(
  pageNum = 1,
  pageSize = 10,
  params: { permName?: string; permCode?: string; status?: string } = {},
) {
  return request
    .get<ApiResult<PermissionPageVO>>('/system/permission/page', { params: { pageNum, pageSize, ...params } })
    .then((r) => r.data.data!)
}

export function createPermission(data: PermissionFormData) {
  // 同 api/org.ts：请求体直接传 form（后端 DTO 无 id 字段，Jackson 忽略未知属性）
  return request.post<ApiResult<number>>('/system/permission', data).then((r) => r.data.data!)
}

export function updatePermission(id: number, data: PermissionFormData) {
  return request.put<ApiResult<null>>(`/system/permission/${id}`, data).then((r) => r.data)
}

export function deletePermission(id: number) {
  return request.delete<ApiResult<null>>(`/system/permission/${id}`).then((r) => r.data)
}
