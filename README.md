# firestar-manager

火星财务 —— 前端管理后台（`firestar-` = frontend）。

与后端 [`firestar-service`](../firestar-service) 一一对应；后端为 Spring Boot 3 REST 服务。

## 技术栈（已确定）

> 对齐《火星财务系统技术栈文档》与参考项目 fe-media-man-system 的**设计/目录组织**（参考项目本身是 Vue 2 + Vue CLI + Element UI，**本仓库升级为文档指定的 Vue 3 栈**）。

- **Vue 3** + **TypeScript** + **Vite 5**
- **Element Plus 2.8** —— 后台组件库（参考项目用 Element UI 2，已替换）
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
  views/Home.vue       # 示例首页（Element Plus 演示 + 调后端 /ping）
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
