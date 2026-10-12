<script setup lang="ts">
import DesignAuditEntry from '@/components/DesignAuditEntry.vue'
</script>

<template>
  <router-view />
  <!-- 临时设计审计入口：对外公开监督，正式上线后移除 -->
  <DesignAuditEntry />
</template>
