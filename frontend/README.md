# Frontend 快速导览（给非前端同学）

这份文档的目标：用最少的文件，把本项目的前端“层级 + 脉络”讲清楚。

## 一句话架构

React(页面) + React Router(路由) + Zustand(状态/流程) + Axios(API 调用) + Ant Design(UI 组件/主题) + Vite(开发/构建)。

## 从浏览器到页面：入口与路由

1. `frontend/index.html`：只有一个挂载点 `<div id="root">`。
2. `frontend/src/main.tsx`：把 `<App />` 渲染到 `#root`，并用 `ConfigProvider` 设置 Ant Design 中文与全局主题。
3. `frontend/src/App.tsx`：全站路由表 + 登录保护。
   - `/login`：公开页面
   - 其它路径：必须有 token（`ProtectedRoute`），并统一渲染在 `MainLayout` 里（侧边栏/顶栏 + `<Outlet />` 内容区）

## 页面在哪里：Pages

页面组件都在 `frontend/src/pages/`，每个文件基本对应一个路由：
- `Dashboard.tsx`：概览仪表盘（会请求统计数据）
- `FaceSegmentationUpload.tsx`：掌子面分割上传
- `CrackDetectionUpload.tsx`：裂缝检测上传
- `History.tsx`：历史记录列表
- `Report.tsx`：单个任务报告页（路由参数 `:id`）
- `Settings.tsx`：系统设置

## “业务流程”在哪里：Stores（最重要）

前端的“动作/流程编排”集中在 `frontend/src/stores/`：
- `useAuthStore.ts`：登录、保存 token、拉取当前用户（`/api/v1/auth/*`）
- `useAnalysisStore.ts`：上传→创建任务→实时进度（WebSocket）→失败回退轮询→拿到结果
- `useAppSettingsStore.ts`：一些默认配置（如面积/比例尺默认值）

理解页面最快的方法：在页面里搜 `useXxxStore()`，看它调用了 store 的哪个 action。

## 后端接口怎么调：API 层

`frontend/src/api/client.ts` 做了两层事：
- Axios 实例：自动把 `localStorage` 的 token 加到 `Authorization`；遇到 `401` 自动跳回 `/login`
- API 函数封装：`authApi` / `analysisApi`，把 `/api/v1/...` 写成可调用函数（包括上传、列表、统计、图片地址等）

本地开发时，Vite 会把前端的 `/api` 代理到后端 `http://localhost:8000`（见 `frontend/vite.config.ts`）。

## 你该怎么读代码（推荐顺序）

1. `src/main.tsx`：应用怎么启动
2. `src/App.tsx`：有哪些页面路径、哪些需要登录
3. `components/layout/MainLayout.tsx`：系统界面框架（菜单怎么跳转）
4. `api/client.ts`：前端怎么请求后端
5. `stores/useAnalysisStore.ts`：上传与进度的完整链路（WS + 轮询）
6. `pages/FaceSegmentationUpload.tsx` / `pages/CrackDetectionUpload.tsx`：页面如何触发 store 流程并展示结果

## 常用命令

在 `frontend/` 目录：
- `npm run dev`：启动开发服务器（默认 `http://localhost:3000`）
- `npm run build`：打包到 `frontend/dist/`
- `npm run preview`：本地预览打包产物

如果你希望我“手把手”带你走一条链路：告诉我你最关心的功能（例如“上传一张掌子面图片→得到超欠挖报告”），我可以按文件路径逐步讲解每一步数据从哪里来、到哪里去。
