# firestar-manager

火星财务 —— 前端管理后台（`firestar-` = frontend）。

与后端 [`firestar-service`](../firestar-service) 一一对应；后端为 Spring Boot 3 REST 服务。

## 技术栈（已确定）

> 对齐《火星财务系统技术栈文档》与参考项目 fe-media-man-system 的**设计/目录组织**（参考项目本身是 Vue 2 + Vue CLI + Element UI，**本仓库升级为文档指定的 Vue 3 栈**）。

- **Vue 3** + **TypeScript** + **Vite 5**
- **Element Plus ^2.14** —— 后台组件库（参考项目用 Element UI 2，已替换）
- **Pinia 2** —— 状态管理（参考项目用 Vuex 3，已替换）
- **Vue Router 4** —— 路由（参考项目用 Vue Router 3，已替换）
- **Axios 1.7** —— HTTP 客户端
- **dayjs / decimal.js / @vueuse/core / echarts** —— 日期 / 金额精度 / 组合式工具 / 图表（V2 预留）

## 目录结构（已落地）

```
src/
  main.ts              # 入口：挂载 Element Plus / router / pinia
  App.vue              # 根组件（router-view 出口）
  env.d.ts             # Vite 环境变量类型
  router/index.ts      # Vue Router（history 模式，base = BASE_URL）
  stores/index.ts      # Pinia 实例
  stores/app.ts        # 示例应用状态
  views/Home.vue       # 示例首页（Element Plus 演示 + 调后端 DB 自检 /system/db-check）
  utils/request.ts     # Axios 实例（baseURL 指后端，拦截器）
```

> 开发服务器端口 **9090**（避开后端 2025）；后端地址通过 `.env` 的 `VITE_API_BASE` 配置。

## 本地运行

```bash
npm install
npm run dev          # Vite 默认 dev 脚本，监听 9090
```

构建：

```bash
npm run build         # 产物输出 dist/
npm run build:test    # --mode test
npm run build:pre     # --mode pre
npm run build:prod    # --mode production
```

## 与后端对接约定

| 项 | 值 |
| --- | --- |
| 后端地址（dev） | `http://localhost:2025`（vite proxy 转发 `/api`） |
| 后端端口 | `2025` |
| 接口前缀 | 前端以 `/api` 转发并去前缀，命中后端根路径接口 |

## CI / CD

见 [`docs/云效率流水线配置-fe.yaml`](docs/云效率流水线配置-fe.yaml)：Node 构建 → dist 上传制品仓库 → 主机部署到同台 ECS 的 nginx 静态目录。
> 注意：前端 CI 的 Node 工具链 step / 容器、以及 nginx 站点配置需在云效 UI 最终确认（参考后端 CI 的 Java 容器不适用）。

## 分支约定

与后端保持一致：`develop → test →（人工确认）→ master → main → develop`。

## 当前进度（截至 2026-11-22）

- 脚手架已就绪（Vue3 + Vite5 + Element Plus + Pinia + Router4 + Axios），`Home.vue` 演示页可联调后端 DB 自检端点。
- **平台 / 系统类页面已随后端接口补齐**：登录与鉴权态、RBAC 权限、字典、参数设置、协议 / 通知 / 反馈 / 帮助、文件管理，以及**系统初始化与重置向导**（`src/views/system/init-reset.vue`，随后端 InitReset 接口 + V36 菜单种子自动上动态路由，按钮显隐走 `userStore.hasPermission('system:reset')`）。
- **财务业务域页面（立项 / 发货 / 应收 / 收款 / 开票 / 核销 / 退货 / 看板）已随后端 `fin_*` 业务接口补齐**：含发货「承运商 + 运单号 + 附件」三部曲、发货 / 收货弹窗统一 800px 与附件查看、6 个业务详情弹窗编号/批号一键复制、经营看板、系统公告（工作台顶部 warning 公告条）等。
- **性能与体验增强**：路由级空闲预加载（已授权菜单 chunk 空闲预热，消除点击路由空白）、首屏骨架屏占位（消除 JS 执行前纯白）、全局异常兜底（403 / 写操作失败不再静默吞掉）。
- **知识库页面（2026-11-09 起）**：树形目录（默认折叠）、文档 / 附件挂载、切片检索测试、文档状态管理（`src/views/system/knowledge.vue`）。
- **AI 助手交互升级（2026-11-18~21）**：交互重构 + 视觉调整、思考流持久化展示、回复内容支持操作、模型配置排序（`src/views/system/model-config.vue`）。
- **历史数据导入（2026-11-22）**：客户 / 货物信息导入（`src/components/ImportDrawer.vue`），导出功能格式调整。
- **系统重置功能补全（2026-11-22）**：重置页改走鉴权状态端点 `GET /system/reset/status`、执行重置弹窗补管理员密码、完整重置后登出并跳 `/install`。
- **测试与质量**：vitest 16 文件 / 131 用例（安装向导 / 重置 / 路由守卫等）；云效前端流水线新增 test_step 跑 `npm run test`。
- ⚠️ **路径前缀约定**：本文档 / 代码里出现的 `/api` 仅为前端 vite proxy 与生产 nginx 的**代理层**，开发与生产请求均被剥离；浏览器实际请求到后端的真实路径**不含 `/api`**（如 `/system/init/status`）。联调以「后端真实路径」为准。

## 近期变更（截至 2026-11-01，代码已落地、待 git 提交与部署重启）

> 以下改动均已写入工作区源码，但尚未 commit / 未随 jar 重启部署；上线需提交后停服重打 jar + 前端构建，并与后端 V98 迁移同次生效。

- **系统公告（全员弱提示）**：`src/views/dashboard/index.vue` 工作台顶部新增 warning 样式公告条（`v-if` 有内容才显示、长文内部滚动）；数据来自新增只读端点 `GET /system/config/announcement`（与 `/config/flags` 同范式：登录即可访问）；设置页 `param-setting.vue` 标签「登录页公告」→「系统公告」（key 不变）。
- **发货详情附件可查看**：`ShipmentDetailDialog.vue` 发货详情新增「发货附件」缩略图 + 点击预览区（复用签收证据机制）。
- **发货 / 收货弹窗统一**：两个操作子弹窗宽度统一 800px，附件上传控件移至各自窗口最底部。
- **编号 / 批号一键复制**：新增 `components/CopyableText.vue`，立项 / 收款 / 发票 / 应收 / 发货 / 退货共 6 个详情弹窗的高频编号（单号 / 批次 / 发票号码 / 运单号 / 红字单号等）接入悬停复制。
- **首屏与路由预加载**：`router/index.ts` 已授权菜单 chunk 空闲预热（消除点击路由空白）；`index.html` 加首屏骨架屏占位（消除 JS 执行前纯白）。

### 2026-11-05 ~ 2026-11-22

- **登录锁定解锁（11-05）**：登录防爆破配套前端（锁定提示 + 解锁入口，对应后端 V202~V205）。
- **知识库页面（11-09 起）**：树形目录存储 / 默认折叠、文档与附件挂载、切片检索测试、文档状态管理、MD 格式校验关闭。
- **参数设置页面样式优化（11-16）**。
- **AI 助手交互升级（11-18~21）**：Vue 版本升级 + 交互重构 + 视觉调整、思考流持久化、回复内容支持操作、模型配置排序与新增配置类型、DSML 异常修复。
- **导入导出（11-22）**：客户 / 货物信息导入（ImportDrawer）、导出功能格式调整、Excel 列宽优化。
- **系统重置补全（11-22）**：鉴权状态端点 + 管理员密码弹窗 + 完整重置后跳转安装向导。
- **测试补齐（11-22）**：新增 reset / install / router 等测试，vitest 达 16 文件 / 131 用例全绿；CI 新增 test_step。
