<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

/**
 * 403 无权限页：路由表 = 授权集投影（RuoYi / Ant Design Pro 模式），
 * 未授权或不存在的路径落此页。挂在 AdminLayout 壳内渲染，header 的
 * 用户下拉（退出登录）始终可用。
 */
const router = useRouter()
const userStore = useUserStore()

async function relogin() {
  // 走完整 logout：先通知服务端作废会话（含 current_jti 清理），再清本地
  await userStore.logout()
  router.push('/login')
}
</script>

<template>
  <div class="page-forbidden">
    <el-result
      icon="warning"
      title="403"
      sub-title="你没有访问该页面的权限。可返回工作台，或联系管理员为你的角色分配对应菜单权限。"
    >
      <template #extra>
        <el-button type="primary" @click="router.push('/dashboard')">返回工作台</el-button>
        <el-button @click="relogin">重新登录</el-button>
      </template>
    </el-result>
  </div>
</template>

<style scoped>
.page-forbidden {
  padding: 48px 0;
}
</style>
