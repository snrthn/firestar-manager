<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import type { UploadUserFile } from 'element-plus'
import { Delete, Download, Edit, Refresh, Search, Upload, View } from '@element-plus/icons-vue'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import FilePreviewDialog from '@/components/FilePreviewDialog.vue'
import { deleteFile, downloadFileUrl, listFiles, updateFileAlias, uploadFile } from '@/api/file'
import { downloadViaBackend } from '@/utils/fileDownload'
import { loadDictOptions, useDictLabels, type DictOption } from '@/composables/useDict'
import { formatDateTime } from '@/utils/datetime'
import type { FileVO } from '@/types/file'

// ===== 查询条件 =====
const query = reactive({ keyword: '' })
const handleQuery = () => {
  pageNum.value = 1
  loadFiles()
}
const resetQuery = () => {
  query.keyword = ''
  pageNum.value = 1
  loadFiles()
}

// ===== 列表 =====
const loading = ref(false)
const fileList = ref<FileVO[]>([])
const pageNum = ref(1)
const pageSize = ref(10)
const total = ref(0)

const loadFiles = async () => {
  loading.value = true
  try {
    const page = await listFiles(pageNum.value, pageSize.value, {
      keyword: query.keyword || undefined,
    })
    fileList.value = page.records
    total.value = page.total
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loading.value = false
  }
}

const reloadAfterMutation = async () => {
  await loadFiles()
  if (fileList.value.length === 0 && pageNum.value > 1) {
    pageNum.value -= 1
    await loadFiles()
  }
}

const handleSizeChange = () => {
  pageNum.value = 1
  loadFiles()
}

// 文件大小格式化
function formatSize(bytes?: number | null) {
  if (bytes == null) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(2)} ${units[i]}`
}

// 列表展示标签：类型/业务类型/存储/状态全部走字典（file_type / file_biz_type /
// storage_type / file_status），不再裸显英文域值；未命中兜底显示原始值。
const { label: fileTypeLabel } = useDictLabels('file_type')
const { label: bizTypeLabel } = useDictLabels('file_biz_type')
const { label: storageTypeLabel } = useDictLabels('storage_type')
const { label: fileStatusLabel } = useDictLabels('file_status')

function storageTagType(t?: string | null) {
  if (t === 'OSS') return 'success'
  if (t === 'LOCAL') return 'info'
  return 'info'
}

function statusTagType(s?: string | null) {
  if (s === 'NORMAL') return 'success'
  if (s === 'ARCHIVED') return 'warning'
  return 'danger'
}

// ===== 上传（手动确认：选文件只暂存，点「确认上传」才提交）=====
// 背景（2026-10-16 虎哥反馈）：auto-upload 模式下选好文件的瞬间就自动上传并关窗，
// 用户根本来不及选业务类型/文件类型/别名，交互割裂。
// 现在改为：auto-upload=false，on-change 只暂存（单文件，重复选自动替换），
// 底部「确认上传」统一提交——表单三选一可以先选后传，也可以传后再在列表里编辑别名。
const uploadVisible = ref(false)
const uploading = ref(false)
const uploadForm = reactive({ bizType: '', fileType: '', alias: '' })
const uploadFileList = ref<UploadUserFile[]>([])

// 业务类型 / 文件类型：字典驱动（useDict 消费样板，同 menu.vue 菜单类型）。
// 字典不可用时回退内置最小集，保证弹窗永远可传；「不选」即后端默认（common / ATTACHMENT）。
const bizTypeOptions = ref<DictOption[]>([])
const fileTypeOptions = ref<DictOption[]>([])

const loadUploadDictOptions = async () => {
  const [biz, type] = await Promise.all([loadDictOptions('file_biz_type'), loadDictOptions('file_type')])
  bizTypeOptions.value = biz.length ? biz : [{ value: 'common', label: '通用', style: null }]
  fileTypeOptions.value = type.length ? type : [{ value: 'ATTACHMENT', label: '附件', style: null }]
}

const openUpload = () => {
  uploadForm.bizType = ''
  uploadForm.fileType = ''
  uploadForm.alias = ''
  uploadFileList.value = []
  loadUploadDictOptions()
  uploadVisible.value = true
}

/** 选中文件：只暂存不提交（单文件，后选替换先选） */
const onPickFile = (_uploadFile: UploadUserFile, uploadFiles: UploadUserFile[]) => {
  uploadFileList.value = uploadFiles.slice(-1)
}

/** 移除已选文件：同步暂存列表 */
const onRemoveFile = (_uploadFile: UploadUserFile, uploadFiles: UploadUserFile[]) => {
  uploadFileList.value = uploadFiles
}

/** 确认上传：带上业务/文件类型/别名一起提交 */
const submitUpload = async () => {
  const picked = uploadFileList.value[0]
  if (!picked || !picked.raw) {
    ElMessage.warning('请先选择要上传的文件')
    return
  }
  const form = new FormData()
  form.append('file', picked.raw)
  if (uploadForm.bizType) form.append('bizType', uploadForm.bizType)
  if (uploadForm.fileType) form.append('fileType', uploadForm.fileType)
  if (uploadForm.alias.trim()) form.append('alias', uploadForm.alias.trim())
  uploading.value = true
  try {
    await uploadFile(form)
    ElMessage.success('上传成功')
    uploadFileList.value = []
    uploadVisible.value = false
    await reloadAfterMutation()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    uploading.value = false
  }
}

// ===== 下载 / 预览 / 删除 =====
// 下载/预览统一「取字节 → 本地落地」：不再 window.open 新页签（本地模式相对路径不带 JWT 会 403），
// OSS 签名 URL 免鉴权直连。分流逻辑在 utils/fileDownload 与 FilePreviewDialog。
const handleDownload = async (row: FileVO) => {
  try {
    const url = await downloadFileUrl(row.id)
    await downloadViaBackend(url, row.alias || row.originalName || row.fileName || 'download')
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

const previewVisible = ref(false)
const previewRow = ref<FileVO | null>(null)

const handlePreview = (row: FileVO) => {
  previewRow.value = row
  previewVisible.value = true
}

// ===== 别名编辑（V23：只在文件管理处维护）=====
const aliasVisible = ref(false)
const aliasSaving = ref(false)
const aliasForm = reactive({ id: 0, alias: '' })

const openAliasEditor = (row: FileVO) => {
  aliasForm.id = row.id
  aliasForm.alias = row.alias || ''
  aliasVisible.value = true
}

const saveAlias = async () => {
  aliasSaving.value = true
  try {
    await updateFileAlias(aliasForm.id, aliasForm.alias.trim())
    ElMessage.success('别名已更新')
    aliasVisible.value = false
    await loadFiles()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    aliasSaving.value = false
  }
}

// ===== 复制资源链接 =====
// 2026-10-16 虎哥要求：复制链接操作频次不高，从列表操作列收敛到预览弹窗内
// （见 components/FilePreviewDialog.vue 的「复制链接」按钮），列表只留高频操作。

const handleDelete = async (row: FileVO) => {
  try {
    await ElMessageBox.confirm(
      `确认删除文件「${row.originalName || row.fileName}」？仅标记删除，记录与文件仍保留。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await deleteFile(row.id)
    ElMessage.success('删除成功')
    await reloadAfterMutation()
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

onMounted(loadFiles)
</script>

<template>
  <el-card shadow="never">
    <el-form :inline="true" :model="query" class="query-bar" @submit.prevent>
      <el-form-item label="文件名 / 业务">
        <el-input v-model="query.keyword" placeholder="模糊匹配" clearable @keyup.enter="handleQuery" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
        <el-button :icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <div class="toolbar">
      <el-button type="primary" :icon="Upload" @click="openUpload">上传文件</el-button>
      <el-button :icon="Refresh" @click="loadFiles">刷新</el-button>
    </div>

    <el-table v-loading="loading" :data="fileList" border>
      <el-table-column prop="originalName" label="文件名" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">{{ row.originalName || row.fileName || '—' }}</template>
      </el-table-column>
      <el-table-column label="别名" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">{{ row.alias || '—' }}</template>
      </el-table-column>
      <el-table-column prop="fileType" label="类型" width="120">
        <template #default="{ row }">{{ fileTypeLabel(row.fileType) }}</template>
      </el-table-column>
      <el-table-column prop="bizType" label="业务类型" width="120">
        <template #default="{ row }">{{ bizTypeLabel(row.bizType || 'common') }}</template>
      </el-table-column>
      <el-table-column label="大小" width="120" align="right">
        <template #default="{ row }">{{ formatSize(row.fileSize) }}</template>
      </el-table-column>
      <el-table-column label="存储" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="storageTagType(row.storageType)" size="small">{{ storageTypeLabel(row.storageType) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="uploaderName" label="上传人" width="120" />
      <el-table-column prop="createdAt" label="上传时间" width="170">
        <template #default="{ row }">{{ formatDateTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">{{ fileStatusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="260" fixed="right" align="center">
        <template #default="{ row }">
          <el-button link type="primary" size="small" :icon="View" @click="handlePreview(row)">预览</el-button>
          <el-button link type="primary" size="small" :icon="Download" @click="handleDownload(row)">下载</el-button>
          <el-button link type="primary" size="small" :icon="Edit" @click="openAliasEditor(row)">别名</el-button>
          <el-button link type="danger" size="small" :icon="Delete" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    <template #empty>
      <EmptyState />
    </template>
    </el-table>

    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="pageNum"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @current-change="loadFiles"
        @size-change="handleSizeChange"
      />
    </div>
  </el-card>

  <!-- 上传弹窗 -->
  <!-- accept 不设值：EP 拖拽区按 accept 逐项匹配，"*" 无法匹配任何 MIME，
       会导致「点击能传、拖拽全被过滤」（2026-10-16 虎哥实测），留空即放开全部类型 -->
  <!-- auto-upload=false：选文件只暂存，点「确认上传」才提交——
       避免选完文件的瞬间就自动上传关窗、来不及填业务/类型/别名 -->
  <el-dialog v-model="uploadVisible" title="上传文件" width="480px">
    <el-upload
      drag
      :auto-upload="false"
      :show-file-list="true"
      :file-list="uploadFileList"
      :on-change="onPickFile"
      :on-remove="onRemoveFile"
      :disabled="uploading"
    >
      <el-icon class="el-icon--upload"><Upload /></el-icon>
      <div class="el-upload__text">将文件拖到此处，或<em>点击选择</em></div>
    </el-upload>
    <el-form :model="uploadForm" label-width="90px" style="margin-top: 16px" @submit.prevent>
      <el-form-item label="业务类型">
        <el-select v-model="uploadForm.bizType" placeholder="默认归 common" clearable class="w-full">
          <el-option v-for="o in bizTypeOptions" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="文件类型">
        <el-select v-model="uploadForm.fileType" placeholder="默认 ATTACHMENT（附件）" clearable class="w-full">
          <el-option v-for="o in fileTypeOptions" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
      </el-form-item>
      <el-form-item label="别名">
        <el-input v-model="uploadForm.alias" placeholder="选填，如「10 月报销发票」；留空显示原始文件名" maxlength="255" clearable />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="uploadVisible = false">取消</el-button>
      <el-button type="primary" :loading="uploading" :disabled="uploadFileList.length === 0" @click="submitUpload">
        确认上传
      </el-button>
    </template>
  </el-dialog>

  <!-- 别名编辑（V23：别名只在文件管理处维护，上传时填或在这里改） -->
  <el-dialog v-model="aliasVisible" title="编辑别名" width="480px">
    <el-form :model="aliasForm" label-width="80px" @submit.prevent>
      <el-form-item label="别名">
        <el-input
          v-model="aliasForm.alias"
          placeholder="选填，如「10 月报销发票」；清空则回退显示原始文件名"
          maxlength="255"
          clearable
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="aliasVisible = false">取消</el-button>
      <el-button type="primary" :loading="aliasSaving" @click="saveAlias">保存</el-button>
    </template>
  </el-dialog>

  <!-- 预览弹窗（③：不再 window.open 新页签；图片 inline / PDF iframe / 其他引导下载） -->
  <FilePreviewDialog v-model="previewVisible" :file="previewRow" />
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
</style>
