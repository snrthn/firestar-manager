<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Connection,
  HomeFilled,
  Tickets,
  Bell,
  DataLine,
  Files,
  Van,
  Document,
  Money,
  RefreshLeft,
  Share,
  Refresh,
} from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { useNotifyStore } from '@/stores/notify'
import { flattenMenus } from '@/utils/menuRoute'
import request from '@/api/request'
import { statsOverview, statsPlatform } from '@/api/stats'
import { myTasksPage } from '@/api/approval'
import { getFlags } from '@/api/config'
import type { OverviewVO, PlatformStatsVO } from '@/types/stats'

const router = useRouter()
const userStore = useUserStore()
const notifyStore = useNotifyStore()

/* ---------- 原有：系统连通性检测（保留） ---------- */
const loading = ref<boolean>(false)
const cost = ref<number>(0)
const healthError = ref<string>('')
const checked = ref<boolean>(false)
const report = ref<Record<string, any> | null>(null)

const nickname = computed(
  () => userStore.userInfo?.nickname || userStore.userInfo?.username || '管理员'
)

const project = {
  name: '火星财务管理系统',
  description: '面向财务业务的一体化管理平台，覆盖流程审批、账务处理与数据报表。',
  version: 'v0.0.1',
}

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
  report.value = null
  const start = Date.now()
  try {
    const res: any = await request.get('/system/db-check')
    cost.value = Date.now() - start
    report.value = res.data
  } catch (e: any) {
    cost.value = Date.now() - start
    const errs = e?.response?.data?.errors
    healthError.value =
      Array.isArray(errs) && errs.length
        ? errs.join('；')
        : (e as Error).message || '无法连接后端，请确认服务已启动且代理配置正确'
  } finally {
    checked.value = true
    loading.value = false
  }
}

/* ---------- 新增：待办概览（角标） ---------- */
// 未读通知：直接读 notifyStore.unreadCount，SSE(NOTIFY) 已实时推送刷新
const unreadCount = computed(() => notifyStore.unreadCount)
const todoCount = ref(0)
async function loadTodo() {
  try {
    const page = await myTasksPage(1, 1)
    todoCount.value = page?.total ?? 0
  } catch {
    /* 网络失败不打断工作台渲染 */
  }
}

/* ---------- 新增：KPI 概览（按角色分化） ---------- */
const overviewLoading = ref(false)
const overview = ref<OverviewVO | null>(null)

const platform = ref<PlatformStatsVO | null>(null)
async function loadPlatform() {
  try {
    platform.value = await statsPlatform()
  } catch {
    /* 网络失败不打断工作台渲染 */
  }
}

/* ---------- 特性开关（控制调试类模块显隐） ---------- */
// 登录即可访问 /system/config/flags；默认不含键或值为 "false" → 隐藏。
const flags = ref<Record<string, string>>({})
async function loadFlags() {
  try {
    flags.value = await getFlags()
  } catch {
    /* 网络失败不打断渲染，缺省隐藏 */
  }
}
// 工作台【系统状态】卡片：默认隐藏，仅当 dashboard_status_visible='true' 展示（调试用）
const showStatusCard = computed(() => flags.value['dashboard_status_visible'] === 'true')

const kpiDefs: {
  key: keyof OverviewVO
  label: string
  suffix?: string
  roles: string[]
}[] = [
  { key: 'arBalance', label: '应收余额', roles: ['ROLE_FINANCE', 'ROLE_ADMIN', 'ROLE_SUPERVISOR'] },
  { key: 'uninvoicedBalance', label: '待开票余额', roles: ['ROLE_FINANCE', 'ROLE_ADMIN', 'ROLE_INVOICER', 'ROLE_SUPERVISOR'] },
  { key: 'overdueAmount', label: '逾期金额', roles: ['ROLE_FINANCE', 'ROLE_ADMIN', 'ROLE_SUPERVISOR'] },
  { key: 'receiptAmount', label: '本期回款', roles: ['ROLE_FINANCE', 'ROLE_ADMIN', 'ROLE_CASHIER', 'ROLE_SUPERVISOR'] },
  { key: 'invoiceAmount', label: '本期开票额', roles: ['ROLE_FINANCE', 'ROLE_ADMIN', 'ROLE_INVOICER', 'ROLE_SUPERVISOR'] },
  { key: 'taxAmount', label: '本期税额', roles: ['ROLE_FINANCE', 'ROLE_ADMIN', 'ROLE_INVOICER'] },
  { key: 'diffPool', label: '收款差异池', roles: ['ROLE_FINANCE', 'ROLE_ADMIN', 'ROLE_SUPERVISOR'] },
  { key: 'contractAmount', label: '合同签约额', roles: ['ROLE_SALES', 'ROLE_ADMIN', 'ROLE_SALES_MANAGER', 'ROLE_FINANCE'] },
  { key: 'shipmentAmount', label: '本期发货额', roles: ['ROLE_SALES', 'ROLE_ADMIN', 'ROLE_SALES_MANAGER'] },
  { key: 'projectCount', label: '项目总数', suffix: '个', roles: ['ROLE_SALES', 'ROLE_ADMIN', 'ROLE_SALES_MANAGER'] },
  { key: 'customerCount', label: '客户总数', suffix: '家', roles: ['ROLE_SALES', 'ROLE_ADMIN', 'ROLE_SALES_MANAGER'] },
  { key: 'goodsCount', label: '货物总数', suffix: '种', roles: ['ROLE_ADMIN', 'ROLE_SALES'] },
]

const visibleKpis = computed(() => {
  const my = userStore.roles || []
  if (my.includes('ROLE_ADMIN')) return kpiDefs
  return kpiDefs.filter((k) => k.roles.some((r) => my.includes(r)))
})

function fmtMoney(v: any): string {
  const n = Number(v ?? 0)
  if (!isFinite(n)) return '0'
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(2) + ' 万'
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

async function loadOverview() {
  overviewLoading.value = true
  try {
    overview.value = await statsOverview({})
  } catch {
    /* 网络失败不打断工作台渲染 */
  } finally {
    overviewLoading.value = false
  }
}

/* ---------- 新增：快捷功能入口 ---------- */
const quickEntries = [
  { title: '待我审批', icon: 'Tickets', path: '/approval', primary: true },
  { title: '未读通知', icon: 'Bell', path: '/system/notify-record' },
  { title: '数据看板', icon: 'DataLine', path: '/dashboard/data' },
  { title: '立项管理', icon: 'Files', path: '/project' },
  { title: '发货管理', icon: 'Van', path: '/shipment' },
  { title: '发票管理', icon: 'Document', path: '/invoice' },
  { title: '回款管理', icon: 'Money', path: '/receipt' },
  { title: '退货管理', icon: 'RefreshLeft', path: '/return' },
  { title: '核销管理', icon: 'Share', path: '/writeoff' },
  { title: '流程定义', icon: 'Connection', path: '/process/def' },
]
const iconComp: Record<string, any> = {
  Tickets,
  Bell,
  DataLine,
  Files,
  Van,
  Document,
  Money,
  RefreshLeft,
  Share,
  Connection,
}
function go(path: string) {
  router.push(path)
}

/* ---------- 快捷入口按授权菜单过滤 ----------
 * 与侧边栏/动态路由同一口径：userStore.menus 是后端 /auth/menus 返回的
 * 「授权 ∧ 启用」菜单集，其 routePath 即用户可访问的页面。入口的 path 与
 * 菜单 routePath 一一对应，命中才渲染；没权限的入口直接不显示，避免点了才 403。
 * menus 就绪前（理论上 dashboard 挂载时守卫已 fetch，此处仅防御）暂显示全部，
 * 不误隐藏。 */
const authorizedPaths = computed<Set<string> | null>(() => {
  const menus = userStore.menus
  if (!menus || menus.length === 0) return null
  const set = new Set<string>()
  for (const m of flattenMenus(menus)) {
    if (m.routePath) set.add(m.routePath)
  }
  return set
})

const visibleQuickEntries = computed(() => {
  const paths = authorizedPaths.value
  if (!paths) return quickEntries
  return quickEntries.filter((e) => paths.has(e.path))
})

/* ---------- 欢迎横幅指标条：可点击项按授权菜单过滤（防 403） ----------
 * 待办审批(/approval)、未读通知(/system/notify-record) 是带跳转的可点击项，
 * 与快捷入口同一口径：无对应菜单权限则不渲染，避免点了落 403。
 * 用户数/今日登录/历史访问为只读展示（后端已按 dashboard:view 鉴权），取不到显示「—」。
 * 整条按可见项顺序渲染，分隔符仅出现在相邻项之间，过滤后不出现悬空分隔符。 */
const metaItems = computed(() => {
  const paths = authorizedPaths.value
  const has = (p: string) => (paths ? paths.has(p) : true)
  const items: { label: string; value: string; path?: string }[] = []
  if (has('/approval')) {
    items.push({ label: '待办审批', value: String(todoCount.value), path: '/approval' })
  }
  if (has('/system/notify-record')) {
    items.push({ label: '未读通知', value: String(unreadCount.value), path: '/system/notify-record' })
  }
  const p = platform.value
  items.push({ label: '用户数', value: p?.userCount != null ? String(p.userCount) : '—' })
  items.push({ label: '今日登录', value: p?.todayLoginCount != null ? String(p.todayLoginCount) : '—' })
  items.push({ label: '历史访问', value: p?.historyVisitCount != null ? String(p.historyVisitCount) : '—' })
  return items
})

function onMetaClick(m: { label: string; value: string; path?: string }) {
  if (m.path) go(m.path)
}

onMounted(() => {
  loadOverview()
  loadTodo()
  loadPlatform()
  loadFlags()
  // SSE 已实时推送未读数；此处再校正一次，覆盖刚登录尚未收到推送的情况
  notifyStore.refreshUnread()
})
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
        <p class="banner-desc">欢迎，{{ nickname }}。{{ project.description }}</p>
        <div class="banner-meta">
          <template v-for="(m, i) in metaItems" :key="m.label">
            <span v-if="i > 0" class="meta-divider">·</span>
            <span
              class="meta-item"
              :class="{ 'meta-link': m.path }"
              @click="onMetaClick(m)"
            >
              {{ m.label }} <b>{{ m.value }}</b>
            </span>
          </template>
        </div>
      </div>
      <el-icon class="banner-icon" :size="72"><HomeFilled /></el-icon>
    </div>

    <!-- KPI 概览（按角色分化） -->
    <el-card shadow="never" class="kpi-card">
      <template #header>
        <div class="card-header">
          <span class="card-title">经营概览</span>
          <el-button text :icon="Refresh" :loading="overviewLoading" @click="loadOverview">
            刷新
          </el-button>
        </div>
      </template>
      <el-row :gutter="16">
        <el-col v-for="k in visibleKpis" :key="k.key" :xs="12" :sm="8" :md="6" :lg="4">
          <div class="kpi-item">
            <div class="kpi-label">{{ k.label }}</div>
            <div class="kpi-value">
              {{ fmtMoney(overview ? overview[k.key] : 0)
              }}<span v-if="k.suffix" class="kpi-unit">{{ k.suffix }}</span>
            </div>
          </div>
        </el-col>
      </el-row>
      <el-empty
        v-if="!overviewLoading && visibleKpis.length === 0"
        description="当前角色暂无概览指标"
      />
    </el-card>

    <!-- 快捷功能入口 -->
    <el-card v-if="visibleQuickEntries.length" shadow="never" class="entry-card">
      <template #header>
        <span class="card-title">快捷入口</span>
      </template>
      <el-row :gutter="16">
        <el-col
          v-for="e in visibleQuickEntries"
          :key="e.title"
          :xs="8"
          :sm="6"
          :md="4"
          :lg="3"
        >
          <div class="entry-item" @click="go(e.path)">
            <el-icon class="entry-icon" :class="{ primary: e.primary }">
              <component :is="iconComp[e.icon]" />
            </el-icon>
            <span class="entry-title">{{ e.title }}</span>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- 系统状态卡片（调试用：默认隐藏，由参数设置 dashboard_status_visible 控制） -->
    <el-card v-if="showStatusCard" shadow="hover" class="status-card">
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
  background: linear-gradient(135deg, #001529 0%, #003a70 60%, #2d6cff 130%);
  color: #fff;
  overflow: hidden;
  border-radius: 8px;
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
  margin: 16px 0 0;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.75);
}
.banner-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
}
.banner-meta b {
  margin-left: 2px;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
}
.meta-divider {
  color: rgba(255, 255, 255, 0.4);
}
.meta-link {
  cursor: pointer;
  transition: color 0.15s ease;
}
.meta-link:hover {
  color: #fff;
  text-decoration: underline;
}
.banner-icon {
  color: rgba(255, 255, 255, 0.15);
  flex-shrink: 0;
  margin-left: 24px;
  align-self: flex-end;
  position: relative;
  top: 10px;
}

/* KPI 概览 */
.kpi-card {
  margin-top: 16px;
  border-radius: 8px;
}
/* 模块标题栏：与业务详情弹窗 .block-title 同款（浅色主色渐变 + 左侧 3px 强调竖条）。
 * 用 color-mix 吃 --el-color-primary，跟随系统主题；渲染在 el-card__header 上铺满标题条。 */
.kpi-card :deep(.el-card__header),
.entry-card :deep(.el-card__header),
.status-card :deep(.el-card__header) {
  padding: 12px 16px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--el-color-primary) 16%, transparent) 0%,
    color-mix(in srgb, var(--el-color-primary) 7%, transparent) 45%,
    transparent 100%
  );
  border-left: 3px solid var(--el-color-primary);
}
.kpi-card :deep(.el-row) {
  row-gap: 16px;
}
.kpi-item {
  padding: 14px 8px;
  border-radius: 8px;
  background: #f7f9fc;
  text-align: center;
  height: 100%;
  transition: background 0.15s ease;
}
.kpi-item:hover {
  background: #eef3fb;
}
.kpi-label {
  font-size: 13px;
  color: #909399;
  margin-bottom: 8px;
}
.kpi-value {
  font-size: 20px;
  font-weight: 700;
  color: #303133;
}
.kpi-unit {
  font-size: 12px;
  font-weight: 400;
  color: #909399;
  margin-left: 2px;
}

/* 快捷入口 */
.entry-card {
  margin-top: 16px;
  border-radius: 8px;
}
.entry-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 18px 6px;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.15s ease;
}
.entry-item:hover {
  background: #f0f5ff;
}
.entry-icon {
  font-size: 26px;
  color: #5a7ca8;
}
.entry-icon.primary {
  color: #2d6cff;
}
.entry-title {
  font-size: 13px;
  color: #606266;
}

/* 状态卡片 */
.status-card {
  margin-top: 16px;
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
  table-layout: fixed;
}
.health-desc :deep(.el-descriptions__label) {
  width: 120px;
  color: #606266;
}
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
