<template>
  <el-drawer
    :model-value="visible"
    @update:model-value="$emit('update:visible', $event)"
    :title="drawerTitle"
    size="880px"
    :close-on-click-modal="false"
    @opened="onOpened"
    @closed="onClosed"
  >
    <el-tabs v-model="activeTab" class="import-tabs">
      <!-- ========== Tab 1：新建导入 ========== -->
      <el-tab-pane label="新建导入" name="create">
        <div class="import-create">
          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="上传后立即返回批次号，可安全切走页面做其他任务；后台静默处理，完成后站内通知提醒。"
            class="tip-alert"
          />

          <el-form label-width="110px" class="create-form">
            <el-form-item label="导入类型" v-if="!fixedKey">
              <el-select v-model="selectedKey" placeholder="请选择导入类型" style="width: 320px" @change="onKeyChange">
                <el-option v-for="k in keyOptions" :key="k.key" :label="k.displayName" :value="k.key" />
              </el-select>
            </el-form-item>
            <el-form-item v-else label="导入类型">
              <el-tag type="primary">{{ fixedName }}</el-tag>
            </el-form-item>

            <el-form-item label="数据文件">
              <el-upload
                :auto-upload="false"
                :show-file-list="false"
                accept=".xlsx"
                :on-change="onFileChange"
              >
                <el-button type="primary" :icon="Upload">选择 xlsx 文件</el-button>
              </el-upload>
              <div v-if="fileHint" class="file-hint" :class="{ warn: rowWarn }">{{ fileHint }}</div>
            </el-form-item>

            <el-form-item label="模板">
              <el-button link type="primary" :icon="Download" :disabled="!effectiveKey" @click="onDownloadTemplate">
                下载导入模板
              </el-button>
              <span class="form-help">请勿修改表头名称与顺序；单次最多 2000 行</span>
            </el-form-item>

            <el-form-item v-if="parentBatchNo" label="修正来源">
              <el-tag type="warning">修正自 #{{ parentBatchNo }}</el-tag>
              <el-button link type="info" @click="parentBatchNo = ''">取消修正</el-button>
            </el-form-item>

            <el-form-item>
              <el-button
                type="success"
                :icon="Upload"
                :loading="submitting"
                :disabled="!effectiveKey || !selectedFile"
                @click="onSubmit"
              >提交导入</el-button>
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <!-- ========== Tab 2：导入历史 ========== -->
      <el-tab-pane label="导入历史" name="history">
        <div class="history-toolbar">
          <el-select
            v-if="!fixedKey"
            v-model="historyKey"
            placeholder="全部类型"
            clearable
            style="width: 220px"
            @change="onHistoryKeyChange"
          >
            <el-option v-for="k in keyOptions" :key="k.key" :label="k.displayName" :value="k.key" />
          </el-select>
          <el-button :icon="Refresh" @click="loadHistory">刷新</el-button>
          <span class="polling-hint" v-if="hasActive">有任务处理中，每 3 秒自动刷新…</span>
        </div>

        <el-table :data="pagedHistory" border v-loading="historyLoading" class="history-table">
          <el-table-column label="批次号" min-width="150" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="batch-no">#{{ row.batchNo }}</span>
              <div v-if="row.parentBatchNo" class="sub-line">修正自 #{{ row.parentBatchNo }}</div>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="110">
            <template #default="{ row }">{{ keyName(row.importKey) }}</template>
          </el-table-column>
          <el-table-column prop="fileName" label="文件" min-width="150" show-overflow-tooltip />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status, row.phase) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="进度" width="130">
            <template #default="{ row }">
              <el-progress :percentage="row.progressPct || 0" :stroke-width="6" v-if="isActive(row)" />
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="成功/失败" width="100">
            <template #default="{ row }">{{ row.successRows }}/{{ row.failRows }}</template>
          </el-table-column>
          <el-table-column label="提交时间" min-width="150">
            <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="220" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="showReport(row)">报告</el-button>
              <el-button
                v-if="row.status === 'FAILED'"
                link type="danger" size="small" @click="onDownloadErrors(row)"
              >错误行</el-button>
              <el-button
                v-if="row.status === 'FAILED'"
                link type="warning" size="small" @click="onRetry(row)"
              >修正重导</el-button>
              <el-button
                v-if="row.status === 'PARTIAL'"
                link type="warning" size="small" @click="showDiff(row)"
              >差异</el-button>
              <el-button
                v-if="isTerminal(row.status) && row.status !== 'ARCHIVED'"
                link type="info" size="small" @click="onArchive(row)"
              >归档</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="pagination-bar">
          <el-pagination
            v-model:current-page="historyPage"
            v-model:page-size="historyPageSize"
            :total="history.length"
            :page-sizes="[10, 20, 50, 100]"
            layout="total, sizes, prev, pager, next, jumper"
            background
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 报告 / 差异 弹窗 -->
    <el-dialog v-model="reportVisible" :title="reportTitle" width="560px" append-to-body>
      <div v-if="reportDiff" class="report-diff">{{ reportDiff }}</div>
      <template v-else>
        <p v-if="reportRow"><b>批次：</b>#{{ reportRow.batchNo }}</p>
        <p v-if="reportRow"><b>结果：</b>{{ statusLabel(reportRow.status, reportRow.phase) }}</p>
        <p v-if="reportRow"><b>行数：</b>成功 {{ reportRow.successRows }} / 失败 {{ reportRow.failRows }}</p>
        <p v-if="reportRow"><b>备注：</b>{{ reportRow.remark || '—' }}</p>
        <div v-if="reportErrors.length" class="error-list">
          <div v-for="(e, i) in reportErrors" :key="i" class="error-line">第 {{ e.rowNo }} 行：{{ e.errorMsg }}</div>
        </div>
      </template>
    </el-dialog>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Upload, Refresh, Download } from '@element-plus/icons-vue'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import {
  importKeys, submitImport, importHistory, archiveImport,
  downloadTemplate, downloadErrors,
} from '@/api/import'
import type { ImportBatch, ImportKeyOption } from '@/types/import'
import { saveBlobAs } from '@/utils/fileDownload'
import { formatDateTime } from '@/utils/datetime'

const props = defineProps<{
  visible: boolean
  /** 固定导入类型（如客户档案抽屉内只导 customer） */
  fixedKey?: string
  fixedName?: string
}>()
const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'imported'): void
}>()

const activeTab = ref('create')
const keyOptions = ref<ImportKeyOption[]>([])
const selectedKey = ref('')
const historyKey = ref('')
const history = ref<ImportBatch[]>([])
const historyPage = ref(1)
const historyPageSize = ref(10)
const historyLoading = ref(false)
const selectedFile = ref<File | null>(null)
const fileHint = ref('')
const rowWarn = ref(false)
const submitting = ref(false)
const parentBatchNo = ref('')
const reportVisible = ref(false)
const reportRow = ref<ImportBatch | null>(null)
const reportDiff = ref('')

const effectiveKey = computed(() => props.fixedKey || selectedKey.value)
const drawerTitle = computed(() => (props.fixedName ? `${props.fixedName} · 数据导入` : '历史数据导入'))
const hasActive = computed(() => history.value.some(isActive))
const reportErrors = computed(() => {
  const ext = reportRow.value?.ext
  if (!ext || !Array.isArray(ext.errors)) return []
  return ext.errors as Array<{ rowNo: number; errorMsg: string }>
})
const reportTitle = computed(() => (reportDiff.value ? '对账差异' : '批次报告'))
/** 本地分页切片：后端 limit 拉最近 200 条，前端按标准分页器翻页（不动后端契约） */
const pagedHistory = computed(() => {
  const start = (historyPage.value - 1) * historyPageSize.value
  return history.value.slice(start, start + historyPageSize.value)
})

function onOpened() {
  loadKeys()
  loadHistory()
  startPolling()
}

function onClosed() {
  stopPolling()
  selectedFile.value = null
  fileHint.value = ''
  parentBatchNo.value = ''
}

async function loadKeys() {
  try {
    keyOptions.value = await importKeys()
  } catch (e: any) {
    ElMessage.error(e?.message || '加载导入类型失败')
  }
}

function onKeyChange() {
  selectedFile.value = null
  fileHint.value = ''
}

async function onFileChange(file: any) {
  const raw = file.raw as File
  if (!raw) return
  if (!raw.name.toLowerCase().endsWith('.xlsx')) {
    ElMessage.error('仅支持 .xlsx 格式')
    return
  }
  if (raw.size > 5 * 1024 * 1024) {
    ElMessage.error('文件超过 5MB，请拆分后重试')
    return
  }
  selectedFile.value = raw
  // 轻量行数预估（读首行前的行数，仅提示不拦截，后端为准）
  try {
    const text = await raw.text()
    const lines = text.split('\n').filter((l) => l.trim()).length
    rowWarn.value = lines - 1 > 2000
    fileHint.value = rowWarn.value
      ? `预估 ${lines - 1} 行，超过 2000 行上限，建议拆分文件`
      : `${raw.name} · 预估 ${Math.max(lines - 1, 0)} 行`
  } catch {
    fileHint.value = raw.name
    rowWarn.value = false
  }
}

async function onSubmit() {
  if (!effectiveKey.value || !selectedFile.value) return
  submitting.value = true
  try {
    const res = await submitImport(effectiveKey.value, selectedFile.value, parentBatchNo.value || undefined)
    ElMessage.success(`已提交后台，批次号 #${res.batchNo}，可安全切走页面`)
    selectedFile.value = null
    fileHint.value = ''
    parentBatchNo.value = ''
    activeTab.value = 'history'
    await loadHistory()
    startPolling()
    emit('imported')
  } catch (e: any) {
    ElMessage.error(e?.message || '提交失败')
  } finally {
    submitting.value = false
  }
}

async function onDownloadTemplate() {
  if (!effectiveKey.value) return
  try {
    const blob = await downloadTemplate(effectiveKey.value)
    saveBlobAs(blob, `导入模板-${effectiveKey.value}.xlsx`)
  } catch (e: any) {
    ElMessage.error(e?.message || '下载模板失败')
  }
}

function onHistoryKeyChange() {
  historyPage.value = 1
  loadHistory()
}

async function loadHistory() {
  historyLoading.value = true
  try {
    history.value = await importHistory(props.fixedKey || historyKey.value || undefined, 200)
    if (historyPage.value > Math.max(1, Math.ceil(history.value.length / historyPageSize.value))) {
      historyPage.value = 1
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '加载历史失败')
  } finally {
    historyLoading.value = false
  }
}

function isActive(row: ImportBatch) {
  return row.activeFlag === 1 || row.status === 'QUEUED' || row.status === 'PROCESSING'
}

function isTerminal(s: string) {
  return ['SUCCESS', 'PARTIAL', 'FAILED', 'ARCHIVED'].includes(s)
}

let pollTimer: ReturnType<typeof setInterval> | null = null
function startPolling() {
  stopPolling()
  pollTimer = setInterval(() => {
    if (hasActive.value) loadHistory()
    else stopPolling()
  }, 3000)
}
function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

watch(() => hasActive.value, (active) => {
  if (active) startPolling()
  else stopPolling()
})

function keyName(key: string) {
  return keyOptions.value.find((k) => k.key === key)?.displayName || key
}

function statusType(status: string) {
  switch (status) {
    case 'SUCCESS': return 'success'
    case 'PARTIAL': return 'warning'
    case 'FAILED': return 'danger'
    case 'ARCHIVED': return 'info'
    case 'PROCESSING':
    case 'PARSING':
    case 'VALIDATING': return 'warning'
    default: return 'info'
  }
}

function statusLabel(status: string, phase: string) {
  const map: Record<string, string> = {
    QUEUED: '排队中', PROCESSING: `处理中(${phase})`, SUCCESS: '成功',
    PARTIAL: '部分成功', FAILED: '失败', ARCHIVED: '已归档',
  }
  return map[status] || status
}

function showReport(row: ImportBatch) {
  reportRow.value = row
  reportDiff.value = ''
  reportVisible.value = true
}

function showDiff(row: ImportBatch) {
  reportRow.value = row
  const s = row.ext?.reconcileSummary
  reportDiff.value = typeof s === 'string' ? s : '存在对账差异，请人工核对。'
  reportVisible.value = true
}

async function onDownloadErrors(row: ImportBatch) {
  try {
    const blob = await downloadErrors(row.id)
    saveBlobAs(blob, `错误行-${row.batchNo}.xlsx`)
  } catch (e: any) {
    ElMessage.error(e?.message || '下载错误行失败')
  }
}

function onRetry(row: ImportBatch) {
  parentBatchNo.value = row.batchNo
  selectedKey.value = row.importKey
  activeTab.value = 'create'
  ElMessage.info('已载入原失败批次，请选择修正后的 xlsx 重新提交')
}

async function onArchive(row: ImportBatch) {
  try {
    await archiveImport(row.id)
    ElMessage.success('已归档')
    loadHistory()
  } catch (e: any) {
    ElMessage.error(e?.message || '归档失败')
  }
}

onBeforeUnmount(stopPolling)
</script>

<style scoped>
.import-tabs :deep(.el-tabs__content) { padding-top: 12px; }
.tip-alert { margin-bottom: 16px; }
.create-form { max-width: 640px; }
.file-hint { margin-top: 6px; color: #909399; font-size: 12px; }
.file-hint.warn { color: #e6a23c; }
.form-help { margin-left: 12px; color: #909399; font-size: 12px; }
.history-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.polling-hint { color: #409eff; font-size: 12px; }
.history-table { width: 100%; }
.batch-no { font-family: monospace; font-weight: 600; }
.sub-line { color: #e6a23c; font-size: 11px; }
.muted { color: #c0c4cc; }
.report-diff { white-space: pre-wrap; line-height: 1.7; color: #606266; }
.error-list { margin-top: 10px; max-height: 320px; overflow: auto; background: #fef0f0; border-radius: 4px; padding: 8px 12px; }
.error-line { color: #f56c6c; font-size: 12px; line-height: 1.9; }
</style>
