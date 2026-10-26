<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import { useRouter } from 'vue-router'
import type { FormInstance } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import DictSelect from '@/components/DictSelect.vue'
import {
  listDictTypes,
  createDictType,
  updateDictType,
  deleteDictType,
} from '@/api/dict'
import type { DictTypeFormData, DictTypeVO } from '@/types/dict'

// ===== 查询条件（顶部查询栏：字典名称/字典类型模糊、状态精确；空则不参与过滤）=====
const query = reactive({
  typeName: '',
  typeCode: '',
  status: '',
})

const handleQuery = () => {
  pageNum.value = 1
  loadTypes()
}

const resetQuery = () => {
  query.typeName = ''
  query.typeCode = ''
  query.status = ''
  pageNum.value = 1
  loadTypes()
}

// ===== 列表数据（分页：默认每页 10 条，el-pagination 标准分页器）=====
const loading = ref(false)
const typeList = ref<DictTypeVO[]>([])
const pageNum = ref(1)
const pageSize = ref(10)
const total = ref(0)

const loadTypes = async () => {
  loading.value = true
  try {
    const page = await listDictTypes(pageNum.value, pageSize.value, {
      typeName: query.typeName || undefined,
      typeCode: query.typeCode || undefined,
      status: query.status || undefined,
    })
    typeList.value = page.records
    total.value = page.total
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loading.value = false
  }
}

// 增删后刷新：若把当前页最后一条删空了且不在第一页，自动回退一页，避免停在空白页
const reloadAfterMutation = async () => {
  await loadTypes()
  if (typeList.value.length === 0 && pageNum.value > 1) {
    pageNum.value -= 1
    await loadTypes()
  }
}

// 切换每页条数时回到第一页（否则可能停在一个不存在的页码上）
const handleSizeChange = () => {
  pageNum.value = 1
  loadTypes()
}

// ===== 弹窗表单 =====
const dialogVisible = ref(false)
const dialogTitle = ref('新增字典类型')
const saving = ref(false)
const formRef = ref<FormInstance>()

const emptyForm = (): DictTypeFormData => ({
  typeCode: '',
  typeName: '',
  status: 'ENABLED',
  remark: '',
})

const form = reactive<DictTypeFormData>(emptyForm())

const rules = {
  typeCode: [
    { required: true, message: '请输入字典类型编码', trigger: 'blur' },
    {
      pattern: /^[a-z][a-z0-9_]*$/,
      message: '必须以小写字母开头，只能包含小写字母、数字、下划线',
      trigger: 'blur',
    },
  ],
  typeName: [{ required: true, message: '请输入字典类型名称', trigger: 'blur' }],
}

const openCreate = () => {
  Object.assign(form, emptyForm())
  // 同 menu.vue：显式清掉 empty 模板里没有的可选键，防止带着上次编辑的 id 走 update 分支
  form.id = undefined
  dialogTitle.value = '新增字典类型'
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

const openEdit = (row: DictTypeVO) => {
  form.id = row.id
  form.typeCode = row.typeCode
  form.typeName = row.typeName
  form.status = row.status
  form.remark = row.remark || ''
  dialogTitle.value = `修改字典类型 - ${row.typeName}`
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate()
  saving.value = true
  try {
    // 解构剥出 id：区分新增/修改分支，且不让 id 进请求体（后端从路径取）
    const { id, ...payload } = form
    if (id) {
      await updateDictType(id, payload)
      ElMessage.success('字典类型已保存')
    } else {
      await createDictType(payload)
      ElMessage.success('字典类型已创建')
    }
    dialogVisible.value = false
    await reloadAfterMutation()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    saving.value = false
  }
}

const handleDelete = async (row: DictTypeVO) => {
  try {
    await ElMessageBox.confirm(
      `确认删除字典类型「${row.typeName}」？删除后不可恢复。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return // 用户点了取消
  }
  try {
    await deleteDictType(row.id)
    ElMessage.success('删除成功')
    await reloadAfterMutation()
  } catch (e) {
    // 类型下有关联字典数据时后端拒删，message 即具体原因
    ElMessage.error((e as Error).message)
  }
}

const router = useRouter()
const openDictData = (row: DictTypeVO) => {
  router.push(`/system/dict-data?typeCode=${encodeURIComponent(row.typeCode)}`)
}

onMounted(loadTypes)
</script>

<template>
  <el-card shadow="never">
    <!-- 查询区 -->
    <el-form :inline="true" :model="query" class="query-bar" @submit.prevent>
      <el-form-item label="字典名称">
        <el-input v-model="query.typeName" placeholder="模糊匹配" clearable @keyup.enter="handleQuery" />
      </el-form-item>
      <el-form-item label="字典类型">
        <el-input v-model="query.typeCode" placeholder="模糊匹配" clearable @keyup.enter="handleQuery" />
      </el-form-item>
      <el-form-item label="状态">
        <!-- 状态：字典 common_status 消费（DictSelect 统一封装），不再硬编码 -->
        <DictSelect v-model="query.status" type-code="common_status" placeholder="全部" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="Search" @click="handleQuery">查询</el-button>
        <el-button :icon="Refresh" @click="resetQuery">重置</el-button>
      </el-form-item>
    </el-form>

    <div class="toolbar">
      <el-button type="primary" :icon="Plus" @click="openCreate">新增字典类型</el-button>
      <el-button :icon="Refresh" @click="loadTypes">刷新</el-button>
    </div>

    <el-table v-loading="loading" :data="typeList" border>
      <el-table-column prop="typeName" label="字典名称" min-width="180" />
      <el-table-column prop="typeCode" label="字典类型" min-width="180" />
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 'ENABLED' ? 'success' : 'danger'" size="small">
            {{ row.status === 'ENABLED' ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="200">
        <template #default="{ row }">{{ row.remark || '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right" align="center">
        <template #default="{ row }">
          <el-button link type="primary" size="small" :icon="Search" @click="openDictData(row)">
            字典数据
          </el-button>
          <el-button link type="primary" size="small" @click="openEdit(row)">修改</el-button>
          <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
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
        @current-change="loadTypes"
        @size-change="handleSizeChange"
      />
    </div>
  </el-card>

  <!-- 新增 / 修改弹窗 -->
  <el-dialog v-model="dialogVisible" :title="dialogTitle" width="640px">
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" @submit.prevent>
      <el-form-item label="字典名称" prop="typeName">
        <el-input v-model="form.typeName" placeholder="请输入字典类型名称" maxlength="64" show-word-limit />
      </el-form-item>
      <el-form-item label="字典类型" prop="typeCode">
        <el-input
          v-model="form.typeCode"
          placeholder="如 common_status（创建后不可修改）"
          :disabled="!!form.id"
          maxlength="64"
        />
        <span v-if="form.id" class="form-tip">创建后不可修改，避免存量字典数据失去关联</span>
      </el-form-item>
      <el-form-item label="状态" prop="status">
        <el-radio-group v-model="form.status">
          <el-radio label="ENABLED">启用</el-radio>
          <el-radio label="DISABLED">停用</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="备注" prop="remark">
        <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="选填" maxlength="512" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="handleSubmit">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
/* 查询区：inline 表单 + 底部间距，与 user.vue / role.vue 同口径；控件宽度由
   pages.css 统一为 200px（.query-bar .el-input/.el-select/.el-tree-select） */
.query-bar {
  margin-bottom: 4px;
}
/* 与 system/menu.vue 保持同一套工具栏规格：flex + gap 0（间距由 EP 按钮
   自带 margin-left 提供，叠 gap 会双倍），下边距 16px */
.toolbar {
  display: flex;
  gap: 0;
  margin-bottom: 16px;
}
/* .pagination-bar 已上提到 styles/pages.css 全局（2026-10-26），本文件不再留本地副本 */
.form-tip {
  margin-left: 12px;
  font-size: 12px;
  color: #909399;
}
</style>
