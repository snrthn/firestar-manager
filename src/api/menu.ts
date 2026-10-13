import request from './request'
import type { ApiResult, MenuVO, MenuFormData } from '@/types/auth'

// 菜单管理接口（后端 /system/menu，全量树不过滤 visible/status，
// 与 auth.ts 的 getMenus（按角色过滤供侧栏渲染）是两套语义）

export function listMenus() {
  return request.get<ApiResult<MenuVO[]>>('/system/menu/list').then((r) => r.data.data!)
}

export function createMenu(data: MenuFormData) {
  return request.post<ApiResult<number>>('/system/menu', data).then((r) => r.data.data!)
}

export function updateMenu(id: number, data: MenuFormData) {
  return request.put<ApiResult<null>>(`/system/menu/${id}`, data).then((r) => r.data)
}

export function deleteMenu(id: number) {
  return request.delete<ApiResult<null>>(`/system/menu/${id}`).then((r) => r.data)
}

// direction: 'up' 上移 / 'down' 下移（与相邻兄弟交换 sort_no）
export function moveMenu(id: number, direction: 'up' | 'down') {
  return request.put<ApiResult<null>>(`/system/menu/${id}/move`, null, {
    params: { direction },
  }).then((r) => r.data)
}
