<script setup lang="ts">
import { computed } from 'vue'
import { Folder, Document } from '@element-plus/icons-vue'
import type { MenuVO } from '@/types/auth'
import { resolveMenuIcon } from '@/utils/elementIcons'

/**
 * 菜单递归节点 —— 直接套 Element Plus 成熟组件：
 *   - 有子节点 → el-sub-menu（仅展开/收起，不跳转）
 *   - 叶子     → el-menu-item（index = routePath，el-menu 开 router 模式时自动跳转）
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

  <el-menu-item v-else :index="node.routePath">
    <el-icon><component :is="iconComp" /></el-icon>
    <span>{{ node.menuName }}</span>
  </el-menu-item>
</template>
