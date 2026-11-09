<script setup lang="ts">
/**
 * AI 中心 → 知识库（V207 菜单 9503，/system/knowledge，component=system/knowledge）
 *
 * ⚠️ 当前是「步骤 4 能力落地页 + V208 树形结构（方案 A）」，**后端 KB CRUD 接口尚未实现**：
 *    V206/V207/V208 只落了字典、三张表、树形四列与菜单权限，Controller + Service 属于
 *    步骤 4.5。因此本页节点骨架（MOCK_NODES）与文档正文（docs）都是本地内存态，
 *    保存只做校验不持久化，发布按钮禁用。api/kb.ts 已把接口契约钉死，
 *    接真实后端时把 loadNodes() 换成 listKbNodes() 即可，不用改组件。
 *
 * 加载策略（对齐飞书 wiki node list）：首屏一次拉全量轻量骨架（不含 content_md），
 * 点开文档才拉正文；节点数 > 2000 时由 isLazyRequired 提示切为按 parentId 懒加载。
 *
 * 界面约定（2026-11-09）：
 *   ① 外层 .view-wrap 已有 --fs-content-padding:16px，本页不再叠 padding；
 *   ② 目录树与内容区等高撑满，结构检查改弹窗（DEBUG-ONLY，可整体移除不影响布局）；
 *   ③ 顶部只留一个标题输入框，摘要移入「文档属性」弹窗，header 拆两行；
 *   ④ 文档属性在标题行、发布在工具栏行（2026-11-09 复核后再次对调）；
 *      标题聚焦显示正常四边框；
 *   ⑤ 编辑/预览改分段控件；树节点支持 inline 重命名（新建即命名）。
 *
 * 本页可实际验证：
 *   ① 树形：层级展开、搜索保留父链、拖拽防环、新建文档/文件夹（自动命名）、
 *      双击或 hover 菜单改名、面包屑；
 *   ② MarkdownEditor：工具栏编辑、图片上传走 /files/upload；
 *   ③ MarkdownView：禁 raw HTML、外链图片被拦、file: 换 JWT blob URL；
 *   ④ validateMarkdown / collectFileRefs / extractHeadings：结构检查弹窗内查看。
 */
import { computed, defineAsyncComponent, nextTick, reactive, ref } from 'vue'
import { Plus, Delete, EditPen, Folder, Search } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import MarkdownView from '@/components/MarkdownView.vue'
import type { KbNode, KbNodeType } from '@/api/kb'
import {
  buildKbTree,
  canMoveKbNode,
  computeKbPath,
  filterKbTree,
  findKbNode,
  getKbAncestorTitles,
  isLazyRequired,
  nextSortNo,
} from '@/utils/kbTree'
import { validateMarkdown, collectFileRefs, extractHeadings } from '@/utils/markdown'

// ⚠️ 编辑器必须异步加载：md-editor-v3 把 CodeMirror / mermaid / katex 的引用
//    带进编辑器 chunk（noMermaid/noKatex 只是运行时开关，tree-shake 不掉），实测
//    静态引入时 knowledge 页 chunk 达 1.01MB。异步化后页面 109.59 kB，
//    编辑器独立 905 kB 仅编辑态加载。runtime-only Vue 不能用 template 选项。
const MarkdownEditor = defineAsyncComponent(() => import('@/components/MarkdownEditor.vue'))

interface KbDocItem {
  id: number
  title: string
  summary: string
  contentMd: string
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  version: number
}

/** el-tree 实例的最小接口，避免引入 element-plus 深层类型 */
interface TreeExpose {
  getNode(id: number): { expanded: boolean } | null
}
interface TreeDropNode {
  data: KbNode
}

const SAMPLE = [
  '# 差旅费报销制度',
  '',
  '> 本文档用于验证知识库 Markdown 渲染与切片规范，内容为示例。',
  '',
  '## 适用范围',
  '',
  '适用于全体员工的境内差旅费用报销。',
  '',
  '| 城市级别 | 住宿限额（元/晚） | 市内交通 |',
  '|---|---|---|',
  '| 一线城市 | 500 | 80 |',
  '| 其他城市 | 350 | 50 |',
  '',
  '## 报销流程',
  '',
  '### 提交材料',
  '',
  '1. 发票原件',
  '2. 行程单',
  '3. 审批通过的出差申请',
  '',
  '### 时限要求',
  '',
  '出差结束后 15 个工作日内提交。',
  '',
  '下面这行是**故意放的外链图片**，应被渲染管线拦成可见占位：',
  '',
  '![外链示意](https://example.com/not-allowed.png)',
].join('\n')

function mockNode(
  id: number,
  parentId: number,
  title: string,
  nodeType: KbNodeType,
  sortNo: number,
  path: string,
  hasChild: boolean,
): KbNode {
  return { id, parentId, title, nodeType, sortNo, path, hasChild, status: 'DRAFT', version: 1 }
}

/** 飞书式三层目录：知识库 → 文件夹 / 子文件夹 → 文档 */
const MOCK_NODES: KbNode[] = [
  mockNode(1, 0, '财务制度', 'FOLDER', 10, '/1/', true),
  mockNode(3, 1, '报销管理', 'FOLDER', 10, '/1/3/', true),
  mockNode(2, 3, '差旅费报销制度', 'DOC', 10, '/1/3/2/', false),
  mockNode(4, 3, '住宿标准说明', 'DOC', 20, '/1/3/4/', false),
  mockNode(5, 1, '发票管理', 'FOLDER', 20, '/1/5/', true),
  mockNode(6, 5, '发票开具规范', 'DOC', 10, '/1/5/6/', false),
  mockNode(7, 0, '人事制度', 'FOLDER', 20, '/7/', true),
  mockNode(8, 7, '考勤管理办法', 'DOC', 10, '/7/8/', false),
]

let nextId = 100
const nodes = ref<KbNode[]>(MOCK_NODES.map((x) => ({ ...x })))
const docs = ref<KbDocItem[]>([
  {
    id: 2,
    title: '差旅费报销制度',
    summary: '境内差旅住宿与交通标准、报销流程与时限',
    contentMd: SAMPLE,
    status: 'DRAFT',
    version: 1,
  },
])
const currentId = ref(2)
const mode = ref<'edit' | 'preview'>('edit')
const form = reactive({ title: '', summary: '', contentMd: '' })
const treeKeyword = ref('')
const expandedKeys = ref<number[]>([1, 3])
const treeRef = ref<TreeExpose | null>(null)

/** 摘要属业务字段（切片前置上下文），收进「文档属性」弹窗，不占顶部主视觉 */
const showProps = ref(false)
/** DEBUG-ONLY：结构检查调试面板，后期整体删除不影响布局 */
const showCheck = ref(false)

/** 树内 inline 重命名：新建节点后自动进入，hover 菜单 / 双击已有节点也可改名 */
const editingId = ref<number | null>(null)
const editingTitle = ref('')

const treeData = computed(() => buildKbTree(nodes.value))
const displayTree = computed(() => filterKbTree(treeData.value, treeKeyword.value))
const lazyMode = computed(() => isLazyRequired(nodes.value.length))
const breadcrumb = computed(() => getKbAncestorTitles(nodes.value, currentId.value))
const current = computed(() => docs.value.find((d) => d.id === currentId.value) ?? null)
const currentNode = computed(() => findKbNode(nodes.value, currentId.value) ?? null)
const issues = computed(() => validateMarkdown(form.contentMd))
const headings = computed(() => extractHeadings(form.contentMd))
const fileRefs = computed(() => collectFileRefs(form.contentMd))

function ensureDoc(node: KbNode): KbDocItem {
  let d = docs.value.find((x) => x.id === node.id)
  if (!d) {
    d = {
      id: node.id,
      title: node.title,
      summary: '',
      contentMd: `# ${node.title}\n\n## 章节\n\n正文`,
      status: 'DRAFT',
      version: 1,
    }
    docs.value.push(d)
  }
  return d
}

function loadDoc(node: KbNode) {
  if (node.nodeType === 'FOLDER') return
  currentId.value = node.id
  const d = ensureDoc(node)
  form.title = d.title
  form.summary = d.summary
  form.contentMd = d.contentMd
  mode.value = 'edit'
}
loadDoc(nodes.value.find((x) => x.id === 2)!)

/** 子节点数量变化后重算 hasChild（后端返回骨架时也由 Service 保证该字段准确） */
function syncHasChild() {
  const parents = new Set(nodes.value.map((n) => n.parentId))
  for (const n of nodes.value) n.hasChild = parents.has(n.id)
}

/** 进入 inline 命名态；nextTick 后聚焦并全选，用户可直接输入覆盖占位名 */
async function startRename(node: KbNode) {
  editingId.value = node.id
  editingTitle.value = node.title
  await nextTick()
  const input = document.querySelector<HTMLInputElement>('.kb-rename-input input')
  input?.focus()
  input?.select()
}

/** Enter / 失焦提交。空名称视为取消，保留原名；同步三处引用避免树与标题栏不一致 */
function commitRename() {
  const id = editingId.value
  if (id === null) return
  const title = editingTitle.value.trim()
  const node = findKbNode(nodes.value, id)
  if (node && title) {
    node.title = title
    const d = docs.value.find((x) => x.id === id)
    if (d) d.title = title
    if (currentId.value === id) form.title = title
  }
  editingId.value = null
}

function cancelRename() {
  editingId.value = null
}

function onNodeClick(data: KbNode) {
  if (data.nodeType === 'FOLDER') {
    const n = treeRef.value?.getNode(data.id)
    if (n) n.expanded = !n.expanded
    return
  }
  loadDoc(data)
}

function onNodeDrop(dragging: TreeDropNode, drop: TreeDropNode, type: string) {
  const target = nodes.value.find((x) => x.id === dragging.data.id)
  if (!target) return
  const parentId = type === 'inner' ? drop.data.id : drop.data.parentId
  const parent = parentId === 0 ? null : findKbNode(nodes.value, parentId)
  target.parentId = parentId
  target.path = computeKbPath(parent, target.id)
  target.sortNo = nextSortNo(nodes.value, parentId)
  syncHasChild()
  if (parentId && !expandedKeys.value.includes(parentId)) expandedKeys.value.push(parentId)
  ElMessage.success(`已移动到「${parent?.title ?? '根目录'}」（本地态，未持久化）`)
}

/** 只允许拖到文件夹内部；prev/next 按目标节点的父级判定，两边都过前端防环 */
function allowDrop(dragging: TreeDropNode, drop: TreeDropNode, type: string) {
  if (type === 'inner') {
    if (drop.data.nodeType !== 'FOLDER') return false
    return canMoveKbNode(nodes.value, dragging.data.id, drop.data.id)
  }
  return canMoveKbNode(nodes.value, dragging.data.id, drop.data.parentId)
}

function openCreate(nodeType: KbNodeType = 'DOC', forcedParentId?: number) {
  const cur = currentNode.value
  const parentId =
    forcedParentId ?? (cur?.nodeType === 'FOLDER' ? cur.id : (cur?.parentId ?? 0))
  const id = nextId++
  const parent = parentId === 0 ? null : findKbNode(nodes.value, parentId)
  const node: KbNode = {
    id,
    parentId,
    title: nodeType === 'FOLDER' ? '新建文件夹' : '未命名文档',
    nodeType,
    sortNo: nextSortNo(nodes.value, parentId),
    path: computeKbPath(parent, id),
    status: 'DRAFT',
    version: 1,
    hasChild: false,
  }
  nodes.value.push(node)
  syncHasChild()
  if (parentId && !expandedKeys.value.includes(parentId)) expandedKeys.value.push(parentId)
  if (nodeType === 'DOC') loadDoc(node)
  // 飞书式：新建后立刻 inline 命名，不再留一个「新建文件夹」占位名等用户去别处改
  void startRename(node)
}

async function removeNode(target?: KbNode) {
  const node = target ?? currentNode.value
  if (!node) return
  if (node.hasChild) {
    ElMessage.warning('请先删除或移走子节点')
    return
  }
  await ElMessageBox.confirm(`确认删除「${node.title}」？`, '提示', { type: 'warning' })
  nodes.value = nodes.value.filter((n) => n.id !== node.id)
  docs.value = docs.value.filter((d) => d.id !== node.id)
  if (editingId.value === node.id) editingId.value = null
  syncHasChild()
  if (currentId.value === node.id) {
    const next = nodes.value.find((n) => n.nodeType === 'DOC')
    if (next) loadDoc(next)
    else {
      currentId.value = 0
      form.title = ''
      form.summary = ''
      form.contentMd = ''
    }
  }
}

/** 右侧删除按钮沿用原签名 */
function removeDoc() {
  void removeNode()
}

/** 保存：本轮只做校验与本地态更新，不调后端（接口待接入） */
function save() {
  if (issues.value.length) {
    ElMessage.warning(`MD 规范未通过：${issues.value[0].message}`)
    return
  }
  const item = current.value
  if (!item) return
  item.title = form.title.trim() || '# 未命名文档'
  item.summary = form.summary.trim()
  item.contentMd = form.contentMd
  const node = currentNode.value
  if (node) node.title = item.title
  ElMessage.success('校验通过并已更新本地草稿（后端 KB 接口待接入，未持久化）')
}
</script>

<template>
  <div class="knowledge-page">
    <el-alert type="warning" :closable="false" show-icon class="kb-tip">
      <template #title>
        知识库管理端 · <b>树形结构（V208 方案 A）</b>、MD 编辑器与统一渲染管线已就绪；
        <b>后端 KB CRUD 接口尚未实现</b>（步骤 4.5，`api/kb.ts` 已定义契约）。
        当前节点骨架与文档正文均为本地内存态，树形操作不持久化，发布暂不可用。
      </template>
    </el-alert>

    <div class="kb-layout">
      <!-- 左：飞书风格文档树 -->
      <aside class="kb-sidebar">
        <div class="kb-sidebar-head">
          <span class="kb-sidebar-title">知识库</span>
          <div class="kb-sidebar-actions">
            <el-button
              v-has-perm="['ai:kb:edit']"
              type="primary"
              size="small"
              :icon="Plus"
              @click="openCreate('DOC')"
            >文档</el-button>
            <el-button
              v-has-perm="['ai:kb:edit']"
              size="small"
              :icon="Folder"
              title="新建文件夹"
              @click="openCreate('FOLDER')"
            />
          </div>
        </div>

        <el-input
          v-model="treeKeyword"
          :prefix-icon="Search"
          placeholder="搜索文档"
          clearable
          size="small"
          class="kb-search"
        />

        <div v-if="breadcrumb.length" class="kb-breadcrumb">
          <template v-for="(b, i) in breadcrumb" :key="`${b}-${i}`">
            <span>{{ b }}</span><span v-if="i < breadcrumb.length - 1" class="kb-crumb-sep"> / </span>
          </template>
        </div>

        <el-tree
          ref="treeRef"
          class="kb-tree"
          :data="displayTree"
          :props="{ label: 'title', children: 'children', isLeaf: 'isLeaf' }"
          node-key="id"
          :default-expanded-keys="expandedKeys"
          :current-node-key="currentId"
          :expand-on-click-node="false"
          :allow-drop="allowDrop"
          draggable
          highlight-current
          empty-text="暂无文档"
          @node-click="onNodeClick"
          @node-drop="onNodeDrop"
        >
          <template #default="{ data }">
            <div class="kb-node" :class="{ 'is-active': data.id === currentId }">
              <el-icon v-if="data.nodeType === 'FOLDER'" class="kb-node-icon"><Folder /></el-icon>
              <span v-else class="kb-doc-glyph" />
              <!-- inline 重命名：新建即进入，Enter/失焦提交、Esc 取消 -->
              <el-input
                v-if="editingId === data.id"
                v-model="editingTitle"
                class="kb-rename-input"
                size="small"
                @click.stop
                @keyup.enter.stop="commitRename"
                @keyup.esc.stop="cancelRename"
                @blur="commitRename"
              />
              <template v-else>
                <span
                  class="kb-node-label"
                  :title="data.title"
                  @dblclick.stop="startRename(data)"
                >{{ data.title }}</span>
                <span v-if="data.status === 'PUBLISHED'" class="kb-node-dot" title="已发布" />
                <span class="kb-node-more">
                  <el-button
                    v-has-perm="['ai:kb:edit']"
                    link
                    size="small"
                    :icon="EditPen"
                    title="重命名"
                    @click.stop="startRename(data)"
                  />
                  <el-button
                    v-if="data.nodeType === 'FOLDER'"
                    v-has-perm="['ai:kb:edit']"
                    link
                    size="small"
                    :icon="Plus"
                    title="在此新建文档"
                    @click.stop="openCreate('DOC', data.id)"
                  />
                  <el-button
                    v-has-perm="['ai:kb:edit']"
                    link
                    size="small"
                    :icon="Delete"
                    title="删除"
                    @click.stop="removeNode(data)"
                  />
                </span>
              </template>
            </div>
          </template>
        </el-tree>
        <el-empty v-if="!displayTree.length" description="无匹配文档" :image-size="48" />

        <div class="kb-sidebar-foot">
          <span>{{ nodes.length }} 个节点</span>
          <span v-if="lazyMode" class="kb-lazy-hint">超阈值 · 应切懒加载</span>
          <span v-else>骨架一次全量</span>
        </div>
      </aside>

      <!-- 右：编辑 / 预览。header 拆两行：标题行 + 工具栏行 -->
      <el-card shadow="never" class="kb-main">
        <template #header>
          <div class="kb-main-head">
            <div class="kb-head-top">
              <!-- 唯一输入框：文档标题（飞书式无框大字，对应正文 H1） -->
              <el-input v-model="form.title" placeholder="文档标题" class="kb-title-input" />
              <div class="kb-minor-actions">
                <!-- DEBUG-ONLY START（触发按钮）：删除时连同下方结构检查弹窗一起移除，布局零影响 -->
                <el-button link size="small" @click="showCheck = true">结构检查</el-button>
                <!-- DEBUG-ONLY END -->
                <!-- 文档属性：业务字段入口，放标题行（2026-11-09 与「发布」再次对调） -->
                <el-button link size="small" :disabled="!current" @click="showProps = true">
                  文档属性
                </el-button>
              </div>
            </div>
            <div class="kb-head-bottom">
              <!-- 现代化分段控件：替换 el-radio-group，去掉 radio 圆点与异常图标 -->
              <div class="kb-mode-switch" role="tablist" aria-label="编辑与预览切换">
                <button
                  type="button"
                  role="tab"
                  class="kb-mode-btn"
                  :class="{ 'is-active': mode === 'edit' }"
                  :aria-selected="mode === 'edit'"
                  @click="mode = 'edit'"
                >编辑</button>
                <button
                  type="button"
                  role="tab"
                  class="kb-mode-btn"
                  :class="{ 'is-active': mode === 'preview' }"
                  :aria-selected="mode === 'preview'"
                  @click="mode = 'preview'"
                >预览</button>
              </div>
              <div class="kb-actions">
                <el-button
                  v-has-perm="['ai:kb:edit']"
                  :icon="Delete"
                  :disabled="!current"
                  @click="removeDoc"
                >删除</el-button>
                <!-- 发布移到工具栏行、紧邻主操作「保存草稿」；后端 KB 接口待接入，仍禁用 -->
                <el-button
                  v-has-perm="['ai:kb:publish']"
                  type="warning"
                  disabled
                  title="后端 KB 接口待接入"
                >发布</el-button>
                <el-button v-has-perm="['ai:kb:edit']" type="primary" @click="save">保存草稿</el-button>
              </div>
            </div>
          </div>
        </template>

        <MarkdownEditor
          v-if="mode === 'edit'"
          v-model="form.contentMd"
          :doc-id="currentId || undefined"
          fill
          class="kb-editor"
        />
        <MarkdownView v-else :content="form.contentMd" class="kb-preview" />
      </el-card>
    </div>

    <!-- 文档属性：业务字段，不随调试面板移除 -->
    <el-dialog v-model="showProps" title="文档属性" width="520px" append-to-body>
      <div class="kb-prop-row">
        <label>摘要</label>
        <el-input
          v-model="form.summary"
          type="textarea"
          :rows="3"
          placeholder="切片前置上下文（可选）"
        />
        <p class="kb-prop-hint">摘要会作为 chunk 的前置上下文，不参与正文渲染。</p>
      </div>
      <div class="kb-prop-meta">
        状态 {{ current?.status ?? '—' }} · 版本 v{{ current?.version ?? 0 }} · 文档 ID {{ current?.id ?? '—' }}
      </div>
      <template #footer>
        <el-button type="primary" @click="showProps = false">完成</el-button>
      </template>
    </el-dialog>

    <!-- DEBUG-ONLY START（弹窗）：结构检查是开发期自检面板，线上收敛为保存行内提示 +
         右侧大纲 + 属性面板后，整块（含上方触发按钮与 issues/headings/fileRefs computed）
         删除即可，页面布局不依赖它，也不需要改任何样式。 -->
    <el-dialog
      v-model="showCheck"
      title="结构检查（切片契约 · 调试）"
      width="760px"
      append-to-body
    >
      <div class="kb-check-grid">
        <div>
          <b>规范校验</b>
          <p v-if="!issues.length" class="kb-ok">通过：唯一 H1、标题不跳级</p>
          <p v-for="i in issues" :key="i.line + i.message" class="kb-bad">
            第 {{ i.line }} 行：{{ i.message }}
          </p>
        </div>
        <div>
          <b>标题锚点（出处）</b>
          <p v-for="h in headings" :key="h.anchor" class="kb-anchor">
            H{{ h.level }} · {{ h.text }} → #{{ h.anchor }}
          </p>
          <p v-if="!headings.length" class="kb-ok">无标题</p>
        </div>
        <div>
          <b>正文附件引用</b>
          <p v-if="fileRefs.length" class="kb-ok">
            file: {{ fileRefs.join(', ') }}（保存时由后端建 INLINE 关系）
          </p>
          <p v-else class="kb-ok">无（外链图片会被渲染管线拦截）</p>
        </div>
      </div>
      <template #footer>
        <el-button @click="showCheck = false">关闭</el-button>
      </template>
    </el-dialog>
    <!-- DEBUG-ONLY END -->
  </div>
</template>

<style scoped>
.knowledge-page {
  /* 外层 AdminLayout .view-wrap 已有 padding: var(--fs-content-padding)=16px，
     本层不再叠 12px（虎哥 2026-11-09：多一层容器留白，清掉）。
     height:100% 由 flex 祖先链确定：admin-layout → .content → .view-wrap(flex:1,min-height:0)。 */
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.kb-tip {
  flex: none;
}
/* 两栏等高撑满：align-items: stretch + min-height:0，各自内部滚动，不产生页面级滚动条 */
.kb-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
  align-items: stretch;
}
.kb-sidebar {
  width: 264px;
  flex: none;
  min-height: 0;
  padding: 12px 10px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.kb-sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.kb-sidebar-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.kb-sidebar-actions {
  display: flex;
  gap: 6px;
}
.kb-search {
  margin-bottom: 6px;
  flex: none;
}
.kb-breadcrumb {
  flex: none;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 4px 6px 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kb-crumb-sep {
  color: var(--el-text-color-placeholder);
}
.kb-tree {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: transparent;
}
.kb-tree :deep(.el-tree-node__content) {
  height: 34px;
  border-radius: 6px;
}
.kb-tree :deep(.el-tree-node__content:hover) {
  background: var(--el-fill-color-light);
}
.kb-tree :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background: var(--el-color-primary-light-9);
}
.kb-node {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-width: 0;
  padding-right: 2px;
}
.kb-node-icon {
  flex: none;
  font-size: 15px;
  color: var(--el-text-color-secondary);
}
.kb-doc-glyph {
  flex: none;
  width: 12px;
  height: 14px;
  border: 1.5px solid var(--el-border-color);
  border-radius: 2px;
}
.kb-node-label {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kb-rename-input {
  flex: 1;
  min-width: 0;
}
.kb-rename-input :deep(.el-input__wrapper) {
  padding: 1px 6px;
}
.kb-node-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-color-success);
}
.kb-node-more {
  display: inline-flex;
  flex: none;
  visibility: hidden;
}
.kb-tree :deep(.el-tree-node__content:hover) .kb-node-more {
  visibility: visible;
}
.kb-sidebar-foot {
  flex: none;
  margin-top: auto;
  padding: 8px 4px 0;
  border-top: 1px solid var(--el-border-color-lighter);
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--el-text-color-tertiary);
}
.kb-lazy-hint {
  color: var(--el-color-warning);
}
/* 内容区：el-card 自身作为 flex 列容器，header 固定、body 撑满，编辑器在 body 内填满 */
.kb-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.kb-main :deep(.el-card__header) {
  flex: none;
  padding: 12px 16px;
}
.kb-main :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 12px 16px 16px;
}
.kb-main-head {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.kb-head-top,
.kb-head-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
/* 唯一输入框：默认无框大字；hover 出淡四边框、聚焦出主色四边框（不再只有上边一条线） */
.kb-title-input {
  flex: 1;
  min-width: 0;
  max-width: none;
}
.kb-title-input :deep(.el-input__wrapper) {
  box-shadow: none;
  background: transparent;
  padding: 2px 6px;
  border-radius: 6px;
  transition: box-shadow 0.18s ease, background 0.18s ease;
}
.kb-title-input :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--el-border-color) inset;
}
.kb-title-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
  background: var(--el-bg-color);
}
.kb-title-input :deep(.el-input__inner) {
  font-size: 20px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.kb-minor-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
}
.kb-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
}
/* 分段控件（segmented control）：胶囊容器 + 选中白块 + 微阴影，替代 radio-button */
.kb-mode-switch {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 3px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
}
.kb-mode-btn {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--el-text-color-regular);
  font-family: inherit;
  font-size: 13px;
  line-height: 1;
  padding: 7px 16px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}
.kb-mode-btn:hover {
  color: var(--el-text-color-primary);
}
.kb-mode-btn.is-active {
  background: var(--el-bg-color);
  color: var(--el-color-primary);
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.kb-mode-btn:focus-visible {
  outline: 2px solid var(--el-color-primary-light-5);
  outline-offset: 1px;
}
.kb-editor {
  flex: 1;
  min-height: 0;
}
.kb-preview {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}
.kb-prop-row label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 6px;
}
.kb-prop-hint {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.kb-prop-meta {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.kb-check-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  font-size: 13px;
}
.kb-check-grid p {
  margin: 4px 0;
  word-break: break-all;
}
.kb-ok {
  color: var(--el-color-success);
}
.kb-bad {
  color: var(--el-color-danger);
}
.kb-anchor {
  color: var(--el-text-color-secondary);
}
</style>
