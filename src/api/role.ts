import request from './request'
import type { ApiResult } from '@/types/auth'
import type { RolePageVO, RoleFormData, RolePermFormData, RoleMenuFormData } from '@/types/role'

// 角色管理接口（后端 /system/role/**）。
// 角色基本信息 CRUD + 独立的权限分配（/{id}/perms，整体替换语义）
// + 独立的菜单分配（/{id}/menus，整体替换语义）。

/** 分页角色列表（roleName 模糊、status 精确；默认每页 10 条） */
export function listRoles(
  pageNum = 1,
  pageSize = 10,
  params: { roleName?: string; status?: string } = {},
) {
  return request
    .get<ApiResult<RolePageVO>>('/system/role/page', { params: { pageNum, pageSize, ...params } })
    .then((r) => r.data.data!)
}

export function createRole(data: RoleFormData) {
  // 同 api/org.ts：请求体直接传 form（后端 DTO 无 id 字段，Jackson 忽略未知属性）
  return request.post<ApiResult<number>>('/system/role', data).then((r) => r.data.data!)
}

export function updateRole(id: number, data: RoleFormData) {
  return request.put<ApiResult<null>>(`/system/role/${id}`, data).then((r) => r.data)
}

export function deleteRole(id: number) {
  return request.delete<ApiResult<null>>(`/system/role/${id}`).then((r) => r.data)
}

/** 角色已授权的权限 ID 集合（分配弹窗回显勾选） */
export function listRolePermIds(id: number) {
  return request.get<ApiResult<number[]>>(`/system/role/${id}/perms`).then((r) => r.data.data!)
}

/** 分配权限（整体替换语义，permIds 空数组 = 清空） */
export function assignRolePerms(id: number, data: RolePermFormData) {
  return request.put<ApiResult<null>>(`/system/role/${id}/perms`, data).then((r) => r.data)
}

/** 角色已授权的菜单 ID 集合（分配弹窗回显勾选） */
export function listRoleMenuIds(id: number) {
  return request.get<ApiResult<number[]>>(`/system/role/${id}/menus`).then((r) => r.data.data!)
}

/** 分配菜单（整体替换语义，menuIds 空数组 = 清空） */
export function assignRoleMenus(id: number, data: RoleMenuFormData) {
  return request.put<ApiResult<null>>(`/system/role/${id}/menus`, data).then((r) => r.data)
}
