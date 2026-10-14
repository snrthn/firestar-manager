import request from './request'
import type { ApiResult } from '@/types/auth'
import type { PostPageVO, PostFormData, PostOptionVO } from '@/types/post'

// 岗位管理接口（后端 /system/post/**）。

/** 分页岗位列表（postName/postCode 模糊、status 精确；默认每页 10 条） */
export function listPosts(
  pageNum = 1,
  pageSize = 10,
  params: { postName?: string; postCode?: string; status?: string } = {},
) {
  return request
    .get<ApiResult<PostPageVO>>('/system/post/page', { params: { pageNum, pageSize, ...params } })
    .then((r) => r.data.data!)
}

/** 岗位下拉选项（用户表单岗位选择等场景；全量、轻量） */
export function listPostOptions() {
  return request.get<ApiResult<PostOptionVO[]>>('/system/post/options').then((r) => r.data.data!)
}

export function createPost(data: PostFormData) {
  // 同 api/org.ts：请求体直接传 form（后端 DTO 无 id 字段，Jackson 忽略未知属性）
  return request.post<ApiResult<number>>('/system/post', data).then((r) => r.data.data!)
}

export function updatePost(id: number, data: PostFormData) {
  return request.put<ApiResult<null>>(`/system/post/${id}`, data).then((r) => r.data)
}

export function deletePost(id: number) {
  return request.delete<ApiResult<null>>(`/system/post/${id}`).then((r) => r.data)
}
