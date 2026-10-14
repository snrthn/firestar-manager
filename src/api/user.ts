import request from './request'
import type { ApiResult } from '@/types/auth'
import type { UserPageVO, UserOptionVO, UserFormData } from '@/types/user'

// 用户管理接口（后端 /system/user/**）。
// /options 是给组织架构等模块用的只读下拉（全量、轻量）；其余为管理端 CRUD（分页）。

/** 启用用户下拉选项（供组织架构负责人选择等场景） */
export function listUserOptions() {
  return request.get<ApiResult<UserOptionVO[]>>('/system/user/options').then((r) => r.data.data!)
}

/** 分页用户列表（username/nickname 模糊，status/deptId 精确；默认每页 10 条） */
export function listUsers(
  pageNum = 1,
  pageSize = 10,
  params: { username?: string; nickname?: string; status?: string; deptId?: number | null } = {},
) {
  return request
    .get<ApiResult<UserPageVO>>('/system/user/page', { params: { pageNum, pageSize, ...params } })
    .then((r) => r.data.data!)
}

export function createUser(data: UserFormData) {
  // 同 api/org.ts：请求体直接传 form（后端 DTO 无 id 字段，Jackson 忽略未知属性；
  // 页面层 handleSubmit 里解构剥 id 用于新增/修改分支）
  return request.post<ApiResult<number>>('/system/user', data).then((r) => r.data.data!)
}

export function updateUser(id: number, data: UserFormData) {
  return request.put<ApiResult<null>>(`/system/user/${id}`, data).then((r) => r.data)
}

export function deleteUser(id: number) {
  return request.delete<ApiResult<null>>(`/system/user/${id}`).then((r) => r.data)
}
