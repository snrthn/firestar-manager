<script setup lang="ts">
import { useRouter } from 'vue-router'

// 业务模块占位页：导航先占位、路由可直达，页面内容按模块规划陆续补齐。
// 统一走这个组件，避免每个模块各写一套"建设中"导致风格漂移。
defineProps<{
  /** 菜单名称（来自 sys_menu.menu_name） */
  title: string
  /** 路由路径（来自 sys_menu.route_path） */
  path?: string
  /** 权限编码（来自 sys_menu.perm_code） */
  perm?: string
  /** 覆盖默认的副标题文案 */
  desc?: string
}>()

const router = useRouter()
</script>

<template>
  <div class="page-placeholder">
    <el-result
      icon="info"
      :title="`${title} · 页面建设中`"
      :sub-title="desc || '该模块已纳入系统规划，先在导航中占位，功能将按迭代节奏补齐。'"
    >
      <template #extra>
        <div class="meta">
          <el-tag v-if="path" size="small" type="info">路由 {{ path }}</el-tag>
          <el-tag v-if="perm" size="small" type="warning">权限 {{ perm }}</el-tag>
        </div>
        <el-button type="primary" @click="router.push('/dashboard')">返回工作台</el-button>
      </template>
    </el-result>
  </div>
</template>

<style scoped>
.page-placeholder {
  padding: 48px 0;
}
.meta {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-bottom: 16px;
}
</style>
