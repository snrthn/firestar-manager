import request from './request'

// 个人中心补充接口（后端 /system/profile/**；免 file:manage，登录即可访问）。

/**
 * 上传并绑定头像（multipart/form-data）。
 * 后端内部复用 FileService 落库拿 sys_file_storage.id，再写 sys_user.avatar_url。
 * 返回最新头像文件ID（字符串），调用方据此刷新 userInfo。
 */
export function updateAvatar(form: FormData) {
  return request
    .post<{ code: number; message: string; data: { avatarUrl: string | null; nickname: string | null } }>(
      '/system/profile/avatar',
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
    .then((r) => r.data.data)
}
