<script setup lang="ts">
import { computed, ref } from 'vue'
import { Connection, HomeFilled } from '@element-plus/icons-vue'
import request from '../utils/request'

const loading = ref<boolean>(false)
const pong = ref<string>('')
const cost = ref<number>(0)
const healthError = ref<string>('')
const checked = ref<boolean>(false)

const project = {
  name: '火星财务管理系统',
  description: '面向财务业务的一体化管理平台，覆盖流程审批、账务处理与数据报表。',
  version: 'v0.0.1'
}

const techStack = [
  'Spring Boot 3.3',
  'Java 17',
  'MyBatis-Plus',
  'Flowable 7',
  'Vue 3',
  'TypeScript',
  'Element Plus'
]

const statusType = computed(() => {
  if (!checked.value) return 'info'
  return healthError.value ? 'error' : 'success'
})

const statusText = computed(() => {
  if (!checked.value) return '未检测'
  return healthError.value ? '连接失败' : '运行正常'
})

const ping = async () => {
  loading.value = true
  healthError.value = ''
  pong.value = ''
  const start = Date.now()
  try {
    const res = await request.get('/ping')
    cost.value = Date.now() - start
    pong.value = typeof res === 'string' ? res : JSON.stringify(res)
  } catch (e) {
    cost.value = Date.now() - start
    healthError.value = (e as Error).message || '无法连接后端，请确认服务已启动且代理配置正确'
  } finally {
    checked.value = true
    loading.value = false
  }
}
</script>

<template>
  <div class="home">
    <!-- 欢迎横幅 -->
    <div class="welcome-banner">
      <div class="banner-info">
        <div class="banner-title">
          <h2>{{ project.name }}</h2>
          <el-tag effect="dark" round size="small">{{ project.version }}</el-tag>
        </div>
        <p class="banner-desc">{{ project.description }}</p>
        <div class="banner-tags">
          <el-tag
            v-for="t in techStack"
            :key="t"
            effect="plain"
            size="small"
            class="tech-tag"
          >
            {{ t }}
          </el-tag>
        </div>
      </div>
      <el-icon class="banner-icon" :size="72"><HomeFilled /></el-icon>
    </div>

    <!-- 系统状态卡片 -->
    <el-card shadow="hover" class="status-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">系统状态</span>
          <el-tag :type="statusType" effect="light" size="small">{{ statusText }}</el-tag>
        </div>
      </template>

      <div class="status-body">
        <p class="status-tip">
          点击下方按钮对后端服务进行连通性检测，检测结果将展示在此处。
        </p>
        <el-button
          type="primary"
          :icon="Connection"
          :loading="loading"
          @click="ping"
        >
          {{ loading ? '检测中...' : '检测后端连接' }}
        </el-button>

        <!-- 检测成功 -->
        <el-alert
          v-if="checked && !healthError"
          type="success"
          :closable="false"
          show-icon
          class="health-result"
        >
          <template #title>
            后端连接正常（耗时 {{ cost }} ms）
          </template>
          <el-descriptions :column="1" border size="small" class="health-desc">
            <el-descriptions-item label="接口">GET /api/ping</el-descriptions-item>
            <el-descriptions-item label="响应">
              <code class="resp-code">{{ pong }}</code>
            </el-descriptions-item>
            <el-descriptions-item label="耗时">{{ cost }} ms</el-descriptions-item>
          </el-descriptions>
        </el-alert>

        <!-- 检测失败 -->
        <el-alert
          v-if="checked && healthError"
          type="error"
          :closable="false"
          show-icon
          :title="`后端连接失败（耗时 ${cost} ms）`"
          :description="healthError"
          class="health-result"
        />
      </div>
    </el-card>
  </div>
</template>

<style scoped>
/* 欢迎横幅 */
.welcome-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28px 32px;
  background: linear-gradient(135deg, #001529 0%, #003a70 60%, #1677ff 130%);
  color: #fff;
  overflow: hidden;
  border-radius: 0;
}
.banner-title {
  display: flex;
  align-items: center;
  gap: 12px;
}
.banner-title h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 1px;
}
.banner-desc {
  margin: 10px 0 14px;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.75);
}
.banner-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.tech-tag {
  border-color: rgba(255, 255, 255, 0.35);
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.08);
}
.banner-icon {
  color: rgba(255, 255, 255, 0.15);
  flex-shrink: 0;
  margin-left: 24px;
}

/* 状态卡片 */
.status-card {
  margin: 24px;
  border-radius: 8px;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}
.status-tip {
  margin: 0 0 16px;
  font-size: 13px;
  color: #909399;
}
.health-result {
  margin-top: 20px;
}
.health-desc {
  margin-top: 10px;
}
.resp-code {
  padding: 2px 6px;
  border-radius: 4px;
  background: #f5f7fa;
  font-size: 12px;
  color: #476582;
}
</style>
