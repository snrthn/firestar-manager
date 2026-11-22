<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useUserStore } from '@/stores/user'
import EmptyState from '@/components/EmptyState.vue'
import { useRoute, useRouter } from 'vue-router'
import type { FormInstance } from 'element-plus'
import { ArrowLeft, Plus, Refresh } from '@element-plus/icons-vue'
// 函数式组件按项目约定 deep-import（顶层入口会把全库拖进首包，见 main.ts 注释）
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import {
  listAllDictTypes,
  listDictData,
  createDictData,
  updateDictData,
  deleteDictData,
} from '@/api/dict'
import type { DictDataFormData, DictDataVO } from '@/types/dict'
import { loadDictOptions, type DictOption } from '@/composables/useDict'
const userStore = useUserStore()
const opVisible = computed(() => userStore.hasAnyPerm(['dict:data:delete', 'dict:data:edit']))

// ===== 上下文：所属字典类型（路由 query typeCode，菜单表里该页 visible=0 不在侧栏显示）=====
const route = useRoute()
const router = useRouter()
const typeCode = computed(() => String(route.query.typeCode || ''))
const typeName = ref('')

// ===== 列表数据（分页：默认每页 10 条，el-pagination 标准分页器）=====
const loading = ref(false)
const dataList = ref<DictDataVO[]>([])
const pageNum = ref(1)
const pageSize = ref(10)
const total = ref(0)

// 类型名称只需在 typeCode 变化时拉一次，不必跟着翻页反复拉（走全量接口，
// 管理页的 type/list 已分页，这里只需要按 typeCode 反查一个名称）
const loadTypeName = async () => {
  if (!typeCode.value) {
    typeName.value = ''
    return
  }
  try {
    const types = await listAllDictTypes()
    const found = types.find((t) => t.typeCode === typeCode.value)
    typeName.value = found ? found.typeName : ''
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

const loadData = async () => {
  if (!typeCode.value) {
    dataList.value = []
    total.value = 0
    return
  }
  loading.value = true
  try {
    const page = await listDictData(typeCode.value, pageNum.value, pageSize.value)
    dataList.value = page.records
    total.value = page.total
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    loading.value = false
  }
}

const reloadAll = () => {
  loadTypeName()
  loadData()
}

// 增删改后刷新：若把当前页最后一条删空了且不在第一页，自动回退一页，避免停在空白页
const reloadAfterMutation = async () => {
  await loadData()
  if (dataList.value.length === 0 && pageNum.value > 1) {
    pageNum.value -= 1
    await loadData()
  }
}

// 切换每页条数时回到第一页（否则可能停在一个不存在的页码上）
const handleSizeChange = () => {
  pageNum.value = 1
  loadData()
}

// ===== 弹窗表单 =====
const dialogVisible = ref(false)
const dialogTitle = ref('新增字典数据')
const saving = ref(false)
const formRef = ref<FormInstance>()

// 样式下拉：字典 dict_style 消费（V22 起字典补齐后端白名单 5 项
// primary/success/info/warning/danger）——以字典作为唯一数据源，
// 不再与后端 DictServiceImpl.DICT_STYLES 白名单双轨维护。
const styleOptions = ref<DictOption[]>([])
loadDictOptions('dict_style').then((opts) => {
  styleOptions.value = opts
})

const emptyForm = (): DictDataFormData => ({
  // typeCode 由页面上下文固定带入；修改时后端忽略请求体中的该字段
  typeCode: typeCode.value,
  dictLabel: '',
  dictValue: '',
  sortNo: 0,
  style: '',
  isDefault: 0,
  status: 'ENABLED',
  remark: '',
})

const form = reactive<DictDataFormData>(emptyForm())

const rules = {
  dictLabel: [{ required: true, message: '请输入字典标签', trigger: 'blur' }],
  dictValue: [{ required: true, message: '请输入字典键值', trigger: 'blur' }],
}

const openCreate = () => {
  Object.assign(form, emptyForm())
  // 同 menu.vue：显式清掉 empty 模板里没有的可选键，防止带着上次编辑的 id 走 update 分支
  form.id = undefined
  dialogTitle.value = '新增字典数据'
  dialogVisible.value = true
  nextTick(() => formRef.value?.clearValidate())
}

const openEdit = (row: DictDataVO) => {
  form.id = row.id
  form.typeCode = row.typeCode
  form.dictLabel = row.dictLabel
  form.dictValue = row.dictValue
  form.sortNo = row.sortNo
  form.style = row.style || ''
  form.isDefault = row.isDefault
  form.status = row.status
  form.remark = row.remark || ''
  dialogTitle.value = `修改字典数据 - ${row.dictLabel}`
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
      await updateDictData(id, payload)
      ElMessage.success('字典数据已保存')
    } else {
      await createDictData(payload)
      ElMessage.success('字典数据已创建')
    }
    dialogVisible.value = false
    await reloadAfterMutation()
  } catch (e) {
    ElMessage.error((e as Error).message)
  } finally {
    saving.value = false
  }
}

const handleDelete = async (row: DictDataVO) => {
  try {
    await ElMessageBox.confirm(
      `确认删除字典数据「${row.dictLabel}」？删除后不可恢复。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return // 用户点了取消
  }
  try {
    await deleteDictData(row.id)
    ElMessage.success('删除成功')
    await reloadAfterMutation()
  } catch (e) {
    ElMessage.error((e as Error).message)
  }
}

// 同一浏览器标签内从一个类型切到另一个（理论上入口只有类型页，兜底）
watch(typeCode, reloadAll)
onMounted(reloadAll)
</script>

<template>
  <el-card shadow="never">
    <!-- 类型上下文条：名称 + 编码 + 返回 -->
    <div class="dict-header">
      <div class="dict-header-info">
        <span class="dict-title">字典数据</span>
        <el-tag size="small" type="info">{{ typeName || typeCode || '未知类型' }}</el-tag>
        <span class="dict-code">{{ typeCode }}</span>
      </div>
      <el-button :icon="ArrowLeft" @click="router.push('/system/dict')">返回字典类型</el-button>
    </div>

    <el-alert
      v-if="!typeCode"
      title="缺少字典类型参数"
      type="warning"
      show-icon
      :closable="false"
      description="请从「字典管理」页的「字典数据」按钮进入。"
      class="missing-tip"
    />

    <div class="toolbar">
      <el-button type="primary" :icon="Plus" :disabled="!typeCode" v-has-perm="'dict:data:create'" @click="openCreate">新增字典数据</el-button>
      <el-button :icon="Refresh" :disabled="!typeCode" @click="reloadAll">刷新</el-button>
    </div>

    <el-table v-loading="loading" :data="dataList" border>
      <el-table-column prop="dictLabel" label="字典标签" min-width="160" />
      <el-table-column prop="dictValue" label="字典键值" min-width="160" />
      <el-table-column prop="sortNo" label="排序" width="90" align="center" />
      <el-table-column label="样式" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="row.style || 'info'" size="small">{{ row.style || '—' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="默认" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.isDefault === 1 ? 'warning' : 'info'" size="small">
            {{ row.isDefault === 1 ? '默认' : '—' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 'ENABLED' ? 'success' : 'danger'" size="small">
            {{ row.status === 'ENABLED' ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">{{ row.remark || '—' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right" align="center" v-if="opVisible">
        <template #default="{ row }">
          <el-button link type="primary" size="small" v-has-perm="'dict:data:edit'" @click="openEdit(row)">修改</el-button>
          <el-button link type="danger" size="small" v-has-perm="'dict:data:delete'" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    <template #empty>
      <EmptyState description="暂无字典数据" />
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
        @current-change="loadData"
        @size-change="handleSizeChange"
      />
    </div>
  </el-card>

  <!-- 新增 / 修改弹窗 -->
  <el-dialog v-model="dialogVisible" :title="dialogTitle" width="640px">
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" @submit.prevent>
      <el-form-item label="字典标签" prop="dictLabel">
        <el-input v-model="form.dictLabel" placeholder="请输入字典标签（展示名）" maxlength="64" show-word-limit />
      </el-form-item>
      <el-form-item label="字典键值" prop="dictValue">
        <el-input v-model="form.dictValue" placeholder="请输入字典键值（存库值）" maxlength="64" />
      </el-form-item>
      <el-form-item label="显示排序" prop="sortNo">
        <el-input-number v-model="form.sortNo" :min="0" :max="9999" controls-position="right" />
        <span class="form-tip">同级内数字越小越靠前</span>
      </el-form-item>
      <el-form-item label="样式" prop="style">
        <el-select v-model="form.style" placeholder="选填，控制前端标签颜色" clearable class="w-full">
          <el-option v-for="opt in styleOptions" :key="opt.value" :label="opt.label" :value="opt.value">
            <el-tag :type="opt.value" size="small">{{ opt.label }}</el-tag>
          </el-option>
        </el-select>
      </el-form-item>
      <el-form-item label="是否默认" prop="isDefault">
        <el-radio-group v-model="form.isDefault">
          <el-radio :label="1">是</el-radio>
          <el-radio :label="0">否</el-radio>
        </el-radio-group>
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
      <el-button type="primary" :loading="saving" v-has-perm="'dict:data:create'" @click="handleSubmit">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
/* 与 system/menu.vue / system/dict.vue 保持同一套工具栏规格 */
.dict-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.dict-header-info {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.dict-title {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
}
.dict-code {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 12px;
  color: #909399;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.missing-tip {
  margin-bottom: 16px;
}
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
.w-full {
  width: 100%;
}
</style>
