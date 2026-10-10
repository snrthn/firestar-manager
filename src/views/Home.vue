<script setup lang="ts">
import { computed, ref } from 'vue'
import { Connection, HomeFilled } from '@element-plus/icons-vue'
import request from '../utils/request'

const loading = ref<boolean>(false)
const cost = ref<number>(0)
const healthError = ref<string>('')
const checked = ref<boolean>(false)
const report = ref<Record<string, any> | null>(null)

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

/**
 * 调 /system/db-check 做检测 —— 不再用 /ping。
 *
 * 区别很重要：/ping 只回 {"app":"...","status":"UP"}，能证明"端口通着"，
 * 但连的是哪个库、表建了几张、Flyway 跑到第几版一概看不出来。
 * /system/db-check 会遍历 information_schema 把这些全查一遍，
 * 出问题时能直接看出「连错库了」还是「表没建全」，而不是只告诉你"不通"。
 */
const ping = async () => {
  loading.value = true
  healthError.value = ''
  report.value = null
  const start = Date.now()
  try {
    const res: any = await request.get('/system/db-check')
    cost.value = Date.now() - start
    report.value = res
  } catch (e: any) {
    cost.value = Date.now() - start
    // 后端在 unhealthy 时返回 503，axios 会走这里。
    // 但 503 的 body 里带着具体的 errors 列表 —— 那才是排查的关键信息，
    // 不能只丢一句"连接失败"就把线索扔了。
    const errs = e?.response?.data?.errors
    healthError.value = Array.isArray(errs) && errs.length
      ? errs.join('；')
      : (e as Error).message || '无法连接后端，请确认服务已启动且代理配置正确'
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
            <el-descriptions-item label="接口">GET /api/system/db-check</el-descriptions-item>
            <template v-if="report">
              <el-descriptions-item label="数据库">
                {{ report.connection?.productName }} {{ report.connection?.productVersion }}
                （库 {{ report.connection?.catalog }}）
              </el-descriptions-item>
              <el-descriptions-item label="表">
                业务表 {{ report.tables?.businessTableCount }} / 预期 {{ report.tables?.expected }}
                · 引擎表 {{ report.tables?.engineTableCount }}
              </el-descriptions-item>
              <el-descriptions-item label="Flyway">
                已应用 {{ report.flyway?.appliedCount }} 个版本，当前 v{{ report.flyway?.currentVersion }}
              </el-descriptions-item>
              <el-descriptions-item label="错误">
                <span :class="report.errors?.length ? 'err-text' : 'ok-text'">
                  {{ report.errors?.length ? report.errors.join('；') : '无' }}
                </span>
              </el-descriptions-item>
            </template>
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
/* ---- 表格占满整行 ----
   【根因：不是 table-layout，是 el-alert 的 flex 收缩】
   Element Plus 编译后的原始规则是：
     .el-alert        { display:flex; width:100% }
     .el-alert__content { display:flex; flex-direction:column; gap:4px }
   注意 .el-alert__content 没有 flex:1 —— 它作为 .el-alert 的 flex 子项
   默认 flex:0 1 auto，宽度按内容收缩，descriptions 的 width:100% 只是
   铺满这个被压窄的容器（实测仅 277px，右侧空 250px）。
   所以关键修正是让 content 吃掉 alert 的剩余空间：
     flex:1 1 auto  → 拉伸填满
     min-width:0    → 允许长 URL / 错误列表收缩并换行，防止溢出
   下面 width/table-layout/label 宽度是配套，保证列宽稳定不随文案长短跳动。 */
.health-result :deep(.el-alert__content) {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
}
.health-result :deep(.el-alert__description) {
  width: 100%;
  min-width: 0;
}
.health-desc {
  margin-top: 10px;
  width: 100%;
}
.health-desc :deep(.el-descriptions__body),
.health-desc :deep(.el-descriptions__table) {
  width: 100%;
  /* fixed 布局让「值」列吃掉 label 之外的全部剩余宽度，
     不再由内容长度决定 —— 否则长短不一的文案会让列宽忽宽忽窄 */
  table-layout: fixed;
}
/* label 列固定 120px：够放「Flyway / 数据库 / 耗时」等最长标签，
   又不至于像默认那样把值列压得太窄 */
.health-desc :deep(.el-descriptions__label) {
  width: 120px;
  color: #606266;
}
/* 值列里的长文本（URL、错误列表）要能换行，不能撑破表格 */
.health-desc :deep(.el-descriptions__content) {
  width: auto;
  word-break: break-word;
}
.ok-text {
  color: #67c23a;
}
.err-text {
  color: #f56c6c;
}
</style>
