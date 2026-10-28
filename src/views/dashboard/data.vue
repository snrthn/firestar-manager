<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import type { StatsQuery } from '@/types/stats'
import { customerOptions } from '@/api/customer'
import { goodsOptions } from '@/api/goods'
import { listUserOptions } from '@/api/user'
import { projectOptions } from '@/api/project'
import type { ProjectOptionVO } from '@/types/project'
import type { CustomerOptionVO } from '@/types/customer'
import type { GoodsOptionVO } from '@/types/goods'
import type { UserOptionVO } from '@/types/user'
import OverviewTab from './tabs/OverviewTab.vue'
import ArTab from './tabs/ArTab.vue'
import InvoiceTab from './tabs/InvoiceTab.vue'
import ProjectTab from './tabs/ProjectTab.vue'
import FulfillmentTab from './tabs/FulfillmentTab.vue'

const activeTab = ref('overview')
const query = reactive<StatsQuery>({ periodPreset: 'THIS_YEAR' })
const customerOpts = ref<CustomerOptionVO[]>([])
const goodsOpts = ref<GoodsOptionVO[]>([])
const managerOpts = ref<UserOptionVO[]>([])
const projectOpts = ref<ProjectOptionVO[]>([])

const presetOptions = [
  { value: 'THIS_MONTH', label: '本月' },
  { value: 'THIS_QUARTER', label: '本季度' },
  { value: 'THIS_YEAR', label: '本年' },
  { value: 'LAST_12_MONTH', label: '近 12 个月' },
  { value: 'ALL', label: '全部' },
]

const loadOptions = async () => {
  try {
    const [c, g, m, p] = await Promise.all([customerOptions(), goodsOptions(), listUserOptions(), projectOptions()])
    customerOpts.value = c ?? []
    goodsOpts.value = g ?? []
    managerOpts.value = m ?? []
    projectOpts.value = p ?? []
  } catch {
    // 下拉加载失败不阻断看板主流程
  }
}

const resetQuery = () => {
  query.periodPreset = 'THIS_YEAR'
  query.customerId = undefined
  query.goodsId = undefined
  query.managerId = undefined
  query.projectId = undefined
}

onMounted(loadOptions)
</script>

<template>
  <el-card shadow="never">
    <div class="dash-head">
      <h3 class="dash-title">经营数据看板</h3>
      <el-tag type="info" size="small" effect="plain">
        口径：回款/核销取 RECEIVED，红字·退款取负；账龄 FIFO
      </el-tag>
    </div>

    <!-- 全局筛选区：控件宽度统一吃 pages.css 的 .query-bar .el-select(200px)，不写内联 width -->
    <el-form :inline="true" :model="query" class="query-bar" @submit.prevent>
      <el-form-item label="统计期间">
        <el-select v-model="query.periodPreset">
          <el-option v-for="o in presetOptions" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="项目">
        <el-select
          v-model="query.projectId"
          filterable
          clearable
          placeholder="全部项目"
        >
          <el-option v-for="p in projectOpts" :key="p.id" :label="`${p.projectNo} ${p.projectName}`" :value="p.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="客户">
        <el-select
          v-model="query.customerId"
          filterable
          clearable
          placeholder="全部客户"
        >
          <el-option v-for="c in customerOpts" :key="c.id" :label="c.customerName" :value="c.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="货物">
        <el-select
          v-model="query.goodsId"
          filterable
          clearable
          placeholder="全部货物"
        >
          <el-option v-for="g in goodsOpts" :key="g.id" :label="g.goodsName" :value="g.id" />
        </el-select>
      </el-form-item>
      <el-form-item label="销售经理">
        <el-select
          v-model="query.managerId"
          filterable
          clearable
          placeholder="全部销售"
        >
          <el-option v-for="u in managerOpts" :key="u.id" :label="u.nickname" :value="u.id" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button :icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <el-tabs v-model="activeTab" class="dash-tabs">
      <el-tab-pane label="经营总览" name="overview">
        <OverviewTab :query="query" :active="activeTab === 'overview'" />
      </el-tab-pane>
      <el-tab-pane label="应收账龄" name="ar">
        <ArTab :query="query" :active="activeTab === 'ar'" />
      </el-tab-pane>
      <el-tab-pane label="发票与回款" name="invoice">
        <InvoiceTab :query="query" :active="activeTab === 'invoice'" />
      </el-tab-pane>
      <el-tab-pane label="项目排名" name="project">
        <ProjectTab :query="query" :active="activeTab === 'project'" />
      </el-tab-pane>
      <el-tab-pane label="履约风控" name="fulfillment">
        <FulfillmentTab :query="query" :active="activeTab === 'fulfillment'" />
      </el-tab-pane>
    </el-tabs>
  </el-card>
</template>

<style scoped>
.dash-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.dash-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.dash-tabs {
  margin-top: 4px;
}
</style>
