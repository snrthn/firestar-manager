<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import type { FormInstance } from 'element-plus'
import { Delete, Plus, Refresh, Search } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import { projectPage, createProject, submitProject, projectDetail, updateProject, signProject } from '@/api/project'
import type { ProjectFormData, ProjectItemForm, ProjectSignFormData, ProjectVO } from '@/types/project'
import ProjectDetailDialog from './ProjectDetailDialog.vue'
import { formatDateTime } from '@/utils/datetime'
import { listUserOptions } from '@/api/user'
import type { UserOptionVO } from '@/types/user'
import DictSelect from '@/components/DictSelect.vue'
import { customerOptions } from '@/api/customer'
import { goodsOptions } from '@/api/goods'
import type { CustomerOptionVO } from '@/types/customer'
import type { GoodsOptionVO } from '@/types/goods'
import { useDictLabels } from '@/composables/useDict'

// ===== 查询条件（2026-10-28 补齐，口径对齐核销台账） =====
// 项目编号 / 项目名称 / 客户名称 模糊；审批状态 / 合同状态 / 销售经理 精确；创建时间闭区间
const query = reactive({
  projectNo: '',
  projectName: '',
  customerName: '',
  approvalStatus: '',
  contractStatus: '',
  salesManagerId: null as number | null,
  dateRange: null as [string, string] | null,
})

const handleQuery = () => {
  pageNum.value = 1
  loadList()
}

const resetQuery = () => {
  query.projectNo = ''
  query.projectName = ''
  query.customerName = ''
  query.approvalStatus = ''
  query.contractStatus = ''
  query.salesManagerId = null
  query.dateRange = null
  pageNum.value = 1
  loadList()
}

// ===== 列表数据（分页：默认每页 10 条） =====
const loading = ref(false)
const list = ref<ProjectVO[]>([])
const pageNum = ref(1)
const pageSize = ref(10)
const total = ref(0)

const loadList = async () => {
  loading.value = true
  try {
    const page = await projectPage(pageNum.value, pageSize.value, {
      projectNo: query.projectNo.trim() || undefined,
      projectName: query.projectName.trim() || undefined,
      customerName: query.customerName.trim() || undefined,
      approvalStatus: query.approvalStatus || undefined,
      contractStatus: query.contractStatus || undefined,
      salesManagerId: query.salesManagerId ?? undefined,
      dateFrom: query.dateRange?.[0],
      dateTo: query.dateRange?.[1],
    })
    list.value = page.records
    total.value = page.total
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loading.value = false
  }
}

const reloadAfterMutation = async () => {
  await loadList()
  if (list.value.length === 0 && pageNum.value > 1) {
    pageNum.value -= 1
    await loadList()
  }
}

const handleSizeChange = () => {
  pageNum.value = 1
  loadList()
}

// ===== 弹窗表单 =====
const dialogVisible = ref(false)
const dialogTitle = ref('新建立项')
const saving = ref(false)
const formRef = ref<FormInstance>()

const emptyForm = (): ProjectFormData => ({
  projectName: '',
  customerId: undefined,
  customerName: '',
  salesManagerId: undefined,
  contractAmount: undefined,
  allowInvoiceBeforeReceipt: true,
  items: [],
})

/** 新建一行空白货物明细（方案2：立项带行） */
const newItem = (): ProjectItemForm => ({ itemName: '', specModel: '', unit: '', quantity: 1, unitPrice: undefined })
const addItem = () => {
  if (!form.items) form.items = []
  form.items.push(newItem())
}
const removeItem = async (idx: number) => {
  // 二次确认（虎哥 2026-10-24）：误删一行明细会让合同金额/发货校验都跟着错，必须拦一下
  try {
    await ElMessageBox.confirm('确认删除这一行货物明细？删除后合同金额不会自动回算，请留意下方合计。', '删除明细', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  form.items?.splice(idx, 1)
}
/** 单行金额 = 数量 × 单价 */
const itemLineAmount = (it: ProjectItemForm) =>
  Number(((it.quantity ?? 0) * (it.unitPrice ?? 0)).toFixed(2))
/** 明细合计（作为合同金额的推荐值） */
const itemsTotal = () => (form.items ?? []).reduce((s, it) => s + itemLineAmount(it), 0)
/** 一键把明细合计带入合同金额（提交前可由签约阶段再覆盖） */
const bringAmount = () => {
  form.contractAmount = Number(itemsTotal().toFixed(2))
}

const form = reactive<ProjectFormData>(emptyForm())

const rules = {
  projectName: [{ required: true, message: '请输入项目名称', trigger: 'blur' }],
}

const userOptions = ref<UserOptionVO[]>([])

const openCreate = () => {
  Object.assign(form, emptyForm())
  form.id = undefined
  dialogTitle.value = '新建立项'
  dialogVisible.value = true
  ensureUserOptions()
  ensureCustomerOptions()
  ensureGoodsOptions()
}

// 编辑：仅 DRAFT / REJECTED 行有入口（后端 PUT 同语义把关）。先拉详情回填再开窗，
// 保证拿到服务端翻译后的最新值，不拿列表行快照（列表行字段可能滞后）
const openEdit = async (row: ProjectVO) => {
  ensureUserOptions()
  ensureCustomerOptions()
  ensureGoodsOptions()
  try {
    const detail = await projectDetail(row.id)
    Object.assign(form, emptyForm(), {
      id: detail.id,
      projectName: detail.projectName,
      // V68：id + 快照名双回填。历史单据可能 customerId=0（V68 迁移未覆盖到），
      // 此时只回填名称，下拉仍显示为未选中状态，用户重选一遍即可补上关联。
      customerId: detail.customerId && detail.customerId > 0 ? detail.customerId : undefined,
      customerName: detail.customerName ?? undefined,
      salesManagerId: detail.salesManagerId ?? undefined,
      contractAmount: detail.contractAmount ?? undefined,
      // V77：票款勾稽开关回填（后端缺省视为允许，故空时按 true 显示）
      allowInvoiceBeforeReceipt: detail.allowInvoiceBeforeReceipt ?? true,
      // 方案2：立项带行 —— 编辑回填货物明细（detail.items → 表单行）
      items: (detail.items ?? []).map((it) => ({
        itemName: it.itemName ?? '',
        specModel: it.specModel ?? '',
        unit: it.unit ?? '',
        quantity: it.quantity,
        unitPrice: it.unitPrice ?? undefined,
      })),
    })
    dialogTitle.value = '编辑立项'
    dialogVisible.value = true
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

const ensureUserOptions = async () => {
  if (userOptions.value.length === 0) {
    userOptions.value = await listUserOptions()
  }
}

// 客户下拉选项（V68）：与上面的用户下拉同范式 —— 开窗时才拉一次，靠「长度非空」做懒加载。
// 一期没有客户管理页面，所以这里不提供「选项为空时如何新建」的额外入口：
// 下拉本身是 filterable + allow-create，手输的新名称直接由后端按名称 upsert 建档。
const customerOpts = ref<CustomerOptionVO[]>([])
const ensureCustomerOptions = async () => {
  if (customerOpts.value.length === 0) {
    customerOpts.value = (await customerOptions()) ?? []
  }
}

// 货物下拉选项（V71）：与上面的客户下拉同范式 —— 开窗时才拉一次，靠「长度非空」做懒加载。
// 一期没有货物管理页面，下拉本身 filterable + allow-create，手输的新名称由后端按名称 upsert 建档。
const goodsOpts = ref<GoodsOptionVO[]>([])
const ensureGoodsOptions = async () => {
  if (goodsOpts.value.length === 0) {
    goodsOpts.value = (await goodsOptions()) ?? []
  }
}

/**
 * 客户选择变更：把「名称 → 主表 id」同步到表单。
 *
 * 下拉以客户名为 value（allow-create 的天然用法），命中已有选项就带上 id；
 * 手输的新名称查不到 id → 保持 undefined，由后端按名称 upsert 建档。
 * 清空时两边一起清，避免残留 id 指向别的客户。
 */
const onCustomerChange = (name: string) => {
  if (!name) {
    form.customerId = undefined
    return
  }
  const hit = customerOpts.value.find((c) => c.customerName === name)
  form.customerId = hit ? hit.id : undefined
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate()
  // 合同金额自动带入（虎哥 2026-10-24）：明细有值、但合同金额没填（空/0）时，
  // 自动取明细合计兜底，避免漏填被后端校验打回。用户已显式填过（>0）则尊重其输入。
  if ((form.contractAmount == null || form.contractAmount === 0) && itemsTotal() > 0) {
    form.contractAmount = Number(itemsTotal().toFixed(2))
  }
  saving.value = true
  try {
    const { id, ...payload } = form
    if (id) {
      await updateProject(id, payload)
      ElMessage.success('立项已更新')
    } else {
      await createProject(payload)
      ElMessage.success('立项已创建')
    }
    dialogVisible.value = false
    await reloadAfterMutation()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    saving.value = false
  }
}

// ===== 提交审批 =====
const submitting = ref(false)

const handleSubmitApproval = async (row: ProjectVO) => {
  try {
    await ElMessageBox.confirm(`确认提交「${row.projectName}」进入审批流程？`, '提交审批', {
      type: 'warning',
      confirmButtonText: '提交',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  submitting.value = true
  try {
    await submitProject(row.id)
    ElMessage.success('已提交审批')
    // 详情弹窗入口也会走这里（handleDetailSubmit），提交即离开详情（2026-10-24 虎哥：窗口要关）。
    // 列表入口触发时 detailVisible 本就是 false，无副作用。
    detailVisible.value = false
    await reloadAfterMutation()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    submitting.value = false
  }
}

// ===== 立项详情（2026-10-23：业务动作与审批进度收进详情弹窗，列表只留编辑+详情） =====
const detailVisible = ref(false)
const detailId = ref<number | null>(null)

const openDetail = (row: ProjectVO) => {
  detailId.value = row.id
  detailVisible.value = true
}

/** 详情弹窗内「提交审批」：复用列表既有逻辑（同一份校验/提示，不复制第二份） */
const handleDetailSubmit = (id: number) => {
  const row = list.value.find((r) => r.id === id)
  if (row) handleSubmitApproval(row)
}

/** 详情弹窗内「签约」：复用列表的签约弹窗 */
const handleDetailSign = (row: ProjectVO) => {
  detailVisible.value = false
  openSign(row)
}

// ===== 签约（2026-10-22 虎哥拍板：审批通过后的独立动作，终态不可撤销） =====
const signVisible = ref(false)
const signSaving = ref(false)
const signForm = ref<ProjectSignFormData>({ contractAmount: undefined, contractDesc: '' })
const signRow = ref<ProjectVO | null>(null)

// 签约入口判定 APPROVED + UNSIGNED 已迁至 ProjectDetailDialog（详情弹窗底部动作区）；
// 列表侧不再需要，避免同一判定在两处漂移。
const openSign = (row: ProjectVO) => {
  signRow.value = row
  // 金额初始带现值（预估额），允许修正为最终合同额（b 拍板）
  signForm.value = { contractAmount: row.contractAmount ?? undefined, contractDesc: '' }
  signVisible.value = true
}

const handleSign = async () => {
  if (!signRow.value) return
  if (signForm.value.contractAmount != null && Number(signForm.value.contractAmount) < 0) {
    ElMessage.warning('合同金额不能为负')
    return
  }
  signSaving.value = true
  try {
    await signProject(signRow.value.id, {
      contractAmount: signForm.value.contractAmount,
      contractDesc: signForm.value.contractDesc?.trim() || undefined,
    })
    ElMessage.success('已签约')
    signVisible.value = false
    await reloadAfterMutation()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    signSaving.value = false
  }
}

// ===== 合同金额格式化（虎哥 2026-10-22：两位小数点；顺带千分位，长金额可读） =====
const formatAmount = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(Number(v))) return '—'
  return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// 超收标记（虎哥 2026-10-27 采纳）：累计已收 > 合同金额即判定超收，列表「已收金额」列打红标。
const isOverCollected = (row: {
  collectedAmount?: number | null
  contractAmount?: number | null
}): boolean =>
  row != null &&
  row.collectedAmount != null &&
  row.contractAmount != null &&
  Number(row.collectedAmount) > Number(row.contractAmount)

// 超收金额（合同金额已收溢出部分），供「小三角 hover 提示」展示完整信息。
const overAmount = (row: {
  collectedAmount?: number | null
  contractAmount?: number | null
}): number =>
  row != null && row.collectedAmount != null && row.contractAmount != null
    ? Math.max(0, Number(row.collectedAmount) - Number(row.contractAmount))
    : 0

// 合同状态标签悬浮详情（c 拍板：展示签约时间/人；未签约给出提示文案）。
// 列表列宽放不下多行信息，用原生 title 悬浮展示，鼠标停留即可看全
const signInfo = (row: ProjectVO): string => {
  if (row.contractStatus !== 'SIGNED') return '未签约'
  const at = row.contractSignedAt ? formatDateTime(row.contractSignedAt) : '—'
  const who = row.contractSignedByName || (row.contractSignedBy != null ? String(row.contractSignedBy) : '—')
  return `签约时间：${at}\n签约人：${who}`
}

// 审批状态标签色走后端字典翻译（approvalStatusStyle，V45 补种 style），
// 与合同状态列同链路——字典维护页改色即生效，不再前端硬编码 switch

// 合同签约状态：走字典（project_contract_status，V2 种子 + V7 已归一化 ENABLED），
// label 与 tag 颜色均来自字典（style 列 V44 补种）——字典维护页改完即生效，
// useDictLabels 兜底：空值 '—'、未命中显示原值、style 缺失调用方兜 'info'
const { label: contractStatusLabel, style: contractStatusStyle } = useDictLabels('project_contract_status')

// 查询区「销售经理」下拉需要用户选项，进页面就拉一次（开窗时的懒加载 ensureUserOptions
// 只服务表单，查询区不等开窗）；列表与下拉并行加载，不串行阻塞。
onMounted(() => {
  ensureUserOptions()
  loadList()
})
</script>

<template>
  <el-card shadow="never">
    <!-- 查询区 -->
    <el-form :inline="true" :model="query" class="query-bar" @submit.prevent>
      <el-form-item label="项目编号">
        <el-input v-model="query.projectNo" placeholder="模糊匹配" clearable @keyup.enter="handleQuery" />
      </el-form-item>
      <el-form-item label="项目名称">
        <el-input v-model="query.projectName" placeholder="模糊匹配" clearable @keyup.enter="handleQuery" />
      </el-form-item>
      <el-form-item label="客户名称">
        <el-input v-model="query.customerName" placeholder="模糊匹配" clearable @keyup.enter="handleQuery" />
      </el-form-item>
      <el-form-item label="审批状态">
        <!-- 宽度走 pages.css 的 .query-bar 统一规范（200px），不再内联绕过 -->
        <DictSelect v-model="query.approvalStatus" type-code="approval_status" placeholder="全部" />
      </el-form-item>
      <el-form-item label="合同状态">
        <DictSelect
          v-model="query.contractStatus"
          type-code="project_contract_status"
          placeholder="全部"
        />
      </el-form-item>
      <el-form-item label="销售经理">
        <el-select v-model="query.salesManagerId" filterable clearable placeholder="全部">
          <el-option
            v-for="u in userOptions"
            :key="u.id"
            :label="u.nickname"
            :value="u.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="创建时间">
        <el-date-picker
          v-model="query.dateRange"
          type="daterange"
          range-separator="~"
          start-placeholder="开始"
          end-placeholder="结束"
          value-format="YYYY-MM-DD"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
        <el-button :icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="openCreate">新建立项</el-button>
      <el-button :icon="Refresh" @click="loadList">刷新</el-button>
    </div>

    <el-table v-loading="loading" :data="list" border>
      <el-table-column prop="projectNo" label="项目编号" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.projectNo || '—' }}</template>
      </el-table-column>
      <el-table-column prop="projectName" label="项目名称" min-width="180" show-overflow-tooltip />
      <el-table-column prop="customerName" label="客户名称" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.customerName || '—' }}</template>
      </el-table-column>
      <el-table-column label="销售经理" width="120" align="center">
        <template #default="{ row }">{{ row.salesManagerName || row.salesManagerId || '—' }}</template>
      </el-table-column>
      <el-table-column label="合同状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag
            :type="contractStatusStyle(row.contractStatus) || 'info'"
            size="small"
            :title="signInfo(row)"
          >
            {{ contractStatusLabel(row.contractStatus) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="合同金额" width="150" align="right">
        <template #default="{ row }">{{ formatAmount(row.contractAmount) }}</template>
      </el-table-column>
      <el-table-column label="已发金额" width="130" align="right">
        <template #default="{ row }">{{ formatAmount(row.shippedAmount) }}</template>
      </el-table-column>
      <el-table-column label="已收金额" width="150" align="right">
        <template #default="{ row }">
          <span :style="isOverCollected(row) ? 'color:#f56c6c;font-weight:600' : ''">{{ formatAmount(row.collectedAmount) }}</span>
          <el-tooltip v-if="isOverCollected(row)" :content="`⚠ 超收 ${formatAmount(overAmount(row))}，累计已收已超过合同金额`" placement="top">
            <span style="color:#e6a23c;margin-left:4px;font-size:13px;line-height:1;cursor:pointer">⚠</span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="退货金额" width="130" align="right">
        <template #default="{ row }">{{ formatAmount(row.returnedAmount) }}</template>
      </el-table-column>
      <el-table-column label="审批状态" width="150" align="center">
        <template #default="{ row }">
          <el-tag :type="row.approvalStatusStyle || 'info'" size="small">
            {{ row.approvalStatusName || row.approvalStatus }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" min-width="170">
        <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
      </el-table-column>
      <!-- 操作列收敛（2026-10-23 虎哥：编辑/详情留外面，其余业务操作收进详情弹窗）。
           按钮位置固定两位、含义恒定，不再随审批状态漂移成三套组合 -->
      <el-table-column label="操作" width="140" fixed="right" align="center">
        <template #default="{ row }">
          <el-button
            v-if="row.approvalStatus === 'DRAFT' || row.approvalStatus === 'REJECTED'"
            link type="primary" size="small"
            @click="openEdit(row)"
          >编辑</el-button>
          <el-button link type="primary" size="small" @click="openDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    <template #empty>
      <EmptyState />
    </template>
    </el-table>

    <!-- 标准分页器：默认每页 10 条，与后端默认值一致 -->
    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="pageNum"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @current-change="loadList"
        @size-change="handleSizeChange"
      />
    </div>
  </el-card>

  <!-- 立项详情弹窗（Tab：基本信息/货物明细/审批进度；底部动作按状态显示） -->
  <ProjectDetailDialog
    v-model:visible="detailVisible"
    :project-id="detailId"
    @updated="loadList"
    @submit="handleDetailSubmit"
    @sign="handleDetailSign"
  />

  <!-- 审批进度弹窗已移除：进度合并进立项详情弹窗（2026-10-23 虎哥拍板）。
       组件本体保留给审批中心「我发起的」使用（views/approval/list.vue）。 -->

  <!-- 签约弹窗（2026-10-22 虎哥拍板：审批通过后的独立动作；金额可修正为最终合同额，描述非必填） -->
  <el-dialog v-model="signVisible" :title="`签约 - ${signRow?.projectName ?? ''}`" width="480px">
    <el-form label-width="90px" @submit.prevent>
      <el-form-item label="合同金额">
        <el-input-number v-model="signForm.contractAmount" :min="0" :precision="2" :step="1000"
                         class="amount-left" controls-position="right" style="width: 100%" placeholder="最终合同金额" />
      </el-form-item>
      <el-form-item label="签约描述">
        <el-input v-model="signForm.contractDesc" type="textarea" :rows="3" maxlength="500"
                  show-word-limit placeholder="选填，如付款约定、交付说明等" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="signVisible = false">取消</el-button>
      <el-button type="primary" :loading="signSaving" @click="handleSign">确认签约</el-button>
    </template>
  </el-dialog>

  <!-- 新建立项弹窗：top+内层限高与详情弹窗同口径（2026-10-24 虎哥），
       明细表长时不至于把 footer 顶出屏幕 -->
  <el-dialog v-model="dialogVisible" :title="dialogTitle" width="1000px" top="7vh">
    <div class="dialog-scroll">
    <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" @submit.prevent>
      <!-- 顶部 4 项两列布局（2026-10-24 虎哥）：CSS grid 而非 el-row/el-col，
           少一层组件注册依赖；列间距 24px 与 EP 表单行距对齐 -->
      <div class="form-grid">
        <el-form-item label="项目名称" prop="projectName">
          <el-input v-model="form.projectName" placeholder="请输入项目名称" maxlength="128" show-word-limit />
        </el-form-item>
        <!-- 客户名称（V68）：由自由文本输入改为「选已有 + 可手输新建」下拉。
             allow-create 手输的名称会被后端按名称 upsert 建档 —— 一期不做客户管理页面，
             这是唯一的新客户入口。selected 时同步把名称写回 form.customerName，
             后端虽有「以 id 为准」的最终裁定，前端这里显式同步一次更好排查。 -->
        <el-form-item label="客户名称">
          <el-select
            v-model="form.customerName"
            filterable
            allow-create
            default-first-option
            clearable
            placeholder="选择已有客户，或直接输入新客户名"
            style="width: 100%"
            @change="onCustomerChange"
          >
            <el-option
              v-for="c in customerOpts"
              :key="c.id"
              :label="c.customerName"
              :value="c.customerName"
            >
              <span>{{ c.customerName }}</span>
              <span class="opt-sub">{{ c.customerNo }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="销售经理">
          <el-select v-model="form.salesManagerId" filterable placeholder="选择销售经理" style="width: 100%">
            <el-option v-for="u in userOptions" :key="u.id" :label="u.nickname" :value="u.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="合同金额">
          <el-input-number v-model="form.contractAmount" :min="0" :precision="2" :step="1000"
                           class="amount-left" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="允许回款前开票">
          <el-switch
            v-model="form.allowInvoiceBeforeReceipt"
            active-text="允许"
            inactive-text="不允许"
            inline-prompt
          />
          <span class="muted" style="margin-left: 8px">关 = 强制票款勾稽：开票额不得超已回款额</span>
        </el-form-item>
      </div>

      <!-- 方案2：立项带行 —— 货物明细表（标题栏用 div 实现，规避 el-divider 按需注册缺失） -->
      <div class="items-section-title">
        <span class="items-section-title-text">货物明细（合同标的，发货按行校验超发）</span>
      </div>
      <div class="item-table">
        <el-table :data="form.items || []" border>
          <el-table-column type="index" label="#" width="44" align="center" />
          <el-table-column label="货物名称" min-width="200">
            <template #default="{ row }">
              <el-select
                v-model="row.itemName"
                filterable
                allow-create
                default-first-option
                clearable
                placeholder="选择已有货物，或直接输入新货物名"
                style="width: 100%"
              >
                <el-option
                  v-for="g in goodsOpts"
                  :key="g.id"
                  :label="g.goodsName"
                  :value="g.goodsName"
                >
                  <span>{{ g.goodsName }}</span>
                  <span class="opt-sub">{{ g.goodsNo }}</span>
                </el-option>
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="规格" min-width="120">
            <template #default="{ row }">
              <el-input v-model="row.specModel" placeholder="选填" />
            </template>
          </el-table-column>
          <el-table-column label="单位" width="80">
            <template #default="{ row }">
              <el-input v-model="row.unit" placeholder="选填" />
            </template>
          </el-table-column>
          <el-table-column label="数量" width="110">
            <template #default="{ row }">
              <el-input-number v-model="row.quantity" :min="1" :precision="0" :controls-position="'right'" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="单价" width="130">
            <template #default="{ row }">
              <el-input-number v-model="row.unitPrice" :min="0" :precision="2" :controls-position="'right'" style="width: 100%" />
            </template>
          </el-table-column>
          <el-table-column label="行金额" width="110" align="right">
            <template #default="{ row }">
              <b>{{ formatAmount(itemLineAmount(row)) }}</b>
            </template>
          </el-table-column>
          <el-table-column label="" width="50" align="center">
            <template #default="{ $index }">
              <el-button type="danger" link :icon="Delete" @click="removeItem($index)" />
            </template>
          </el-table-column>
        <template #empty>
          <EmptyState />
        </template>
        </el-table>
        <div class="item-actions">
          <el-button type="primary" plain :icon="Plus" @click="addItem">添加货物</el-button>
          <span class="muted">明细合计：<b>{{ formatAmount(itemsTotal()) }}</b></span>
          <el-button link type="primary" @click="bringAmount">带入合同金额</el-button>
        </div>
      </div>
    </el-form>
    </div>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSubmit">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.query-bar {
  margin-bottom: 4px;
}
.toolbar {
  display: flex;
  gap: 0;
  margin-bottom: 16px;
}
/* .pagination-bar 已上提到 styles/pages.css 全局（2026-10-26），本文件不再留本地副本 */
/* ===== 审批进度时间线样式在 components/ApprovalTimeline.vue（详情弹窗内联复用） ===== */

/* 2026-10-23 虎哥：合同金额输入框内容左对齐（el-input-number 默认偏右/居中，强制内部 input 左对齐） */
.amount-left :deep(.el-input__inner) {
  text-align: left;
}
/* 方案2 立项带行：明细标题栏、操作区与 muted 文本 */
.items-section-title {
  margin: 20px 0 14px;
  padding-left: 10px;
  border-left: 3px solid var(--el-color-primary);
  line-height: 20px;
}
.items-section-title-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.item-table :deep(.el-table th .cell),
.item-table :deep(.el-table td .cell) {
  padding: 0 8px;
}
.item-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 14px;
}
.muted {
  color: #909399;
  font-size: 13px;
}

/* ===== 新建立项弹窗（2026-10-24 虎哥） ===== */
/* 顶部 4 项两列布局：grid 而非 el-row，少一层注册依赖 */
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 24px;
}
/* 限高滚动 + 迷你滚动条：与 ProjectDetailDialog/ShipmentDetailDialog 的 .detail-scroll
   完全同款（公式 280 同源），改必须三处同步 */
.dialog-scroll {
  max-height: calc(100vh - 280px);
  overflow-y: auto;
  padding-right: 4px;
}
.dialog-scroll::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.dialog-scroll::-webkit-scrollbar-thumb {
  background: #c0c4cc;
  border-radius: 3px;
}
.dialog-scroll::-webkit-scrollbar-thumb:hover {
  background: #909399;
}
.dialog-scroll::-webkit-scrollbar-track {
  background: transparent;
}

/* V68 客户下拉：选项带上客户编号做副标题，区分同名不同的人/公司 */
.opt-sub {
  margin-left: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
