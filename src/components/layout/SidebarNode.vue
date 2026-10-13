<script setup lang="ts">
import { computed } from 'vue'
import { Folder, Document } from '@element-plus/icons-vue'
import type { MenuVO } from '@/types/auth'

/**
 * 菜单递归节点 —— 直接套 Element Plus 成熟组件：
 *   - 有子节点 → el-sub-menu（仅展开/收起，不跳转）
 *   - 叶子     → el-menu-item（index = routePath，el-menu 开 router 模式时自动跳转）
 * 激活态高亮、折叠态、层级缩进、hover 全部由 el-menu 接管，不手写任何交互/样式。
 * MenuVO 暂无 icon 字段，这里给目录/叶子各补一个默认图标（Folder / Document），
 * 让折叠态有图标轨道、popper 悬浮提示菜单名，符合社区成熟交互。
 */
const props = defineProps<{ node: MenuVO }>()

const hasKids = computed(() => !!props.node.children?.length)
</script>

<template>
  <el-sub-menu v-if="hasKids" :index="String(node.id)">
    <template #title>
      <el-icon><Folder /></el-icon>
      <span>{{ node.menuName }}</span>
    </template>
    <SidebarNode
      v-for="child in node.children"
      :key="child.id"
      :node="child"
    />
  </el-sub-menu>

  <el-menu-item v-else :index="node.routePath">
    <el-icon><Document /></el-icon>
    <span>{{ node.menuName }}</span>
  </el-menu-item>
</template>
