# 更新日志（Changelog）

本项目的所有重要变更将记录在本文件中。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## 0.1.0 - 2026-11-23

自 v0.0.1 以来的第三个迭代周期（2026-11-05 ~ 2026-11-23），对应后端仓库同期发布。

### Added

- **知识库页面**：树形目录（默认折叠）、文档 / 附件挂载、切片检索测试、文档状态管理与状态修复。
- **AI 助手交互升级**：交互重构 + 视觉调整、思考流持久化展示、回复内容支持操作（赞 / 踩 / 复制 / 下载 .md）、模型配置排序与新增配置类型。
- **历史数据导入**：客户 / 货物信息导入（ImportDrawer 通用组件），导出功能格式调整、Excel 列宽优化。
- **系统重置补全**：重置页改走鉴权状态端点 `GET /system/reset/status`，执行重置弹窗补管理员密码校验，完整重置后登出并跳转安装向导。
- **登录锁定解锁**：登录防爆破配套前端（锁定提示 + 解锁入口）。
- **数据看板**：五张 Tab 全量接入（总览 / 应收回款 / 开票 / 项目 / 履约），ECharts 按需引入。
- **性能优化**：路由级空闲预加载（已授权菜单 chunk 空闲预热）、首屏骨架屏占位、异步组件 chunk 下载期骨架屏（ChunkSkeleton）。

### Changed

- **知识库预览统一**：预览 tab 与编辑器内置预览统一为 md-editor-v3（MdPreview）同一条渲染管线与视觉。
- **首页版本号**：改为读取「参数设置 → 基本信息」的 `app_version`（`GET /system/config/about`），硬编码值仅作兜底。
- **用户管理角色列**：标签 ≥3 时折叠为前 2 个 + 「+N」，悬停气泡展示全部角色。
- Element Plus 升级至 ^2.14。

### Fixed

- AI Markdown 连体伪表格拆行修复（含空单元格 / 代码块内 / 带空格连体变体）。
- 全局弹窗统一 `max-height` 限高（600px 上限 + 小屏视口兜底），列表备注列统一 `show-overflow-tooltip`。
- Element Plus 深层按需注册漏组件补齐（ElProgress / ElOptionGroup / ElCollapseTransition）。
- TTS 音色面板按百炼 `cosyvoice-v3-flash` 官方 `_v3` 口径修正。

### 测试与质量

- vitest 达 16 文件 / 135 用例全绿；云效前端流水线新增 `test_step` 执行 `npm run test`。

## 0.0.1 - 2026-11-02

首个发布版本（tag: `v0.0.1`）。

### Added

- Vue 3.5 + Vite + TypeScript + Pinia + Element Plus（深层按需注册）基础工程。
- 三端一套代码多端适配（PortalShell），全局异常兜底、路由权限守卫。
- 登录鉴权双轨：`localStorage lm_token_{role}` + HttpOnly cookie `lm_tokens`。
- 系统安装向导 / 初始化流程。
- 基础系统管理：用户 / 角色 / 菜单 / 字典 / 参数 / 操作日志 / 审计日志。
- 项目、发货、退货、应收、发票、收款、核销等核心业务页面。
- Flowable 工作流审批前端对接。

