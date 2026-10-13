<script setup lang="ts">
// 全局中文语言包：deep-import 场景没有默认 locale 提供者，组件内置文案
// （el-pagination 的「共 X 条 / 条/页 / 跳至」等）会回退英文，
// 这里经 ElConfigProvider 注入 zh-cn 统一为中文。
// 深路径引入，避免 es/locale/index.mjs 把全部 60+ 语言包拖进首包。
import zhCn from 'element-plus/es/locale/lang/zh-cn.mjs'
import DesignAuditEntry from '@/components/DesignAuditEntry.vue'
</script>

<template>
  <el-config-provider :locale="zhCn">
    <router-view />
    <!-- 临时设计审计入口：对外公开监督，正式上线后移除 -->
    <DesignAuditEntry />
  </el-config-provider>
</template>
