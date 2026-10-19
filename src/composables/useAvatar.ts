import { ref, watch, type Ref } from 'vue'
import { previewFileUrl, fetchFileBlob } from '@/api/file'

/**
 * 头像 URL 解析 composable。
 *
 * 后端存的是 sys_file_storage.id（字符串），前端需要可渲染的图片地址：
 * - OSS 模式：previewFileUrl 返回绝对签名 URL，免鉴权直连，直接用作 <img src>；
 * - 本地存储模式：previewFileUrl 返回相对路径 /files/{id}/raw，但 <img> 不带 JWT 头会被 401，
 *   必须走 fetchFileBlob（手动带 token 取字节）转 object URL。
 *
 * 用法：const src = useAvatar(computed(() => userStore.userInfo?.avatarUrl))
 *      模板：<img v-if="src" :src="src" /> <span v-else>{{ initial }}</span>
 */
export function useAvatar(idRef: Ref<string | number | null | undefined>) {
  const src = ref<string | null>(null)
  let lastBlob: string | null = null

  watch(
    idRef,
    async (id) => {
      // 释放上一次的 blob URL，避免内存泄漏
      if (lastBlob && lastBlob.startsWith('blob:')) {
        URL.revokeObjectURL(lastBlob)
        lastBlob = null
      }
      if (!id) {
        src.value = null
        return
      }
      try {
        const url = await previewFileUrl(Number(id))
        if (!url) {
          src.value = null
          return
        }
        if (/^https?:\/\//i.test(url)) {
          // OSS 签名 URL：免鉴权，直连
          src.value = url
          return
        }
        // 本地存储：带 token 取字节转 blob
        const blob = await fetchFileBlob(url)
        const obj = URL.createObjectURL(blob)
        lastBlob = obj
        src.value = obj
      } catch {
        src.value = null
      }
    },
    { immediate: true }
  )

  return src
}
