<script setup lang="ts">
/**
 * AI 中心 → 知识库（V207 菜单 9503，/system/knowledge，component=system/knowledge）
 *
 * ✅ 步骤 4.5（2026-11-09）：后端 KbNodeController 已落码，本页已接真接口，
 *    节点骨架 / 正文 / 保存 / 发布 / 新建 / 改名 / 移动 / 删除全部走 /ai/kb/*，
 *    不再有 MOCK_NODES 与本地 docs 内存态。前置：目标库已执行 V206~V209、后端服务在跑。
 *    接口不可用时页面显示明确错误条，**不静默回退演示数据**（避免「看着能用其实是假的」）。
 *
 * 加载策略（对齐飞书 wiki node list）：首屏一次拉全量轻量骨架（不含 content_md），
 * 点开文档才拉正文；节点数 > 2000 时后端置 lazyRequired，前端提示切按 parentId 懒加载。
 * 切片与检索属于步骤 5：本轮发布只更新发布态 / 版本 / 旧切片失效，不生成新切片。
 *
 * 界面约定（2026-11-09）：
 *   ① 外层 .view-wrap 已有 --fs-content-padding:16px，本页不再叠 padding；
 *   ② 目录树与内容区等高撑满，结构检查改弹窗（DEBUG-ONLY，可整体移除不影响布局）；
 *   ③ 顶部只留一个标题输入框；摘要字段在后端零消费，已从编辑 UI 移除；
 *   ④ header 收成单行：标题在左，①结构检查+文档信息 / ②编辑·预览 /
 *      ③保存草稿(warning)·发布(primary) 按序靠右，删除已收敛到树节点三点菜单；
 *   ⑤ 编辑/预览改分段控件；树节点支持 inline 重命名（新建即命名）；
 *   ⑥ 空态只在 el-tree 的 #empty 插槽渲染一次，树外不再叠加 el-empty（避免重复占位），
 *      并留出顶部间距，避免「暂无文档」紧贴搜索框；
 *   ⑦ 目录下再建目录：`activeFolderId` 记录「新建位置」（点文件夹即选中，不动右侧文档），
 *      树内 hover 菜单给 FOLDER 补「在此新建文件夹」，全局按钮按该位置落库。
 *      后端 create 本就允许 FOLDER 作父、path 支持无限层级，无需改后端（见设计文档 §19）。
 *   ⑧ hover 操作区收敛：重命名单独留在外面，其余（新建文档 / 新建文件夹 / 移动 / 删除）
 *      收进 MoreFilled 三点下拉，用 @command 统一派发，不再在 264px 侧栏挤 4 个图标。
 *   ⑨ 节点移动：拖拽与「移动到」弹窗共用 applyMove；候选目录由 buildKbMoveTargets 生成
 *      （虚拟根 + 只含 FOLDER、排除自身及后代），提交前 canMoveKbNode 再判一次，
 *      后端 KbTreeRules.assertNoCycle 兜底（见设计文档 §20）。
 *   ⑩ 排序契约（§21）：前端**不再计算 sortNo**，只发 BEFORE/AFTER/APPEND + targetId，
 *      服务端在事务内整组重排同父兄弟；上移/下移 = BEFORE/AFTER 相邻兄弟。
 *      ⚠️ node-drop 的 dropType 是 before/after/inner，allow-drop 才是 prev/next/inner
 *      （两套取值不同！），旧实现混用导致「拖到 A 前却排末尾」。
 *   ⑪ 预览统一（§25→2026-11-23 定案）：以 **md-editor-v3 原生渲染为准**——预览 tab
 *      与编辑器内置预览同用 MdPreview（MarkdownView.vue 已从 x-markdown-vue 切回，
 *      虎哥拍板：x-markdown-vue 渲染观感不佳）。安全/图片/图表契约不变（kbSanitize、
 *      file:<id> JWT 拉图、本地 mermaid 注入）。滚动容器仍是本页原生 div。
 *   ⑫ 状态与保存（§24）：树节点状态点 + header 徽章区分草稿/已发布 + 未保存提示；
 *      编辑器工具栏「保存」接 :onSave → 页面 save()，与顶部「保存草稿」同一逻辑。
 *   ⑬ 顶部删除按钮移除（§25）：删除统一收敛到树节点三点菜单，避免误删当前文档。
 *   ⑭ 首屏规则（§26，A 方案）：**不做任何隐式默认选中**。右侧内容的唯一真源是
 *      「用户在左树显式点选的文档」，无选中即渲染统一空态（零文档 / 有文档未选中 /
 *      接口异常三态），绝不渲染一个没有落库归属、保存却静默 return 的裸编辑器。
 *      旧 onMounted 取 nodes.find(第一篇 DOC)，实际依赖后端 parentId→sortNo→id 排序，
 *      会选中折叠树里的深层文档，且刷新永远回同一篇——飞书/Confluence 都不这么干：
 *      前者落「最近访问」列表由用户点选，后者是 space 级可配置 homepage。
 *      新建文档 openCreate 本就立即 loadDoc 选中，所以空态→新建→直接进编辑，流程不重。
 *   ⑮ 左树顶部不再有常驻占位（§28）：删掉「新建位置」提示条、面包屑，以及右侧空态里
 *      的「新建位置」文案。activeFolderId 仍是新建落点的真源（仅由按钮 tooltip +
 *      树内三点菜单「在此新建」表达落点，节点聚焦边框已移除）；点任意文档即回到
 *      「当前文档同级」，树本身已展示层级，面包屑在 264px 侧栏里纯属冗余。
 */
import { computed, defineAsyncComponent, nextTick, onMounted, reactive, ref } from 'vue'
import { Plus, Delete, EditPen, Folder, Document, Search, MoreFilled, Rank, ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import type { KbAttachment, KbDocDetail, KbDocStatus, KbNode, KbNodeMove, KbNodeType, KbRetrieveResult } from '@/api/kb'
import {
  addKbAttachment,
  createKbNode,
  deleteKbNode,
  getKbDoc,
  listKbAttachments,
  listKbNodes,
  moveKbNode,
  publishKbDoc,
  removeKbAttachment,
  renameKbNode,
  retrieveKb,
  setKbAttachmentIndexable,
  updateKbDoc,
} from '@/api/kb'
import { uploadFile, downloadFileUrl, fetchFileBlob } from '@/api/file'
import {
  buildKbMoveTargets,
  buildKbTree,
  canMoveKbNode,
  filterKbTree,
  findKbMoveTarget,
  findKbNode,
  getKbMoveNeighbor,
  isLazyRequired,
} from '@/utils/kbTree'
import type { KbMoveTarget } from '@/utils/kbTree'

/**
 * REFERENCE 附件格式白名单 —— 必须与后端 KbFileTextExtractor.extract() 的 switch 分支一致。
 * 后端只解析这些扩展名，其余（图片/压缩包/doc/xls/ppt 等）即便上传成功，发布时也会被
 * 静默跳过、不纳入 AI 检索。文件框 accept 只做第一层过滤；onAttFileChange 再做扩展名兜底，
 * 防「浏览器切到所有文件」或拖拽绕过 accept 后，用户以为加上了其实永远搜不到。
 */
const KB_ATTACH_EXTS = ['txt', 'md', 'markdown', 'csv', 'log', 'text', 'json', 'docx', 'xlsx', 'pdf', 'html', 'htm']
const KB_ATTACH_ACCEPT = KB_ATTACH_EXTS.map((e) => '.' + e).join(',')
function kbAttachExt(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 || dot === name.length - 1 ? '' : name.slice(dot + 1).toLowerCase()
}
import { validateMarkdown, collectFileRefs, extractHeadings } from '@/utils/markdown'
import ChunkSkeleton from '@/components/ChunkSkeleton.vue'

// ⚠️ 编辑器与预览都必须异步加载：编辑器把 CodeMirror / 本地 mermaid 实例、
//    预览把 x-markdown-vue（Shiki）带进异步 chunk，静态引入会把 3MB+ 运行时
//    塞进 knowledge 首屏。编辑器共享 kbMarkdown 里的 mermaid 实例；预览走
//    x-markdown-vue（动态 import npm 里的 mermaid，零 CDN 依赖），Vite 各自拆 chunk。
const MarkdownEditor = defineAsyncComponent({
  loader: () => import('@/components/MarkdownEditor.vue'),
  /* 慢网下 chunk 下载完成前也有骨架（2026-11-23 虎哥反馈生产看不到骨架的根因：
     之前只处理了组件内初始化态，defineAsyncComponent 无 loadingComponent 时
     chunk 下载期是纯白板）。delay=200：本机快网不闪骨架。 */
  loadingComponent: ChunkSkeleton,
  delay: 200,
})
const MarkdownView = defineAsyncComponent({
  loader: () => import('@/components/MarkdownView.vue'),
  loadingComponent: ChunkSkeleton,
  delay: 200,
})

/** el-tree 实例的最小接口，避免引入 element-plus 深层类型 */
interface TreeExpose {
  getNode(id: number): { expanded: boolean } | null
}
interface TreeDropNode {
  data: KbNode
}

const nodes = ref<KbNode[]>([])
/** 当前文档详情（唯一含正文的数据），点开节点才拉 */
const currentDetail = ref<KbDocDetail | null>(null)
const currentId = ref(0)
const mode = ref<'edit' | 'preview'>('edit')
const form = reactive({ title: '', summary: '', contentMd: '' })
// REFERENCE 附件（补充材料）：发布时解析切片纳入 AI 检索
const attachments = ref<KbAttachment[]>([])
const uploadingAtt = ref(false)
const attFileInput = ref<HTMLInputElement | null>(null)
/** 附件列表默认收起（不挤占编辑器 / 预览高度）；标题行数量摘要 + 展开箭头做够指引 */
const attachmentsCollapsed = ref(true)
/** 收起态也可见的附件摘要：数量、纳入检索数、未纳入数、发布才生效 */
const attachmentSummary = computed(() => {
  const total = attachments.value.length
  if (!total) return '暂无附件 · 点击右侧「添加附件」'
  const on = attachments.value.filter((a) => a.indexable === 1).length
  return `${on} 个纳入检索${on < total ? ` · ${total - on} 个未纳入` : ''} · 发布后生效`
})
const treeKeyword = ref('')
const expandedKeys = ref<number[]>([])
const treeRef = ref<TreeExpose | null>(null)
const loading = ref(false)
const loadError = ref('')
const serverLazy = ref(false)

/** 文档信息面板：只读概览（状态 / 版本 / 字数 / 章节 / 附件 / ID），不占顶部主视觉 */
const showInfo = ref(false)
/** DEBUG-ONLY：结构检查调试面板，后期整体删除不影响布局 */
const showCheck = ref(false)

/** 检索可观测（P0-2）：输入问题直查召回明细，调试看到的 = 模型拿到的 */
const showRetrieve = ref(false)
const retrieveQuery = ref('')
const retrieveTopK = ref(4)
const retrieveLoading = ref(false)
const retrieveResult = ref<KbRetrieveResult | null>(null)

/** 执行只读检索（复用线上 KbRetriever，带当前登录人 ACL） */
async function runRetrieve() {
  const q = retrieveQuery.value.trim()
  if (!q) {
    ElMessage.warning('请输入要检索的问题或关键词')
    return
  }
  retrieveLoading.value = true
  try {
    retrieveResult.value = await retrieveKb(q, retrieveTopK.value)
  } catch (err) {
    retrieveResult.value = null
    ElMessage.error(errMsg(err, '检索失败'))
  } finally {
    retrieveLoading.value = false
  }
}

/** 相关度分档着色：高分绿、中黄、低灰（越大越相关） */
function scoreTagType(score: number): 'success' | 'warning' | 'info' {
  if (score >= 6) return 'success'
  if (score >= 3) return 'warning'
  return 'info'
}

/** 树内 inline 重命名：新建节点后自动进入，hover 菜单 / 双击已有节点也可改名 */
const editingId = ref<number | null>(null)
const editingTitle = ref('')

const treeData = computed(() => buildKbTree(nodes.value))
const displayTree = computed(() => filterKbTree(treeData.value, treeKeyword.value))
/**
 * 空态唯一真源：由 el-tree 的 #empty 插槽渲染，按场景给不同文案。
 * ⚠️ 不要在树外再叠一个 <el-empty>：两者条件几乎相同会同时出现，
 *    在 .kb-sidebar 的 flex 列里各占一块，撑出一大片重复空白（2026-11-09 截图实测）。
 */
const treeEmpty = computed(() => {
  if (loadError.value) return { title: '接口不可用', hint: '见上方错误提示，可点「重试」' }
  if (treeKeyword.value.trim()) return { title: '无匹配文档', hint: '换个关键词试试' }
  return { title: '暂无文档', hint: '点右上角「+ 文档」开始创建' }
})
/**
 * 右侧空态（§26 A 方案）：无选中文档时唯一的落地状态。
 * 与左侧树内 #empty 分属两个面板，不冲突；文案按场景区分，避免误导用户去新建。
 */
const emptyState = computed(() => {
  if (loadError.value) {
    return {
      title: '知识库接口不可用',
      hint: '请确认后端服务已启动、V206~V209 迁移已执行，再点上方错误条里的「重试」',
      canCreate: false,
    }
  }
  if (!nodes.value.some((n) => n.nodeType === 'DOC')) {
    return {
      title: '知识库还没有文档',
      hint: '新建第一篇文档开始写作，或先建文件夹搭好目录结构',
      canCreate: true,
    }
  }
  return {
    title: '选择一篇文档开始',
    hint: '在左侧目录树点选文档，或新建一篇；右侧内容始终以当前选中的文档为准',
    canCreate: true,
  }
})
const lazyMode = computed(() => serverLazy.value || isLazyRequired(nodes.value.length))
const current = computed(() => currentDetail.value)
const currentNode = computed(() => findKbNode(nodes.value, currentId.value) ?? null)

/**
 * 文档状态可视化（§24）：后端 update 不改 status，publish 才置 PUBLISHED，
 * 所以「保存过」≠「已发布」，必须让两者在树和右侧 header 一眼可分。
 * DRAFT = 仅管理端可见；PUBLISHED = 进入 AI 助手检索范围（步骤 5 落地）。
 */
const STATUS_META: Record<KbDocStatus, { label: string; hint: string; cls: string }> = {
  DRAFT: { label: '草稿', hint: '草稿：仅管理端可见，AI 助手不检索', cls: 'is-draft' },
  PENDING_REVIEW: { label: '待审核', hint: '待审核：预留状态，暂未接入审核流', cls: 'is-review' },
  PUBLISHED: { label: '已发布', hint: '已发布：进入 AI 助手检索范围', cls: 'is-published' },
  ARCHIVED: { label: '已归档', hint: '已归档：不再对外提供', cls: 'is-archived' },
}
function statusMeta(s?: KbDocStatus | null) {
  return STATUS_META[s ?? 'DRAFT'] ?? STATUS_META.DRAFT
}
const currentStatus = computed(() => statusMeta(current.value?.status))
/** 相对「已保存版本」是否有未保存改动：save() 会同步 currentDetail 三个字段归零 */
const isDirty = computed(() => !!current.value && (
  form.title !== current.value.title ||
  form.summary !== (current.value.summary ?? '') ||
  form.contentMd !== (current.value.contentMd ?? '')
))
/** 发布按钮 loading（发布 = 先保存再发布，两次请求） */
const publishing = ref(false)
/**
 * 已发布文档保存了草稿但尚未重新发布：库内保存版本 ≠ 已发布版本（AI 检索的还是旧版）。
 * 判定由后端权威计算（updatedAt > publishedAt），随详情 / 骨架一起下发；save / publish
 * 后前端做同口径乐观同步。切走再回来、整页刷新都能保持，不再依赖页面内存态。
 */
const hasUnpublishedEdits = computed(() => current.value?.hasUnpublishedEdits === true)
/**
 * 「新建位置」上下文（对齐飞书/Confluence 树内 + 号的位置语义）。
 * 与 currentId 刻意分离：currentId 只跟随文档（右侧编辑态），activeFolderId 只跟随文件夹
 * （决定全局「文档 / 新建文件夹」按钮落在哪）。0 = 根目录。
 * §28/§29：树顶部常驻的「新建位置」提示条与面包屑已移除，节点的聚焦边框也一并移除，
 * 落点只由按钮 tooltip + 树内三点菜单「在此新建」表达；点任意文档即回到「当前文档同级」。
 */
const activeFolderId = ref(0)
/** 全局新建按钮的默认落点：与 openCreate 共用同一优先级，避免 tooltip 与落库口径打架 */
const defaultCreateParentId = computed(
  () => activeFolderId.value || currentNode.value?.parentId || 0,
)
const defaultCreateParentTitle = computed(
  () => findKbNode(nodes.value, defaultCreateParentId.value)?.title ?? '根目录',
)
function createHint(action: string) {
  return `在「${defaultCreateParentTitle.value}」中${action}`
}

/** 三点菜单打开中的节点 id：菜单 teleport 到 body 后树不再 hover，靠它保持 trigger 可见 */
const openMenuNodeId = ref<number | null>(null)
/** 「移动到」弹窗：与拖拽共用 applyMove，moveSelectedId 即目标 parentId（0 = 根目录） */
const showMove = ref(false)
const moving = ref(false)
const moveNodeId = ref(0)
const moveSelectedId = ref(0)
const moveNode = computed(() => findKbNode(nodes.value, moveNodeId.value) ?? null)
const moveTargets = computed(() => buildKbMoveTargets(nodes.value, moveNodeId.value))
const moveSelectedLabel = computed(
  () => findKbMoveTarget(moveTargets.value, moveSelectedId.value)?.label ?? '',
)
/** 目标 == 当前父级（无变化）或目标非法时禁用确定，避免无意义请求 / 成环 */
const moveCanSubmit = computed(() => {
  const node = moveNode.value
  if (!node || moveSelectedId.value === node.parentId) return false
  return canMoveKbNode(nodes.value, node.id, moveSelectedId.value)
})

const issues = computed(() => validateMarkdown(form.contentMd))
const headings = computed(() => extractHeadings(form.contentMd))
const fileRefs = computed(() => collectFileRefs(form.contentMd))
/** 文档信息面板：正文字数（非空白字符数） */
const wordCount = computed(() => (form.contentMd.match(/\S/g) ?? []).length)

function errMsg(e: unknown, fallback: string): string {
  const x = e as { response?: { data?: { message?: string } }; message?: string }
  return x?.response?.data?.message || x?.message || fallback
}

/** 首屏 / 每次写操作后重拉骨架。失败时只显示错误，绝不回退本地演示数据 */
async function refreshNodes() {
  loading.value = true
  try {
    const page = await listKbNodes()
    nodes.value = page.items
    serverLazy.value = Boolean(page.lazyRequired)
    // 默认折叠：不自动铺开文件夹（expandedKeys 初始为空即全折叠）；
    // 用户手动展开某个文件夹后，刷新仍保留其展开/折叠状态
    loadError.value = ''
    if (page.lazyRequired) {
      ElMessage.warning('节点数超过阈值，建议切换为按父节点懒加载')
    }
  } catch (e) {
    loadError.value = errMsg(e, '知识库接口不可用')
  } finally {
    loading.value = false
  }
}

function clearForm() {
  currentId.value = 0
  currentDetail.value = null
  form.title = ''
  form.summary = ''
  form.contentMd = ''
}

async function loadDoc(node: KbNode) {
  if (node.nodeType === 'FOLDER') return
  currentId.value = node.id
  attachmentsCollapsed.value = true // 切换文档恢复默认收起，不带上一份文档的展开态
  try {
    const d = await getKbDoc(node.id)
    currentDetail.value = d
    form.title = d.title
    form.summary = d.summary ?? ''
    form.contentMd = d.contentMd ?? ''
    // hasUnpublishedEdits 由后端随详情下发（d.hasUnpublishedEdits），切走再回来不丢
    mode.value = 'edit'
    void loadAttachments(node.id)
  } catch (e) {
    // 详情拉取失败必须连 currentId 一起归零，否则会出现「有 id 但无详情」的半选中态
    clearForm()
    ElMessage.error(errMsg(e, '文档加载失败'))
  }
}

onMounted(async () => {
  // §26 A 方案：只拉骨架，不隐式选中任何文档。右侧由 v-if="current" 决定渲染编辑器
  // 还是统一空态；刷新/重进的行为从此确定且可解释（= 回到空态，由用户点选）。
  await refreshNodes()
})

/** 进入 inline 命名态；nextTick 后聚焦并全选，用户可直接输入覆盖占位名 */
async function startRename(node: KbNode) {
  editingId.value = node.id
  editingTitle.value = node.title
  await nextTick()
  const input = document.querySelector<HTMLInputElement>('.kb-rename-input input')
  input?.focus()
  input?.select()
}

/** Enter / 失焦提交：先清 editingId 防 blur 重入；成功后同步树与标题栏，失败重拉还原 */
async function commitRename() {
  const id = editingId.value
  if (id === null) return
  editingId.value = null
  const title = editingTitle.value.trim()
  if (!title) return
  const node = findKbNode(nodes.value, id)
  if (!node || node.title === title) return
  try {
    await renameKbNode(id, title)
    node.title = title
    if (currentId.value === id) {
      form.title = title
      if (currentDetail.value) currentDetail.value.title = title
    }
  } catch (e) {
    ElMessage.error(errMsg(e, '重命名失败'))
    await refreshNodes()
  }
}

function cancelRename() {
  editingId.value = null
}

function onNodeClick(data: KbNode) {
  if (data.nodeType === 'FOLDER') {
    // 点文件夹 = 选中「新建位置」；保留原有展开/折叠手势，但不动 currentId，
    // 右侧仍显示当前文档（飞书选中目录不清空正在编辑的页面）。
    activeFolderId.value = data.id
    const n = treeRef.value?.getNode(data.id)
    if (n) n.expanded = !n.expanded
    return
  }
  activeFolderId.value = 0
  void loadDoc(data)
}

/**
 * 相对位置 → 目标父 id。只用于前端防环预判与「展开目标文件夹」，**不传给后端**。
 * BEFORE/AFTER 的父 = 锚点兄弟的父；APPEND 的父 = targetId（0 = 根目录）。
 */
function resolveMoveParent(move: KbNodeMove): number {
  if (move.position === 'BEFORE' || move.position === 'AFTER') {
    return findKbNode(nodes.value, move.targetId)?.parentId ?? 0
  }
  return move.targetId
}

/**
 * 拖拽 / 上移下移 / 「移动到」弹窗共用的唯一提交口：
 * 前端 canMoveKbNode 判一次，后端 assertNoCycle 再兜一次；任何失败都重拉骨架还原 UI。
 * 返回是否成功，供弹窗决定要不要关闭。前端自始至终不碰 sortNo（§21）。
 */
async function applyMove(id: number, move: KbNodeMove): Promise<boolean> {
  const parentId = resolveMoveParent(move)
  if (!canMoveKbNode(nodes.value, id, parentId)) {
    ElMessage.warning('不能移动到自身或其子目录下')
    await refreshNodes()
    return false
  }
  moving.value = true
  try {
    await moveKbNode(id, move)
    await refreshNodes()
    // 目标是文件夹时展开它，让用户立刻看到移动结果
    if (parentId) {
      const n = treeRef.value?.getNode(parentId)
      if (n) n.expanded = true
    }
    ElMessage.success('已移动')
    return true
  } catch (e) {
    ElMessage.error(errMsg(e, '移动失败'))
    await refreshNodes()
    return false
  } finally {
    moving.value = false
  }
}

/**
 * ⚠️ Element Plus 两套 dropType 不能混：
 *    node-drop  发出 'before' | 'after' | 'inner'（useDragNode.mjs:104 + NodeDropType）
 *    allow-drop 收到 'prev'   | 'next'   | 'inner'（useDragNode.mjs:41-43 + AllowDropType）
 * 旧实现只判 inner，before/after 一律按「目标父 + nextSortNo 追加末尾」处理，
 * 于是拖到 A 前面却排到最后；混排时相同 sortNo 再按 id 兜底，看着就像随机。
 */
async function onNodeDrop(dragging: TreeDropNode, drop: TreeDropNode, type: string) {
  const target = nodes.value.find((x) => x.id === dragging.data.id)
  if (!target || target.id === drop.data.id) return
  let move: KbNodeMove
  if (type === 'inner') move = { position: 'APPEND', targetId: drop.data.id }
  else if (type === 'before') move = { position: 'BEFORE', targetId: drop.data.id }
  else if (type === 'after') move = { position: 'AFTER', targetId: drop.data.id }
  else return
  await applyMove(target.id, move)
}

/** 只允许 inner 到文件夹；prev/next 按目标节点的父级判防环（后端再判一次） */
function allowDrop(dragging: TreeDropNode, drop: TreeDropNode, type: string) {
  if (dragging.data.id === drop.data.id) return false
  if (type === 'inner') {
    if (drop.data.nodeType !== 'FOLDER') return false
    return canMoveKbNode(nodes.value, dragging.data.id, drop.data.id)
  }
  return canMoveKbNode(nodes.value, dragging.data.id, drop.data.parentId)
}

/** 新建后由后端返回 id，重拉骨架再进 inline 命名（飞书式：不留占位名等用户去别处改） */
async function openCreate(nodeType: KbNodeType = 'DOC', forcedParentId?: number) {
  // 优先级：树内 hover 显式指定 > 当前选中的文件夹 > 当前文档所在目录（旧行为兜底）。
  // forcedParentId 用 ?? 而非 ||：0（根目录）也是合法的显式值。
  const parentId = forcedParentId ?? defaultCreateParentId.value
  const title = nodeType === 'FOLDER' ? '新建文件夹' : '未命名文档'
  try {
    const id = await createKbNode({ parentId, title, nodeType })
    await refreshNodes()
    // 连续嵌套：新建文件夹后把它设为当前位置，再点「新建文件夹」就落在它下面；
    // 新建文档则保留原位置，方便在同一目录连续建多篇。
    activeFolderId.value = nodeType === 'FOLDER' ? id : parentId
    if (parentId) {
      const n = treeRef.value?.getNode(parentId)
      if (n) n.expanded = true
    }
    const node = findKbNode(nodes.value, id)
    if (node) {
      if (nodeType === 'DOC') await loadDoc(node)
      void startRename(node)
    }
  } catch (e) {
    ElMessage.error(errMsg(e, '新建失败'))
  }
}

async function removeNode(target?: KbNode) {
  const node = target ?? currentNode.value
  if (!node) return
  if (node.hasChild) {
    ElMessage.warning('请先删除或移走子节点')
    return
  }
  try {
    await ElMessageBox.confirm(`确认删除「${node.title}」？`, '提示', { type: 'warning' })
  } catch {
    return // 用户取消
  }
  const wasCurrent = currentId.value === node.id
  try {
    await deleteKbNode(node.id)
    if (editingId.value === node.id) editingId.value = null
    if (activeFolderId.value === node.id) activeFolderId.value = 0
    await refreshNodes()
    if (wasCurrent) {
      // §26 A 方案：删掉当前文档后回统一空态，不再按后端排序隐式「猜下一篇」
      clearForm()
    }
    ElMessage.success('已删除')
  } catch (e) {
    ElMessage.error(errMsg(e, '删除失败'))
    await refreshNodes()
  }
}

/** 三点下拉统一派发：命令字符串 → 操作，避免每个菜单项各写一份 @click.stop */
function onNodeCommand(command: unknown, node: KbNode) {
  switch (String(command)) {
    case 'create-doc':
      void openCreate('DOC', node.id)
      break
    case 'create-folder':
      void openCreate('FOLDER', node.id)
      break
    case 'move-up':
      void moveByStep(node, 'up')
      break
    case 'move-down':
      void moveByStep(node, 'down')
      break
    case 'move':
      openMove(node)
      break
    case 'delete':
      void removeNode(node)
      break
  }
}

/** 边界禁用：同父有序组里没有相邻兄弟时不给点 */
function canMoveByStep(node: KbNode, direction: 'up' | 'down') {
  return getKbMoveNeighbor(nodes.value, node.id, direction) !== null
}

/** 上移 = BEFORE 前一个兄弟；下移 = AFTER 后一个兄弟。目录文件混排同样按同级组算 */
async function moveByStep(node: KbNode, direction: 'up' | 'down') {
  const neighbor = getKbMoveNeighbor(nodes.value, node.id, direction)
  if (!neighbor) {
    ElMessage.warning(direction === 'up' ? '已经在最上面' : '已经在最下面')
    return
  }
  await applyMove(node.id, {
    position: direction === 'up' ? 'BEFORE' : 'AFTER',
    targetId: neighbor.id,
  })
}

function onMenuVisibleChange(visible: boolean, nodeId: number) {
  openMenuNodeId.value = visible
    ? nodeId
    : (openMenuNodeId.value === nodeId ? null : openMenuNodeId.value)
}

function openMove(node: KbNode) {
  moveNodeId.value = node.id
  moveSelectedId.value = node.parentId
  showMove.value = true
}

function onMoveTargetClick(data: KbMoveTarget) {
  moveSelectedId.value = data.id
}

async function submitMove() {
  if (!moveCanSubmit.value) return
  // 弹窗语义 = 「移动到该文件夹下」→ APPEND；0 为虚拟根目录
  const ok = await applyMove(moveNodeId.value, {
    position: 'APPEND',
    targetId: moveSelectedId.value,
  })
  if (ok) showMove.value = false
}

/**
 * 把当前表单内容落库（保存草稿）。成功返回 true，供「发布」前置保存静默复用。
 * 已发布文档保存草稿后乐观置 hasUnpublishedEdits：库内保存版本 ≠ 已发布版本。
 */
async function persist(): Promise<boolean> {
  // 防御：顶部按钮已 disabled，但编辑器工具栏「保存」等入口仍可能触发（§26）
  if (!currentId.value || !current.value) {
    ElMessage.warning('请先在左侧选择或新建一篇文档')
    return false
  }
  if (!form.title.trim()) {
    ElMessage.warning('标题不能为空')
    return false
  }
  try {
    await updateKbDoc(currentId.value, {
      title: form.title.trim(),
      summary: form.summary.trim(),
      contentMd: form.contentMd,
      // 后端会忽略此提示值，一律从 contentMd 重新提取（防伪造 fileId）
      fileRefs: collectFileRefs(form.contentMd),
    })
    if (currentDetail.value) {
      currentDetail.value.title = form.title.trim()
      currentDetail.value.summary = form.summary.trim()
      currentDetail.value.contentMd = form.contentMd
      // 保存刷新后端 updatedAt 但不动 publishedAt → 与后端权威判定同口径
      if (currentDetail.value.status === 'PUBLISHED') currentDetail.value.hasUnpublishedEdits = true
    }
    const node = currentNode.value
    if (node) {
      node.title = form.title.trim()
      if (node.status === 'PUBLISHED') node.hasUnpublishedEdits = true
    }
    return true
  } catch (e) {
    ElMessage.error(errMsg(e, '保存失败'))
    return false
  }
}

async function save() {
  if (await persist()) ElMessage.success('草稿已保存')
}

async function publish() {
  if (!currentId.value) return
  publishing.value = true
  try {
    // 成熟系统语义：发布 = 「保存当前编辑内容」+「发布该版本」原子操作。
    // 直接发布旧版（虎哥指出的歧义①）：编辑器里改了但不落库就发布，前端会同时显示
    // 「已发布 · 未保存」，且 AI 检索到的仍是旧内容——这里先静默保存，二者必须同步。
    if (!(await persist())) return
    await publishKbDoc(currentId.value)
    if (currentDetail.value) {
      currentDetail.value.status = 'PUBLISHED'
      currentDetail.value.version = (currentDetail.value.version ?? 1) + 1
    }
    const node = currentNode.value
    if (node) {
      node.status = 'PUBLISHED'
      node.version = (node.version ?? 1) + 1
    }
    // 发布的就是刚保存的版本：后端把 updatedAt/publishedAt 对齐，前端同口径归零
    if (currentDetail.value) currentDetail.value.hasUnpublishedEdits = false
    if (node) node.hasUnpublishedEdits = false
    ElMessage.success('已发布（正文与 REFERENCE 附件已重新切片并纳入检索）')
  } catch (e) {
    ElMessage.error(errMsg(e, '发布失败'))
  } finally {
    publishing.value = false
  }
}

// ==================== REFERENCE 附件（补充材料） ====================

/** 拉取当前文档的 REFERENCE 附件列表（含原文件名，后端已拼好） */
async function loadAttachments(docId: number) {
  if (!docId) {
    attachments.value = []
    return
  }
  try {
    attachments.value = await listKbAttachments(docId)
  } catch {
    // 列表失败不影响正文编辑，静默留空，避免误伤主流程
    attachments.value = []
  }
}

/** 触发隐藏文件框（仅已保存文档可挂附件，需 docId） */
function pickAttFile() {
  if (!currentId.value) {
    ElMessage.warning('请先保存文档，再添加附件')
    return
  }
  attFileInput.value?.click()
}

/**
 * 附件增 / 删 / 切换检索都会影响下次发布的切片，后端已同步刷新文档 updatedAt。
 * 这里前端乐观置同一标志，不重新拉详情——拉详情会覆盖用户未保存的编辑内容。
 */
function markAttDirty() {
  if (current.value?.status === 'PUBLISHED') current.value.hasUnpublishedEdits = true
  if (currentNode.value?.status === 'PUBLISHED') currentNode.value.hasUnpublishedEdits = true
}

/** 选文件 → 上传 → 登记 REFERENCE 关系 → 刷新（发布时才切片） */
async function onAttFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = '' // 允许重复选同一文件
  if (!file || !currentId.value) return
  // 兜底校验：accept 只是浏览器建议，切「所有文件」或拖拽仍可绕过；后端解析不了的格式
  // 上传后发布会被静默跳过，必须在入口拦下并说清原因，别让用户白等一个搜不到的附件。
  const ext = kbAttachExt(file.name)
  if (!KB_ATTACH_EXTS.includes(ext)) {
    ElMessage.warning(`「${file.name}」格式不支持，AI 无法解析。仅支持：${KB_ATTACH_EXTS.join(' / ')}`)
    return
  }
  uploadingAtt.value = true
  try {
    const f = new FormData()
    f.append('file', file)
    f.append('bizType', 'kb_doc')
    f.append('bizId', String(currentId.value))
    // 不带 classify：后端按 V206 契约落 ATTACHMENT
    const vo = await uploadFile(f)
    await addKbAttachment(currentId.value, vo.id)
    attachments.value = await listKbAttachments(currentId.value)
    attachmentsCollapsed.value = false // 添加后自动展开：让用户立即看到刚加的附件，别以为没加上
    markAttDirty()
    ElMessage.success('附件已添加（发布后纳入检索）')
  } catch (err) {
    ElMessage.error(errMsg(err, '附件添加失败'))
  } finally {
    uploadingAtt.value = false
  }
}

/** 切换是否纳入检索：乐观更新开关，后端改登记层 indexable，下次发布生效 */
async function setAttIndexable(a: KbAttachment, v: number) {
  try {
    await setKbAttachmentIndexable(a.id, v)
    markAttDirty()
  } catch (err) {
    a.indexable = v === 1 ? 0 : 1 // 失败回滚
    ElMessage.error(errMsg(err, '切换检索开关失败'))
  }
}

/** 删除附件关系（仅登记层，不删原文件） */
async function removeAtt(a: KbAttachment) {
  try {
    await ElMessageBox.confirm(`移除附件「${a.originalName || ('文件 #' + a.fileId)}」？`, '提示', { type: 'warning' })
  } catch {
    return
  }
  try {
    await removeKbAttachment(a.id)
    attachments.value = attachments.value.filter((x) => x.id !== a.id)
    markAttDirty()
    ElMessage.success('已移除')
  } catch (err) {
    ElMessage.error(errMsg(err, '移除失败'))
  }
}

/** 下载 / 预览：OSS 绝对签名 URL 直连；本地相对路径带 token 拉 blob 打开 */
async function downloadAtt(a: KbAttachment) {
  try {
    const url = await downloadFileUrl(a.fileId)
    if (url.startsWith('http')) {
      window.open(url, '_blank', 'noopener')
      return
    }
    const blob = await fetchFileBlob(url)
    const obj = URL.createObjectURL(blob)
    const w = window.open(obj, '_blank', 'noopener')
    if (!w) ElMessage.warning('浏览器拦截了新标签页，请允许弹窗后重试')
  } catch (err) {
    ElMessage.error(errMsg(err, '附件打开失败'))
  }
}
</script>

<template>
  <div class="knowledge-page">
    <el-alert type="info" :closable="false" show-icon class="kb-tip">
      <template #title>
        知识库管理端 · <b>树形结构（V208 方案 A）</b>、MD 编辑器、统一渲染管线与
        <b>后端 KB CRUD 已接入（步骤 4.5）</b>；<b>切片与检索（步骤 5）已接入</b>：
        发布时正文重新切片，REFERENCE 附件解析后一并纳入 AI 检索。
        <el-button link type="primary" size="small" style="margin-left: 8px" @click="showRetrieve = true">
          检索测试
        </el-button>
      </template>
    </el-alert>
    <el-alert v-if="loadError" type="error" :closable="false" show-icon class="kb-tip">
      <template #title>
        后端 KB 接口不可用：{{ loadError }}。请确认后端服务已启动，且目标库已执行 V206~V209 迁移。
        <el-button link size="small" type="primary" @click="refreshNodes">重试</el-button>
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
              :title="createHint('新建文档')"
              @click="openCreate('DOC')"
            >文档</el-button>
            <el-button
              v-has-perm="['ai:kb:edit']"
              size="small"
              :icon="Folder"
              :title="createHint('新建文件夹')"
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

        <!-- §28/§29：树顶部不再放常驻占位。原来点文件夹会冒出「新建位置」提示条、
             点文档会冒出面包屑，两者在 264px 侧栏里都挤占树的高度且信息冗余；
             节点聚焦边框也按 §29 反馈移除。落点由两个新建按钮的 tooltip + 树内
             三点菜单「在此新建」表达，树本身已展示层级。 -->
        <el-tree
          ref="treeRef"
          v-loading="loading"
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
          :empty-text="treeEmpty.title"
          @node-click="onNodeClick"
          @node-drop="onNodeDrop"
        >
          <!-- 空态只在树内渲染一次；树外不再叠加 el-empty（避免重复占位） -->
          <template #empty>
            <div class="kb-tree-empty">
              <el-icon class="kb-tree-empty-icon">
                <Search v-if="treeKeyword.trim()" />
                <Folder v-else />
              </el-icon>
              <p class="kb-tree-empty-title">{{ treeEmpty.title }}</p>
              <p class="kb-tree-empty-hint">{{ treeEmpty.hint }}</p>
            </div>
          </template>
          <template #default="{ data }">
            <div
              class="kb-node"
              :class="{ 'is-active': data.id === currentId }"
            >
              <el-icon v-if="data.nodeType === 'FOLDER'" class="kb-node-icon"><Folder /></el-icon>
              <!-- 文档用真正的 Document 图标（原来是个空心方框 .kb-doc-glyph，辨识度差） -->
              <el-icon v-else class="kb-node-icon kb-node-icon-doc"><Document /></el-icon>
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
                <!-- 状态点：草稿空心灰环 / 已发布绿实心 / 待审核橙 / 归档灰；
                     所有 DOC 都渲染（旧版只给已发布一个点，草稿完全看不出来） -->
                <span
                  v-if="data.nodeType === 'DOC'"
                  class="kb-node-dot"
                  :class="[statusMeta(data.status).cls, { 'has-unpublished': data.hasUnpublishedEdits }]"
                  :title="data.hasUnpublishedEdits ? '有未发布修改（重新发布后生效）' : statusMeta(data.status).hint"
                />
                <span
                  v-has-perm="['ai:kb:edit']"
                  class="kb-node-more"
                  :class="{ 'is-menu-open': openMenuNodeId === data.id }"
                  @click.stop
                >
                  <!-- 唯一外露操作：inline 重命名 -->
                  <el-button
                    link
                    size="small"
                    class="kb-node-act"
                    :icon="EditPen"
                    title="重命名"
                    @click.stop="startRename(data)"
                  />
                  <!-- 其余操作收进三点菜单：@command 统一派发，菜单 teleport 到 body
                       不会冒泡触发 el-tree 的 node-click；is-menu-open 让 trigger 在
                       菜单浮层打开期间保持可见（此时树节点已不再 hover）。 -->
                  <el-dropdown
                    trigger="click"
                    placement="bottom-end"
                    @command="onNodeCommand($event, data)"
                    @visible-change="onMenuVisibleChange($event, data.id)"
                  >
                    <el-button
                      link
                      size="small"
                      class="kb-node-act"
                      :icon="MoreFilled"
                      title="更多操作"
                      @click.stop
                    />
                    <template #dropdown>
                      <el-dropdown-menu class="kb-node-menu">
                        <el-dropdown-item
                          v-if="data.nodeType === 'FOLDER'"
                          command="create-doc"
                          :icon="Plus"
                        >在此新建文档</el-dropdown-item>
                        <el-dropdown-item
                          v-if="data.nodeType === 'FOLDER'"
                          command="create-folder"
                          :icon="Folder"
                        >在此新建文件夹</el-dropdown-item>
                        <!-- 上移 / 下移：同父相邻兄弟作锚点，首尾边界禁用 -->
                        <el-dropdown-item
                          command="move-up"
                          :icon="ArrowUp"
                          :divided="data.nodeType === 'FOLDER'"
                          :disabled="!canMoveByStep(data, 'up')"
                        >上移</el-dropdown-item>
                        <el-dropdown-item
                          command="move-down"
                          :icon="ArrowDown"
                          :disabled="!canMoveByStep(data, 'down')"
                        >下移</el-dropdown-item>
                        <el-dropdown-item command="move" :icon="Rank">移动到…</el-dropdown-item>
                        <el-dropdown-item
                          command="delete"
                          :icon="Delete"
                          divided
                          class="is-danger"
                        >删除</el-dropdown-item>
                      </el-dropdown-menu>
                    </template>
                  </el-dropdown>
                </span>
              </template>
            </div>
          </template>
        </el-tree>

        <div class="kb-sidebar-foot">
          <span>{{ nodes.length }} 个节点</span>
          <span v-if="lazyMode" class="kb-lazy-hint">超阈值 · 应切懒加载</span>
          <span v-else>骨架一次全量</span>
        </div>
      </aside>

      <!-- 右：编辑 / 预览。单行 header：标题在左，三组控件按 ①②③ 顺序靠右 -->
      <!-- §26 A 方案：只有选中了文档才渲染编辑器；无选中一律走下方统一空态，
           不再出现「可写、但没有落库归属、点保存静默 return」的裸编辑器。 -->
      <el-card v-if="current" shadow="never" class="kb-main">
        <template #header>
          <div class="kb-main-head">
            <!-- 唯一输入框：文档标题（飞书式无框大字，对应正文 H1） -->
            <el-input v-model="form.title" placeholder="文档标题" class="kb-title-input" />
            <div class="kb-head-actions">
              <!-- 状态徽章：显式区分草稿 / 已发布，并标出相对已保存版本的未保存改动；
                   已发布文档保存草稿后显示「有未发布修改」（保存不改发布态，但 AI 检索的还是旧版） -->
              <span
                v-if="current"
                class="kb-status"
                :class="currentStatus.cls"
                :title="hasUnpublishedEdits ? '已发布版本与当前草稿不一致，重新发布后生效' : currentStatus.hint"
              >
                {{ currentStatus.label }}<span v-if="isDirty" class="kb-status-dirty">· 未保存</span><span v-else-if="hasUnpublishedEdits" class="kb-status-dirty">· 有未发布修改</span>
              </span>
              <!-- ① 次要项：结构检查（DEBUG-ONLY）+ 文档信息 -->
              <div class="kb-minor-actions">
                <!-- DEBUG-ONLY START（触发按钮）：删除时连同下方结构检查弹窗一起移除，布局零影响 -->
                <el-button link size="small" @click="showCheck = true">结构检查</el-button>
                <!-- DEBUG-ONLY END -->
                <!-- 文档信息：只读概览，替代原「文档属性」摘要编辑（后端零消费） -->
                <el-button link size="small" :disabled="!current" @click="showInfo = true">
                  文档信息
                </el-button>
              </div>
              <!-- ② 现代化分段控件：替换 el-radio-group，去掉 radio 圆点与异常图标 -->
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
              <!-- ③ 操作项：保存草稿（warning，左）/ 发布（primary，右），删除已收敛到树节点三点菜单。
                   发布 = 先静默保存当前编辑内容再发布该版本（保存与发布同步，不出现「已发布·未保存」歧义） -->
              <div class="kb-actions">
                <el-button
                  v-has-perm="['ai:kb:edit']"
                  type="warning"
                  :disabled="!current"
                  @click="save"
                >保存草稿</el-button>
                <el-button
                  v-has-perm="['ai:kb:publish']"
                  type="primary"
                  :disabled="!current"
                  :loading="publishing"
                  @click="publish"
                >发布</el-button>
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
          @save="save"
        />
        <!-- 滚动容器必须是本页原生 div：scoped 样式 100% 命中，flex:1 + min-height:0
             的高度链才闭合。旧写法把 class 传给 MarkdownView → RichView 手动 v-bind
             到跨组件内部节点（Fragment 双根），scoped 与高度链都不稳 → 预览没有滚动条。
             MarkdownView（MdPreview 渲染器，与编辑器内置预览同源）同样不承载滚动。 -->
        <div v-else class="kb-preview">
          <MarkdownView :content="form.contentMd" />
        </div>

        <!-- REFERENCE 附件（补充材料）：发布时解析切片纳入 AI 检索；置于卡片体底部，
             固定高度独立区块，不挤占上方编辑器/预览的 flex:1 高度 -->
        <section class="kb-attachments">
          <div class="kb-attach-head">
            <!-- 整行标题即收起 / 展开开关：箭头随状态旋转，数量 badge + 摘要在收起态也可见 -->
            <button
              type="button"
              class="kb-attach-toggle"
              :aria-expanded="!attachmentsCollapsed"
              title="点击展开 / 收起附件列表"
              @click="attachmentsCollapsed = !attachmentsCollapsed"
            >
              <el-icon class="kb-attach-caret" :class="{ 'is-open': !attachmentsCollapsed }"><ArrowDown /></el-icon>
              <span class="kb-attach-title">附件（补充材料）</span>
              <span v-if="attachments.length" class="kb-attach-count">{{ attachments.length }}</span>
              <span class="kb-attach-summary">{{ attachmentSummary }}</span>
            </button>
            <span class="kb-attach-spacer" />
            <el-button
              v-has-perm="['ai:kb:edit']"
              size="small"
              type="primary"
              :icon="Plus"
              :loading="uploadingAtt"
              :disabled="!currentId"
              @click="pickAttFile"
            >添加附件</el-button>
            <input ref="attFileInput" type="file" hidden :accept="KB_ATTACH_ACCEPT" @change="onAttFileChange" />
          </div>
          <el-collapse-transition>
          <div v-show="!attachmentsCollapsed && attachments.length" class="kb-attach-list">
            <div v-for="a in attachments" :key="a.id" class="kb-attach-item">
              <el-icon class="kb-attach-icon"><Document /></el-icon>
              <button type="button" class="kb-attach-name" @click="downloadAtt(a)">
                {{ a.originalName || ('文件 #' + a.fileId) }}
              </button>
              <span class="kb-attach-meta">fileId {{ a.fileId }}</span>
              <span class="kb-attach-spacer" />
              <el-switch
                v-has-perm="['ai:kb:edit']"
                v-model="a.indexable"
                :active-value="1"
                :inactive-value="0"
                active-text="检索"
                inactive-text="不检索"
                size="small"
                @change="(v: number) => setAttIndexable(a, v)"
              />
              <el-button
                v-has-perm="['ai:kb:edit']"
                link
                type="danger"
                size="small"
                :icon="Delete"
                title="移除附件"
                @click="removeAtt(a)"
              />
            </div>
          </div>
          </el-collapse-transition>
          <p v-if="!attachments.length && !attachmentsCollapsed" class="kb-attach-empty">
            暂无附件。添加 docx / xlsx / pdf / txt 等文件，发布后即可被 AI 检索并引用。
          </p>
        </section>
      </el-card>
      <!-- 无选中文档：右侧唯一落地状态。零文档 / 有文档未选中 / 接口异常由 emptyState
           区分；新建入口沿用 openCreate，继承 activeFolderId 记录的「新建位置」。 -->
      <el-card v-else shadow="never" class="kb-main kb-main-empty">
        <div class="kb-empty">
          <el-icon class="kb-empty-icon"><Document /></el-icon>
          <p class="kb-empty-title">{{ emptyState.title }}</p>
          <p class="kb-empty-hint">{{ emptyState.hint }}</p>
          <div v-if="emptyState.canCreate" class="kb-empty-actions">
            <el-button
              v-has-perm="['ai:kb:edit']"
              type="primary"
              :icon="Plus"
              @click="openCreate('DOC')"
            >新建文档</el-button>
            <el-button
              v-has-perm="['ai:kb:edit']"
              :icon="Folder"
              @click="openCreate('FOLDER')"
            >新建文件夹</el-button>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 节点移动：飞书式「移动到」目录树单选弹窗。
         候选由 buildKbMoveTargets 生成：虚拟根 + 仅 FOLDER、已排除自身与后代；
         拖拽仍保留，二者共用 applyMove，防环口径前后端一致。 -->
    <el-dialog v-model="showMove" title="移动到" width="440px" append-to-body>
      <p class="kb-move-sub">将「{{ moveNode?.title }}」移动到：</p>
      <div class="kb-move-tree">
        <!-- v-if 让每次打开都重建树，保证 current-node-key 选中「当前所在位置」 -->
        <el-tree
          v-if="showMove"
          :data="moveTargets"
          :props="{ label: 'label', children: 'children' }"
          node-key="id"
          :current-node-key="moveSelectedId"
          default-expand-all
          highlight-current
          :expand-on-click-node="false"
          @node-click="onMoveTargetClick"
        />
      </div>
      <p class="kb-move-selected">
        目标位置：<b>{{ moveSelectedLabel || '—' }}</b>
        <span v-if="moveSelectedId === moveNode?.parentId">（当前位置，无需移动）</span>
      </p>
      <template #footer>
        <el-button @click="showMove = false">取消</el-button>
        <el-button type="primary" :loading="moving" :disabled="!moveCanSubmit" @click="submitMove">
          确定
        </el-button>
      </template>
    </el-dialog>

    <!-- 文档信息：只读概览。原摘要字段后端全链路零消费（切片只取正文、检索不读），
         改造为真正有用的文档元信息，避免「看着能填其实没用」的假入口。 -->
    <el-dialog v-model="showInfo" title="文档信息" width="560px" append-to-body>
      <!-- 布局对齐「日志详情」面板：el-descriptions 两列带边框，标签在左、值在右，
           文档 ID 独占整行（同操作日志详情的「备注」:span=2）。--> 
      <el-descriptions class="kb-info-desc" :column="2" border label-width="88px">
        <el-descriptions-item label="状态">
          <span :class="currentStatus.cls">{{ currentStatus.label }}</span>
          <em v-if="hasUnpublishedEdits" class="kb-info-flag">有未发布修改</em>
        </el-descriptions-item>
        <el-descriptions-item label="版本">v{{ current?.version ?? 0 }}</el-descriptions-item>
        <el-descriptions-item label="正文字数">{{ wordCount }}</el-descriptions-item>
        <el-descriptions-item label="章节数">{{ headings.length }}</el-descriptions-item>
        <el-descriptions-item label="附件数">{{ attachments.length }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ current?.updatedAt ?? '—' }}</el-descriptions-item>
        <el-descriptions-item label="文档 ID" :span="2">
          <span class="kb-info-mono">{{ current?.id ?? '—' }}</span>
        </el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button type="primary" @click="showInfo = false">关闭</el-button>
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

    <!-- 检索测试（P0-2）：复用线上 KbRetriever，直观看召回了哪些片段/相关度/出处 -->
    <el-dialog
      v-model="showRetrieve"
      title="检索测试 · 召回明细"
      width="920px"
      append-to-body
    >
      <el-alert type="info" :closable="false" show-icon class="kb-retrieve-tip">
        <template #title>
          以当前登录人身份检索，结果已经过 ACL + 出域策略过滤 —— 调试看到的 = AI 助手实际拿到的。
        </template>
      </el-alert>
      <el-form :inline="true" @submit.prevent>
        <el-form-item label="问题 / 关键词">
          <el-input
            v-model="retrieveQuery"
            placeholder="如：飞星报销怎么走"
            clearable
            style="width: 360px"
            @keyup.enter="runRetrieve"
          />
        </el-form-item>
        <el-form-item label="召回条数">
          <el-input-number v-model="retrieveTopK" :min="1" :max="8" size="small" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" :loading="retrieveLoading" @click="runRetrieve">
            检索
          </el-button>
        </el-form-item>
      </el-form>

      <div v-if="retrieveResult" class="kb-retrieve-meta">
        命中 <b>{{ retrieveResult.total }}</b> 条 · 耗时 {{ retrieveResult.elapsedMs }}ms ·
        topK={{ retrieveResult.topK }}
      </div>
      <el-table v-loading="retrieveLoading" :data="retrieveResult?.hits ?? []" border size="small" max-height="420">
        <el-table-column prop="score" label="相关度" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="scoreTagType(row.score)" size="small">{{ row.score.toFixed(2) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="文档 / 章节" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <span class="kb-retrieve-title">{{ row.title || ('文档 #' + row.docId) }}</span>
            <span v-if="row.headingPath" class="kb-retrieve-heading"> › {{ row.headingPath }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="命中片段" min-width="300" show-overflow-tooltip />
        <el-table-column label="出处 sourceRef" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <code class="kb-retrieve-ref">{{ row.sourceRef || '—' }}</code>
          </template>
        </el-table-column>
        <el-table-column prop="sourceType" label="来源" width="110" align="center">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ row.sourceType }}</el-tag>
          </template>
        </el-table-column>
        <template #empty>
          <div class="kb-retrieve-empty">
            {{ retrieveResult ? '本次检索无命中（检查查询词是否与文档原文重合，或文档是否已发布）' : '输入问题后点「检索」查看召回明细' }}
          </div>
        </template>
      </el-table>

      <template #footer>
        <el-button @click="showRetrieve = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.knowledge-page {
  /* 外层 AdminLayout .view-wrap 已有 padding: var(--fs-content-padding)=16px，
     本层不再叠 12px。height:100% 由 flex 祖先链确定。 */
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
/* §28：树顶部两条常驻占位移除后，搜索框与树之间仍留呼吸间距，
   避免目录树首行紧贴搜索框（与界面约定 ⑥ 同一诉求）。 */
.kb-search {
  margin-bottom: 10px;
  flex: none;
}
.kb-tree {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: transparent;
}
/* 树内唯一空态：替代原先树外的 el-empty。顶部刻意留出间距，避免「暂无文档」
   紧贴搜索框显得顶头（2026-11-09 截图）；只在空态自身加 padding，不撑高容器。 */
.kb-tree :deep(.el-tree__empty-block) {
  min-height: 0;
  padding: 16px 8px;
}
.kb-tree-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding-top: 48px;
  color: var(--el-text-color-secondary);
}
.kb-tree-empty-icon {
  font-size: 30px;
  color: var(--el-text-color-placeholder);
  opacity: 0.55;
}
.kb-tree-empty-title {
  margin: 0;
  font-size: 13px;
}
.kb-tree-empty-hint {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-placeholder);
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
/* 活动文件夹的「新建位置」聚焦边框已移除（§29 反馈：无明显引导作用）；
   落点可发现性改由新建按钮 tooltip + 树内三点菜单「在此新建」承担，
   故 .kb-node.is-folder-active 整段样式已删除。 */
.kb-node-icon {
  flex: none;
  font-size: 15px;
  color: var(--el-text-color-secondary);
}
/* 文档图标淡蓝、文件夹中性灰：树里一眼区分类型，不再是「一个框」 */
.kb-node-icon-doc {
  color: var(--el-color-primary-light-3);
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
/* 状态点：实心绿=已发布，空心灰环=草稿，橙=待审核，灰=已归档 */
.kb-node-dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--el-color-success);
}
.kb-node-dot.is-draft {
  background: transparent;
  box-shadow: 0 0 0 1.5px var(--el-text-color-placeholder) inset;
}
.kb-node-dot.is-review {
  background: var(--el-color-warning);
}
.kb-node-dot.is-archived {
  background: var(--el-text-color-placeholder);
}
/* 已发布但有未发布修改：直接把圆点染成橙色，与纯已发布的绿点一眼可分（不套外圈） */
.kb-node-dot.has-unpublished {
  background: var(--el-color-warning);
}
/* header 状态徽章：原生 span + 淡底，不依赖 el-tag 按需注册 */
.kb-status {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  color: var(--el-text-color-regular);
  background: var(--el-fill-color-light);
  border: 1px solid var(--el-border-color-lighter);
}
.kb-status::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-text-color-placeholder);
}
.kb-status.is-published {
  color: var(--el-color-success);
  background: var(--el-color-success-light-9);
  border-color: var(--el-color-success-light-7);
}
.kb-status.is-published::before {
  background: var(--el-color-success);
}
.kb-status.is-review {
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
  border-color: var(--el-color-warning-light-7);
}
.kb-status.is-review::before {
  background: var(--el-color-warning);
}
.kb-status.is-archived {
  color: var(--el-text-color-secondary);
}
.kb-status-dirty {
  color: var(--el-color-warning);
  font-size: 11px;
}
.kb-node-more {
  display: inline-flex;
  align-items: center;
  flex: none;
  gap: 0;
  visibility: hidden;
}
/* 菜单 teleport 到 body 后树节点不再 hover，靠 is-menu-open 保持三点按钮可见 */
.kb-tree :deep(.el-tree-node__content:hover) .kb-node-more,
.kb-node-more.is-menu-open {
  visibility: visible;
}
/* 两个 link 按钮在 264px 侧栏里只留图标热区，去掉默认 padding 与相邻 margin */
.kb-node-act {
  padding: 2px;
  margin: 0;
  height: auto;
  font-size: 15px;
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
/* §26 A 方案：无选中文档的右侧统一空态，复用 .kb-main 的高度链，内容垂直水平居中 */
.kb-main-empty :deep(.el-card__body) {
  align-items: center;
  justify-content: center;
}
.kb-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  max-width: 420px;
  text-align: center;
}
.kb-empty-icon {
  font-size: 46px;
  color: var(--el-color-primary-light-5);
  opacity: 0.75;
}
.kb-empty-title {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.kb-empty-hint {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--el-text-color-secondary);
}
.kb-empty-actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}
/* 单行 header：标题 flex:1 撑开，三组控件在 .kb-head-actions 内按 ①②③ 靠右、不换行。
   （原 .kb-head-top / .kb-head-bottom 两行布局已废弃，见界面约定 ④） */
.kb-main-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
}
.kb-head-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
}
/* 唯一输入框：默认无框大字；hover 出淡四边框、聚焦出主色四边框 */
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
  /* 保存草稿 / 发布两按钮收紧，与组间 10px 形成层次：组内紧、组间松 */
  gap: 2px;
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
  /* flex 子项默认 min-width:auto，超宽代码块会把编辑器撑破到右侧 AI 面板上。
     显式归零，配合 MarkdownEditor 内的代码块限宽，双重防溢出。 */
  min-width: 0;
}
.kb-preview {
  flex: 1;
  /* 与编辑器 .kb-md-editor.is-fill 的 480px 保底对齐：渲染器异步 chunk 加载期间
     骨架站住高度，预览区不塌成一条线、页面不跳动。加载完成后由 flex:1 接管。 */
  min-height: 480px;
  overflow: auto;
  padding: 12px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}
/* 「移动到」弹窗：目录树限高滚动，层级再深也不撑破弹窗 */
.kb-move-sub {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}
.kb-move-tree {
  max-height: 320px;
  overflow: auto;
  padding: 6px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
}
.kb-move-selected {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.kb-move-selected b {
  color: var(--el-text-color-primary);
}
/* 文档信息面板：el-descriptions 两列表格（对齐日志详情），仅保留状态色 + 未发布标记 */
.kb-info-desc .is-published {
  color: var(--el-color-success);
}
.kb-info-desc .is-draft {
  color: var(--el-text-color-regular);
}
.kb-info-flag {
  margin-left: 8px;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-style: normal;
  color: var(--el-color-warning);
  background: var(--el-color-warning-light-9);
}
.kb-info-mono {
  font-family: var(--el-font-family-mono, monospace);
  font-size: 13px;
}
.kb-check-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  font-size: 13px;
  /* 高度上限 + 每列独立滚动：内容多（如长锚点列表）时弹窗不撑爆视口，
     出滚动条而非溢出（虎哥 2026-11-09：结构检查弹窗加高度/滚动条）。 */
  max-height: 62vh;
  overflow: hidden;
}
.kb-check-grid > div {
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
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
/* ===== 检索测试（P0-2）===== */
.kb-retrieve-tip {
  margin-bottom: 14px;
}
.kb-retrieve-meta {
  margin: 4px 0 10px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.kb-retrieve-meta b {
  color: var(--el-color-primary);
}
.kb-retrieve-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.kb-retrieve-heading {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.kb-retrieve-ref {
  font-size: 12px;
  color: var(--el-color-primary);
  word-break: break-all;
}
.kb-retrieve-empty {
  padding: 24px 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
/* REFERENCE 附件卡片区：卡片体 flex 列内固定高度、独立滚动，不挤占编辑器/预览 */
.kb-attachments {
  flex: none;
  border-top: 1px solid var(--el-border-color-lighter);
  margin-top: 12px;
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.kb-attach-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.kb-attach-title {
  font-size: 14px;
  font-weight: 600;
}
/* 收起 / 展开开关：整行标题可点，箭头旋转指示状态，hover 有反馈 */
.kb-attach-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-primary);
  cursor: pointer;
}
.kb-attach-toggle:hover {
  background: var(--el-fill-color-light);
}
.kb-attach-caret {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  transform: rotate(-90deg); /* 收起态箭头朝右，提示可展开 */
  transition: transform 0.2s ease;
}
.kb-attach-caret.is-open {
  transform: rotate(0); /* 展开态箭头朝下 */
}
/* 数量 badge：收起态也能一眼看到有几个附件 */
.kb-attach-count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}
.kb-attach-summary {
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}
.kb-attach-spacer {
  flex: 1;
}
.kb-attach-list {
  --kb-attach-row: 40px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* 满 3 条即滚动：3 * 40 + 2 * 8 = 136px，第 4 条起出滚动条 */
  max-height: calc(var(--kb-attach-row) * 3 + 16px);
  overflow-y: auto;
}
.kb-attach-item {
  height: var(--kb-attach-row);
  box-sizing: border-box;
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-bg-color-page);
}
.kb-attach-icon {
  color: var(--el-color-primary);
  flex: none;
}
.kb-attach-name {
  flex: none;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  background: none;
  border: none;
  padding: 0;
  color: var(--el-color-primary);
  cursor: pointer;
  font-size: 13px;
}
.kb-attach-name:hover {
  text-decoration: underline;
}
.kb-attach-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex: none;
}
.kb-attach-empty {
  margin: 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>

<!-- 三点菜单浮层 teleport 到 body，scoped 选择器不保证命中 dropdown-item 内部 li；
     用全局样式 + .kb-node-menu 精确前缀，只作用于本页菜单，不污染其它页面。 -->
<style>
.kb-node-menu .el-dropdown-menu__item.is-danger {
  color: var(--el-color-danger);
}
.kb-node-menu .el-dropdown-menu__item.is-danger:hover,
.kb-node-menu .el-dropdown-menu__item.is-danger:focus {
  background: var(--el-color-danger-light-9);
  color: var(--el-color-danger);
}
</style>
