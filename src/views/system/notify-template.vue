<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import { ElMessage } from 'element-plus'
import { pageTemplates, saveTemplate } from '@/api/notification'
import { useUserStore } from '@/stores/user'
import type { NotificationTemplate } from '@/types/notification'

defineOptions({ name: 'notify-template' })

const loading = ref(false)
const templates = ref<NotificationTemplate[]>([])

// 操作列隐藏：角色无 notify:template:edit 时整列收起（不再渲染空列/占位）
const userStore = useUserStore()
const hasNotifyTemplateEdit = computed(() => userStore.hasPermission('notify:template:edit'))

// ===== 筛选（模板编码 / 模板名称，模糊匹配）=====
const filters = reactive({
  code: '',
  templateName: '',
})

// ===== 分页（默认每页 10 条，与后端默认值一致，同 notify-record 规格）=====
const pageNum = ref(1)
const pageSize = ref(10)
const total = ref(0)

async function load() {
  loading.value = true
  try {
    const page = await pageTemplates({
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      code: filters.code.trim() || undefined,
      templateName: filters.templateName.trim() || undefined,
    })
    templates.value = page.records
    total.value = page.total
  } catch {
    ElMessage.error('加载模板失败')
  } finally {
    loading.value = false
  }
}

/** 查询：条件变化回到第一页（否则可能停在一个不存在的页码上） */
function handleQuery() {
  pageNum.value = 1
  load()
}

/** 切换每页条数：回到第一页再拉 */
function handleSizeChange() {
  pageNum.value = 1
  load()
}

function resetFilters() {
  filters.code = ''
  filters.templateName = ''
  pageNum.value = 1
  load()
}

onMounted(load)

// ===== 编辑弹层 =====
const dialogVisible = ref(false)
const saving = ref(false)
const form = reactive({
  id: 0,
  code: '',
  templateName: '',
  titleTpl: '',
  contentTpl: '',
  enabled: true,
})

function openEdit(row: NotificationTemplate) {
  form.id = row.id
  form.code = row.code
  form.templateName = row.templateName || ''
  form.titleTpl = row.titleTpl
  form.contentTpl = row.contentTpl
  form.enabled = row.enabled
  dialogVisible.value = true
}

async function submit() {
  if (!form.templateName.trim()) {
    ElMessage.warning('模板名称不能为空')
    return
  }
  if (!form.titleTpl.trim()) {
    ElMessage.warning('标题模板不能为空')
    return
  }
  if (!form.contentTpl.trim()) {
    ElMessage.warning('正文模板不能为空')
    return
  }
  saving.value = true
  try {
    await saveTemplate(form.id, {
      templateName: form.templateName.trim(),
      titleTpl: form.titleTpl,
      contentTpl: form.contentTpl,
      enabled: form.enabled,
    })
    ElMessage.success('已保存（新通知将使用新文案，历史通知不改写）')
    dialogVisible.value = false
    await load()
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="page-card">
    <div class="page-head">
      <div>
        <h3 class="page-title">通知模板</h3>
        <p class="page-desc">
          文案中的 &#123;&#123;变量&#125;&#125; 由后端按业务数据替换；修改只影响新通知，历史通知的成品文案不改写。
        </p>
      </div>
      <el-button @click="load">刷新</el-button>
    </div>

    <el-form :inline="true" :model="filters" class="query-bar" @submit.prevent>
      <el-form-item label="模板编码">
        <el-input
          v-model="filters.code"
          placeholder="模板编码"
          clearable
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="模板名称">
        <el-input
          v-model="filters.templateName"
          placeholder="模板名称"
          clearable
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="handleQuery">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </el-form-item>
    </el-form>

    <el-table v-loading="loading" :data="templates" border stripe>
      <el-table-column prop="code" label="模板编码" width="180" />
      <el-table-column prop="templateName" label="模板名称" width="140" show-overflow-tooltip />
      <el-table-column prop="titleTpl" label="标题模板" min-width="220" show-overflow-tooltip />
      <el-table-column prop="contentTpl" label="正文模板" min-width="280" show-overflow-tooltip />
      <el-table-column label="启用" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'" size="small">
            {{ row.enabled ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="170">
        <template #default="{ row }">
          {{ row.updatedAt ? row.updatedAt.replace('T', ' ') : '-' }}
        </template>
      </el-table-column>
      <el-table-column v-if="hasNotifyTemplateEdit" label="操作" width="90" align="center" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" v-has-perm="'notify:template:edit'" @click="openEdit(row)">编辑</el-button>
        </template>
      </el-table-column>
    <template #empty>
      <EmptyState />
    </template>
    </el-table>

    <!-- 标准分页器：默认每页 10 条，与后端默认值一致（同 notify-record 规格） -->
    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="pageNum"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @current-change="load"
        @size-change="handleSizeChange"
      />
    </div>

    <el-dialog v-model="dialogVisible" :title="`编辑模板：${form.code}`" width="640px">
      <el-form label-width="90px">
        <el-form-item label="模板名称">
          <el-input v-model="form.templateName" maxlength="64" show-word-limit placeholder="下拉与列表中展示的中文名" />
        </el-form-item>
        <el-form-item label="标题模板">
          <el-input v-model="form.titleTpl" maxlength="255" show-word-limit />
        </el-form-item>
        <el-form-item label="正文模板">
          <el-input
            v-model="form.contentTpl"
            type="textarea"
            :rows="5"
            maxlength="2000"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
          <span class="form-tip">停用后该编码的通知不再发送</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" v-has-perm="'notify:template:edit'" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-card {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;
}
.page-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}
.page-desc {
  margin: 6px 0 0;
  font-size: 12px;
  color: #909399;
}
.form-tip {
  margin-left: 10px;
  font-size: 12px;
  color: #909399;
}
</style>
