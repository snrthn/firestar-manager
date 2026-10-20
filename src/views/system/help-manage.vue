<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import {
  pageHelpArticles,
  createHelpArticle,
  updateHelpArticle,
  deleteHelpArticle,
} from '@/api/help'
import type { HelpArticle } from '@/types/feedback'
import RichEditor from '@/components/RichEditor.vue'
import DictSelect from '@/components/DictSelect.vue'
import { useDictLabels } from '@/composables/useDict'
import { formatDateTime } from '@/utils/datetime'

/**
 * 帮助中心维护页（隐藏菜单 /system/help-manage，perm=system:help，管理员）。
 * FAQ 条目 CRUD：富文本编辑 + 分类 + 排序 + 启停；阅读页在 /help。
 * 分类走字典 help_category（V35），中文名在字典维护页改即可，不用动数据。
 */
// 分类字典反查：列表列展示中文标签
const { label: categoryLabel } = useDictLabels('help_category')
const rows = ref<HelpArticle[]>([])
const total = ref(0)
const loading = ref(false)
const query = reactive({ pageNum: 1, pageSize: 10, keyword: '' })

async function load() {
  loading.value = true
  try {
    const page = await pageHelpArticles({
      pageNum: query.pageNum,
      pageSize: query.pageSize,
      keyword: query.keyword || undefined,
    })
    rows.value = page.records || []
    total.value = Number(page.total || 0)
  } catch {
    ElMessage.error('加载帮助文章失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)

// 切换每页条数回到第一页（同 user.vue 口径，否则可能停在不存在的页码上）
function handleSizeChange() {
  query.pageNum = 1
  load()
}

// ===== 编辑弹窗 =====
const dialog = ref(false)
const saving = ref(false)
const editingId = ref<number | null>(null)
/** 新建分类默认值 = 字典 help_category 首项（改字典请同步此处） */
const DEFAULT_CATEGORY = 'ACCOUNT'
const form = reactive({
  title: '',
  content: '',
  category: DEFAULT_CATEGORY,
  sortNo: 0,
  status: 'ENABLED',
})

function openCreate() {
  editingId.value = null
  form.title = ''
  form.content = ''
  form.category = DEFAULT_CATEGORY
  form.sortNo = 0
  form.status = 'ENABLED'
  dialog.value = true
}

function openEdit(row: HelpArticle) {
  editingId.value = row.id
  form.title = row.title
  form.content = row.content
  form.category = row.category
  form.sortNo = row.sortNo
  form.status = row.status
  dialog.value = true
}

async function save() {
  if (!form.category) return ElMessage.warning('请选择分类')
  if (!form.title.trim()) return ElMessage.warning('请填写标题')
  if (!form.content.trim()) return ElMessage.warning('请填写正文')
  saving.value = true
  try {
    // 兜底：历史数据 category 可能为空（字典化前的中文/空值）
    const payload = { ...form, category: form.category || 'OTHER' }
    if (editingId.value == null) {
      await createHelpArticle(payload)
      ElMessage.success('已创建')
    } else {
      await updateHelpArticle(editingId.value, payload)
      ElMessage.success('已保存')
    }
    dialog.value = false
    load()
  } catch {
    ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

async function toggleStatus(row: HelpArticle) {
  const next = row.status === 'ENABLED' ? 'DISABLED' : 'ENABLED'
  const actionText = next === 'ENABLED' ? '启用' : '停用'
  // 二次确认（虎哥 2026-10-21）：停用会让条目从阅读页消失，误点代价高
  try {
    await ElMessageBox.confirm(
      next === 'DISABLED'
        ? `确定停用「${row.title}」吗？停用后帮助中心阅读页将不再展示该条目。`
        : `确定重新启用「${row.title}」吗？启用后将在帮助中心阅读页恢复展示。`,
      `${actionText}确认`,
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await updateHelpArticle(row.id, {
      title: row.title,
      content: row.content,
      category: row.category,
      sortNo: row.sortNo,
      status: next,
    })
    ElMessage.success(`已${actionText}`)
    load()
  } catch {
    ElMessage.error('操作失败')
  }
}

async function remove(row: HelpArticle) {
  try {
    await ElMessageBox.confirm(`确定删除「${row.title}」吗？`, '删除确认', { type: 'warning' })
  } catch {
    return
  }
  try {
    await deleteHelpArticle(row.id)
    ElMessage.success('已删除')
    load()
  } catch {
    ElMessage.error('删除失败')
  }
}
</script>

<template>
  <div class="help-manage">
    <div class="toolbar">
      <el-input
        v-model="query.keyword"
        placeholder="按标题搜索"
        clearable
        style="width: 220px"
        @keyup.enter="((query.pageNum = 1), load())"
        @clear="((query.pageNum = 1), load())"
      />
      <el-button @click="((query.pageNum = 1), load())">查询</el-button>
      <div class="spacer" />
      <el-button type="primary" @click="openCreate">新建条目</el-button>
    </div>

    <el-table v-loading="loading" :data="rows" border stripe>
      <el-table-column prop="sortNo" label="排序" width="70" align="center" />
      <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
      <el-table-column prop="category" label="分类" width="120">
        <template #default="{ row }">{{ categoryLabel(row.category) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 'ENABLED' ? 'success' : 'info'">
            {{ row.status === 'ENABLED' ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="updatedAt" label="更新时间" width="170">
        <template #default="{ row }">{{ formatDateTime(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180" align="center">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link :type="row.status === 'ENABLED' ? 'warning' : 'success'" @click="toggleStatus(row)">
            {{ row.status === 'ENABLED' ? '停用' : '启用' }}
          </el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 标准分页器（与 user/role/dict 等列表页同款，虎哥 2026-10-21 统一） -->
    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="query.pageNum"
        v-model:page-size="query.pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @current-change="load"
        @size-change="handleSizeChange"
      />
    </div>

    <el-dialog
      v-model="dialog"
      :title="editingId == null ? '新建帮助条目' : '编辑帮助条目'"
      width="680px"
      append-to-body
    >
      <el-form label-width="70px">
        <!-- 分类在前且必选（虎哥 2026-10-21）：先归类再写标题，避免漏选 -->
        <el-form-item label="分类" required>
          <!-- 字典 help_category（V35）：选项在【系统管理 → 字典管理】维护，不用改代码 -->
          <DictSelect
            v-model="form.category"
            type-code="help_category"
            placeholder="请选择分类"
            :clearable="false"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="标题" required>
          <el-input v-model="form.title" maxlength="100" placeholder="一句话描述常见问题" />
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="form.sortNo" :min="0" :max="9999" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio value="ENABLED">启用</el-radio>
            <el-radio value="DISABLED">停用</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="正文" required>
          <RichEditor v-model="form.content" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.help-manage {
  padding: 16px;
  /* 内容容器白色背景（与问题反馈页同款，虎哥 2026-10-21） */
  background: #fff;
  border-radius: 8px;
  min-height: calc(100vh - var(--fs-header-height, 56px) - 68px);
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.spacer {
  flex: 1;
}
/* 分页条：与 user/role/dict 等列表页同款 */
.pagination-bar {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
</style>
