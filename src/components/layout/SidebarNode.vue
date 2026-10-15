<script setup lang="ts">
import { computed } from 'vue'
import { Folder, Document } from '@element-plus/icons-vue'
import type { MenuVO } from '@/types/auth'
import { resolveMenuIcon } from '@/utils/elementIcons'

/**
 * 菜单递归节点 —— 直接套 Element Plus 成熟组件：
 *   - 有子节点 → el-sub-menu（仅展开/收起，不跳转）
 *   - LINK 外链 → <a target=_blank>（不进 vue-router：EP 的 menu-item 点击会先同步
 *     router.push(index)，@click 里拦不住——menu.mjs handleMenuItemClick 实锤。
 *     外链本就不该占 SPA 路由，动态路由集也不含它，这里直接渲染原生锚点最干净）
 *   - 其它叶子 → el-menu-item（index = routePath，el-menu 开 router 模式时自动跳转）
 * 激活态高亮、折叠态、层级缩进、hover 全部由 el-menu 接管，不手写任何交互/样式。
 * 图标：优先用菜单自己的 icon（Element Plus 组件名，resolveMenuIcon 解析），
 * 未配置时兜底 Folder（目录）/ Document（叶子），与一线 admin 系统约定一致。
 */
const props = defineProps<{ node: MenuVO }>()

const hasKids = computed(() => !!props.node.children?.length)

// 当前节点图标组件：有 icon 用 icon，否则按目录/叶子兜底
const iconComp = computed(() => {
  const custom = resolveMenuIcon(props.node.icon)
  if (custom) return custom
  return hasKids.value ? Folder : Document
})
</script>

<template>
  <el-sub-menu v-if="hasKids" :index="String(node.id)">
    <template #title>
      <el-icon><component :is="iconComp" /></el-icon>
      <span>{{ node.menuName }}</span>
    </template>
    <SidebarNode
      v-for="child in node.children"
      :key="child.id"
      :node="child"
    />
  </el-sub-menu>

  <!-- 外链：样式复用 el-menu-item 同款 EP 变量（高度/内距/字体/hover），视觉零违和 -->
  <a
    v-else-if="node.menuType === 'LINK'"
    class="ext-link"
    :href="node.linkUrl"
    target="_blank"
    rel="noopener noreferrer"
  >
    <el-icon><component :is="iconComp" /></el-icon>
    <span>{{ node.menuName }}</span>
  </a>

  <el-menu-item v-else :index="node.routePath">
    <el-icon><component :is="iconComp" /></el-icon>
    <span>{{ node.menuName }}</span>
  </el-menu-item>
</template>

<style scoped>
/* 与 el-menu-item 视觉对齐：变量全部取 EP 官方 token，主题切换自动跟随 */
.ext-link {
  display: flex;
  align-items: center;
  gap: 8px;
  height: var(--el-menu-item-height, 48px);
  padding: 0 var(--el-menu-level-padding, 20px);
  font-size: var(--el-font-size-base, 14px);
  color: var(--el-menu-text-color, #303133);
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
  list-style: none;
}
.ext-link:hover {
  background-color: var(--el-menu-hover-bg-color, #ecf5ff);
  color: var(--el-menu-active-color, #409eff);
}
.ext-link .el-icon {
  flex-shrink: 0;
}
</style>
