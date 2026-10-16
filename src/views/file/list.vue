<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { UploadRequestOptions } from 'element-plus'
import { Delete, Download, Refresh, Search, Upload, View } from '@element-plus/icons-vue'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import { deleteFile, downloadFileUrl, listFiles, previewFileUrl, uploadFile } from '@/api/file'
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

// ===== 上传（自定义请求，Bearer 由拦截器注入）=====
const uploadVisible = ref(false)
const uploading = ref(false)
const uploadForm = reactive({ bizType: '', fileType: '' })

const openUpload = () => {
  uploadForm.bizType = ''
  uploadForm.fileType = ''
  uploadVisible.value = true
}

const handleUpload = async (options: UploadRequestOptions) => {
  const form = new FormData()
  form.append('file', options.file)
  if (uploadForm.bizType) form.append('bizType', uploadForm.bizType)
  if (uploadForm.fileType) form.append('fileType', uploadForm.fileType)
  uploading.value = true
  try {
    await uploadFile(form)
    ElMessage.success('上传成功')
    uploadVisible.value = false
    await reloadAfterMutation()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    uploading.value = false
  }
}

// ===== 下载 / 预览 / 删除 =====
const handleDownload = async (row: FileVO) => {
  try {
    const url = await downloadFileUrl(row.id)
    window.open(url, '_blank')
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

const handlePreview = async (row: FileVO) => {
  try {
    const url = await previewFileUrl(row.id)
    window.open(url, '_blank')
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

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
    <el-form :inline="true" :model="query" class="query-bar">
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
      <el-table-column prop="fileType" label="类型" width="120" />
      <el-table-column prop="bizType" label="业务类型" width="120">
        <template #default="{ row }">{{ row.bizType || 'common' }}</template>
      </el-table-column>
      <el-table-column label="大小" width="120" align="right">
        <template #default="{ row }">{{ formatSize(row.fileSize) }}</template>
      </el-table-column>
      <el-table-column label="存储" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="storageTagType(row.storageType)" size="small">{{ row.storageType || '—' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="uploaderName" label="上传人" width="120" />
      <el-table-column prop="createdAt" label="上传时间" width="170">
        <template #default="{ row }">{{ row.createdAt || '—' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">{{ row.status || '—' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right" align="center">
        <template #default="{ row }">
          <el-button link type="primary" size="small" :icon="View" @click="handlePreview(row)">预览</el-button>
          <el-button link type="primary" size="small" :icon="Download" @click="handleDownload(row)">下载</el-button>
          <el-button link type="danger" size="small" :icon="Delete" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
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
  <el-dialog v-model="uploadVisible" title="上传文件" width="520px">
    <el-upload
      drag
      :show-file-list="false"
      :http-request="handleUpload"
      :disabled="uploading"
      accept="*"
    >
      <el-icon class="el-icon--upload"><Upload /></el-icon>
      <div class="el-upload__text">将文件拖到此处，或<em>点击上传</em></div>
    </el-upload>
    <el-form :model="uploadForm" label-width="90px" style="margin-top: 16px">
      <el-form-item label="业务类型">
        <el-input v-model="uploadForm.bizType" placeholder="选填，如 invoice / receipt，空归 common" />
      </el-form-item>
      <el-form-item label="文件类型">
        <el-input v-model="uploadForm.fileType" placeholder="选填，字典 file_type，空用 ATTACHMENT" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="uploadVisible = false">关闭</el-button>
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
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
