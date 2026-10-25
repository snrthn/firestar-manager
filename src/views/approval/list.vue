<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Refresh, Search } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import DictSelect from '@/components/DictSelect.vue'
import ProjectDetailDialog from '@/views/project/ProjectDetailDialog.vue'
import ShipmentDetailDialog from '@/views/shipment/ShipmentDetailDialog.vue'
import ReceiptDetailDialog from '@/views/receipt/ReceiptDetailDialog.vue'
import InvoiceDetailDialog from '@/views/invoice/InvoiceDetailDialog.vue'
import { myTasksPage, myStartedPage, myApprovedHistoryPage } from '@/api/approval'
import { formatDateTime } from '@/utils/datetime'
import type { ApprovalHistoryVO, TaskInfoVO } from '@/types/approval'
import type { ProjectVO } from '@/types/project'
import { approvalModuleOf, isShipmentTask, isReceiptTask, isInvoiceTask } from '@/composables/useTaskApproval'

/** 发货审批任务标识（2026-10-23 通用化：待办 enrich 按流程 key 分发，前端审批动作同样按 key 路由） */

// ===== 顶部 Tab（2026-10-22 虎哥：审批中心按标准页面改造，我发起的 / 我审批的）=====
const activeTab = ref('approval')

// ===== Tab1 我审批的（待办分页：查询 + 表格 + 分页）=====
const approvalLoading = ref(false)
const approvalList = ref<TaskInfoVO[]>([])
const approvalTotal = ref(0)
const approvalQuery = reactive({
  pageNum: 1,
  pageSize: 10,
  bizTitleKw: '',
  taskNameKw: '',
})

const loadApprovals = async () => {
  approvalLoading.value = true
  try {
    const page = await myTasksPage(approvalQuery.pageNum, approvalQuery.pageSize, {
      bizTitleKw: approvalQuery.bizTitleKw || undefined,
      taskNameKw: approvalQuery.taskNameKw || undefined,
    })
    approvalList.value = page.records
    approvalTotal.value = page.total
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    approvalLoading.value = false
  }
}

const searchApprovals = () => {
  approvalQuery.pageNum = 1
  loadApprovals()
}

const resetApprovals = () => {
  approvalQuery.bizTitleKw = ''
  approvalQuery.taskNameKw = ''
  approvalQuery.pageNum = 1
  loadApprovals()
}

// ===== Tab2 我发起的（项目分页：查询 + 表格 + 分页）=====
const startedLoading = ref(false)
const startedList = ref<ProjectVO[]>([])
const startedTotal = ref(0)
const startedQuery = reactive({
  pageNum: 1,
  pageSize: 10,
  projectName: '',
  approvalStatus: '',
})

const loadStarted = async () => {
  startedLoading.value = true
  try {
    const page = await myStartedPage(startedQuery.pageNum, startedQuery.pageSize, {
      projectName: startedQuery.projectName || undefined,
      approvalStatus: startedQuery.approvalStatus || undefined,
    })
    startedList.value = page.records
    startedTotal.value = page.total
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    startedLoading.value = false
  }
}

const searchStarted = () => {
  startedQuery.pageNum = 1
  loadStarted()
}

const resetStarted = () => {
  startedQuery.projectName = ''
  startedQuery.approvalStatus = ''
  startedQuery.pageNum = 1
  loadStarted()
}

// ===== Tab3 我审批的（历史分页：查询 + 表格 + 分页；2026-10-22 虎哥：看不到自己审批过的记录）=====
const historyLoading = ref(false)
const historyList = ref<ApprovalHistoryVO[]>([])
const historyTotal = ref(0)
const historyQuery = reactive({
  pageNum: 1,
  pageSize: 10,
  bizTitleKw: '',
  taskNameKw: '',
})

const loadHistory = async () => {
  historyLoading.value = true
  try {
    const page = await myApprovedHistoryPage(historyQuery.pageNum, historyQuery.pageSize, {
      bizTitleKw: historyQuery.bizTitleKw || undefined,
      taskNameKw: historyQuery.taskNameKw || undefined,
    })
    historyList.value = page.records
    historyTotal.value = page.total
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    historyLoading.value = false
  }
}

const searchHistory = () => {
  historyQuery.pageNum = 1
  loadHistory()
}

const resetHistory = () => {
  historyQuery.bizTitleKw = ''
  historyQuery.taskNameKw = ''
  historyQuery.pageNum = 1
  loadHistory()
}

// Tab 切换懒加载：发起的/历史的第一次切到才拉（避免进页面三套数据全拉）
const handleTabChange = (name: string) => {
  if (name === 'started' && startedTotal.value === 0 && startedList.value.length === 0) {
    loadStarted()
  }
  if (name === 'history' && historyTotal.value === 0 && historyList.value.length === 0) {
    loadHistory()
  }
}

// ===== 详情弹窗（2026-10-24 虎哥：审批中心不再留独立的「查看进度」入口，
//       一律并入详情弹窗——进度是详情的一部分，与立项/发货列表的操作列口径一致）=====
// 一律 readonly（纯查看）——理由有二：
// ① 审批中心的定位是「审批视角」，单据管理动作（提交/签约/撤回）归立项管理页，
//    两边都能操作就成了同一动作两个入口，正是刚统一操作列要消灭的漂移；
// ② 本页没有提交审批/签约的弹窗与校验逻辑，放开会出现点了没反应的死按钮。
const projectVisible = ref(false)
const projectId = ref<number | null>(null)

// 普通详情入口（「我发起的」/ 历史「详情」）：非审批场景，务必清空审批态，
// 否则会带着上一次失败的审批任务误入审批表单（只读视图变成可操作）
const openProject = (id: number | null) => {
  if (id == null) return
  approvalTask.value = null
  projectId.value = id
  projectVisible.value = true
}

// 发货详情：三个 Tab 里的发货单都是别人的（我是审批人视角），一律 readonly
const shipmentVisible = ref(false)
const shipmentId = ref<number | null>(null)

const openShipment = (id: number | null) => {
  if (id == null) return
  approvalTask.value = null
  shipmentId.value = id
  shipmentVisible.value = true
}

// 回款详情：审批人视角，一律 readonly
const receiptVisible = ref(false)
const receiptId = ref<number | null>(null)

const openReceipt = (id: number | null) => {
  if (id == null) return
  approvalTask.value = null
  receiptId.value = id
  receiptVisible.value = true
}

// 发票详情：审批人视角，一律 readonly
const invoiceVisible = ref(false)
const invoiceId = ref<number | null>(null)

const openInvoice = (id: number | null) => {
  if (id == null) return
  approvalTask.value = null
  invoiceId.value = id
  invoiceVisible.value = true
}

// ===== 「待我审批」操作列合并为单一「审批」入口（2026-10-24 虎哥）=====
// 点开不是独立小窗，而是「详情弹窗 + 底部审批表单」的合一工作台：
// 上半看单据内容，底部直接选通过/驳回。审批逻辑在 composables/useTaskApproval，
// 详情弹窗底部挂 ApprovalActionForm（立项/发货两处复用同一份），本页不再持有审批 UI。
const approvalTask = ref<TaskInfoVO | null>(null)

// 合并入口：待办行 → 打开对应单子的详情弹窗并进入审批模式
const openApproval = (row: TaskInfoVO) => {
  if (!row.bizKey) return
  approvalTask.value = row
  const mod = approvalModuleOf(row)
  if (mod === 'receipt') {
    receiptId.value = Number(row.bizKey)
    receiptVisible.value = true
  } else if (mod === 'invoice') {
    invoiceId.value = Number(row.bizKey)
    invoiceVisible.value = true
  } else if (isShipmentTask(row)) {
    shipmentId.value = Number(row.bizKey)
    shipmentVisible.value = true
  } else {
    projectId.value = Number(row.bizKey)
    projectVisible.value = true
  }
}

// 详情弹窗内审批结束（成功与否都触发，详见 ApprovalActionForm）：刷新列表切到真实待办。
// 成功才清空审批态（置空后下次点详情不会误入审批模式）；失败保留，用户可重试。
const onApproved = (ok: boolean) => {
  if (ok) approvalTask.value = null
  if (activeTab.value === 'approval') {
    loadApprovals()
  } else if (activeTab.value === 'history') {
    loadHistory()
  }
}

onMounted(loadApprovals)
</script>

<template>
  <el-card shadow="never">
    <!-- 查询条件：顶部一套，按当前 Tab 显示对应表单（虎哥 2026-10-22：Tab 栏放到查询条件下、表格上）。
         控件宽度统一吃 pages.css 的 .query-bar（200px），本页不再内联写死，避免规范两处维护 -->
    <el-form v-if="activeTab === 'approval'" :inline="true" :model="approvalQuery" class="query-bar" @submit.prevent>
      <el-form-item label="业务名称">
        <el-input v-model="approvalQuery.bizTitleKw" placeholder="模糊匹配" clearable @keyup.enter="searchApprovals" />
      </el-form-item>
      <el-form-item label="节点名称">
        <el-input v-model="approvalQuery.taskNameKw" placeholder="模糊匹配" clearable @keyup.enter="searchApprovals" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="searchApprovals">查询</el-button>
        <el-button :icon="Refresh" @click="resetApprovals">重置</el-button>
      </el-form-item>
    </el-form>
    <el-form v-else-if="activeTab === 'started'" :inline="true" :model="startedQuery" class="query-bar" @submit.prevent>
      <el-form-item label="项目名称">
        <el-input v-model="startedQuery.projectName" placeholder="模糊匹配" clearable @keyup.enter="searchStarted" />
      </el-form-item>
      <el-form-item label="审批状态">
        <DictSelect v-model="startedQuery.approvalStatus" type-code="project_approval_status" placeholder="全部" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="searchStarted">查询</el-button>
        <el-button :icon="Refresh" @click="resetStarted">重置</el-button>
      </el-form-item>
    </el-form>
    <el-form v-else-if="activeTab === 'history'" :inline="true" :model="historyQuery" class="query-bar" @submit.prevent>
      <el-form-item label="业务名称">
        <el-input v-model="historyQuery.bizTitleKw" placeholder="模糊匹配" clearable @keyup.enter="searchHistory" />
      </el-form-item>
      <el-form-item label="节点名称">
        <el-input v-model="historyQuery.taskNameKw" placeholder="模糊匹配" clearable @keyup.enter="searchHistory" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="searchHistory">查询</el-button>
        <el-button :icon="Refresh" @click="resetHistory">重置</el-button>
      </el-form-item>
    </el-form>

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <!-- Tab1 我审批的：当前登录用户的 active 待办（三线合并） -->
      <el-tab-pane label="待我审批" name="approval">
        <el-table v-loading="approvalLoading" :data="approvalList" border empty-text="暂无待办">
          <el-table-column prop="bizTitle" label="业务" min-width="200" show-overflow-tooltip />
          <el-table-column prop="taskName" label="当前节点" min-width="140" />
          <el-table-column label="处理人" min-width="160">
            <template #default="{ row }">
              <template v-if="row.handlerNames && row.handlerNames.length">
                <el-tag v-for="(n, i) in row.handlerNames" :key="i" size="small" class="handler-tag">{{ n }}</el-tag>
              </template>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column label="到达时间" min-width="170">
            <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right" align="center">
            <template #default="{ row }">
              <!-- 合并入口（2026-10-24 虎哥）：点「审批」直接进「详情 + 底部审批表单」的合一工作台，
                   不再分详情/通过/驳回三个按钮 -->
              <el-button
                link
                type="primary"
                size="small"
                :disabled="!row.bizKey"
                @click="openApproval(row)"
              >审批</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination-bar">
          <el-pagination
            v-model:current-page="approvalQuery.pageNum"
            v-model:page-size="approvalQuery.pageSize"
            :total="approvalTotal"
            :page-sizes="[10, 20, 50, 100]"
            layout="total, sizes, prev, pager, next, jumper"
            background
            @current-change="loadApprovals"
            @size-change="searchApprovals"
          />
        </div>
      </el-tab-pane>

      <!-- Tab2 我发起的：当前用户发起过流程的立项单（服务端过滤，排除草稿）；查询表单在 Tab 栏上方 -->
      <el-tab-pane label="我发起的" name="started">
        <el-table v-loading="startedLoading" :data="startedList" border empty-text="暂无发起记录">
          <el-table-column prop="projectNo" label="项目编号" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.projectNo || '—' }}</template>
          </el-table-column>
          <el-table-column prop="projectName" label="项目名称" min-width="180" show-overflow-tooltip />
          <el-table-column label="审批状态" min-width="160" align="center">
            <template #default="{ row }">
              <el-tag :type="row.approvalStatusStyle || 'info'" size="small">
                {{ row.approvalStatusName || row.approvalStatus }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="创建时间" min-width="170">
            <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right" align="center">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openProject(row.id)">详情</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination-bar">
          <el-pagination
            v-model:current-page="startedQuery.pageNum"
            v-model:page-size="startedQuery.pageSize"
            :total="startedTotal"
            :page-sizes="[10, 20, 50, 100]"
            layout="total, sizes, prev, pager, next, jumper"
            background
            @current-change="loadStarted"
            @size-change="searchStarted"
          />
        </div>
      </el-tab-pane>

      <!-- Tab3 我审批的：我处理过的历史任务（taskCompletedBy，按处理时间倒序） -->
      <el-tab-pane label="我审批的" name="history">
        <el-table v-loading="historyLoading" :data="historyList" border empty-text="暂无审批记录">
          <el-table-column prop="bizTitle" label="业务" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">{{ row.bizTitle || '—' }}</template>
          </el-table-column>
          <el-table-column prop="taskName" label="审批节点" min-width="140" show-overflow-tooltip />
          <el-table-column label="我的结果" min-width="160" align="center">
            <template #default="{ row }">
              <el-tag :type="row.result === 'REJECTED' ? 'danger' : 'success'" size="small">
                {{ row.result === 'REJECTED' ? '已驳回' : '已通过' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="审批意见" min-width="160" show-overflow-tooltip>
            <template #default="{ row }">{{ row.comment || '—' }}</template>
          </el-table-column>
          <el-table-column label="处理时间" min-width="170">
            <template #default="{ row }">{{ formatDateTime(row.endTime) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right" align="center">
            <template #default="{ row }">
              <el-button
                v-if="isReceiptTask(row)"
                link
                type="primary"
                size="small"
                :disabled="!row.bizKey"
                @click="openReceipt(Number(row.bizKey))"
              >详情</el-button>
              <el-button
                v-else-if="isInvoiceTask(row)"
                link
                type="primary"
                size="small"
                :disabled="!row.bizKey"
                @click="openInvoice(Number(row.bizKey))"
              >详情</el-button>
              <el-button
                v-else-if="isShipmentTask(row)"
                link
                type="primary"
                size="small"
                :disabled="!row.bizKey"
                @click="openShipment(Number(row.bizKey))"
              >详情</el-button>
              <el-button
                v-else
                link
                type="primary"
                size="small"
                :disabled="!row.bizKey"
                @click="openProject(Number(row.bizKey))"
              >详情</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pagination-bar">
          <el-pagination
            v-model:current-page="historyQuery.pageNum"
            v-model:page-size="historyQuery.pageSize"
            :total="historyTotal"
            :page-sizes="[10, 20, 50, 100]"
            layout="total, sizes, prev, pager, next, jumper"
            background
            @current-change="loadHistory"
            @size-change="searchHistory"
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 详情弹窗（进度已内联进详情）：审批中心复用查看别人发起的单子。
         待我审批点「审批」时还传入 approval-task，弹窗底部切换为审批表单（详情+审批合一） -->
    <ProjectDetailDialog
      v-model:visible="projectVisible"
      :project-id="projectId"
      :approval-task="approvalTask"
      readonly
      @approved="onApproved"
    />
    <ShipmentDetailDialog
      v-model:visible="shipmentVisible"
      :shipment-id="shipmentId"
      :approval-task="approvalTask"
      readonly
      @approved="onApproved"
    />
    <ReceiptDetailDialog
      v-model:visible="receiptVisible"
      :receipt-id="receiptId"
      :approval-task="approvalTask"
      readonly
      @approved="onApproved"
    />
    <InvoiceDetailDialog
      v-model:visible="invoiceVisible"
      :invoice-id="invoiceId"
      :approval-task="approvalTask"
      readonly
      @approved="onApproved"
    />
  </el-card>
</template>

<style scoped>
/* 查询表单与 Tab 栏之间的间距（表单挪到 Tab 上方后需要留气口） */
.query-bar {
  margin-bottom: 0px;
}
/* .pagination-bar 已上提到 styles/pages.css 全局（2026-10-26），本文件不再留本地副本 */
/* 处理人标签（集合时多个标签横排，虎哥 2026-10-22 要求） */
.handler-tag {
  margin: 2px;
}
</style>
