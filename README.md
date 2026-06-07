# 医疗废物转运交接系统

全栈 Web 应用，实现医疗废物从科室打包、转运员称重交接、到后勤主管查看去向的完整流程。

## 功能特性

### 业务流程
1. **科室打包** - 科室人员打包医废，选择周转箱，记录包装状态
2. **转运员称重交接** - 转运员称重、检查包装、完成交接
3. **后勤主管查看** - 查看所有交接记录、统计数据和去向

### 核心业务规则
- ✅ **包装破损不能交接** - 破损包装会被系统阻止进行称重交接
- ✅ **重量超过上限要拆箱** - 超过周转箱承重上限时提示拆箱分装
- ✅ **签收后重量不可修改** - 已签收的交接记录无法再修改重量

## 技术栈

- **后端**: Node.js + Express + SQLite (better-sqlite3)
- **前端**: 原生 HTML + CSS + JavaScript (单页应用)
- **部署**: Docker + docker-compose

## 快速开始

### 方式一：Docker 启动（推荐）

```bash
# 构建并启动
docker-compose up -d --build

# 查看日志
docker-compose logs -f

# 停止
docker-compose down
```

启动后访问: http://localhost:3000

### 方式二：本地启动

```bash
# 进入后端目录
cd backend

# 安装依赖
npm install

# 初始化数据库（首次运行）
npm run init-db

# 启动服务
npm start
```

启动后访问: http://localhost:3000

## 验证业务规则

启动服务后，运行测试脚本验证核心业务规则：

```bash
node test-rules.js
```

测试项包括：
1. 获取基础数据（科室、周转箱）
2. 创建正常包装的交接记录
3. 创建破损包装的交接记录
4. **破损包装不能交接称重**（重点验证）
5. 正常包装可以称重交接
6. **重量超过周转箱上限要拆箱**（重点验证）
7. 正常签收流程
8. **签收后交接重量不可修改**（重点验证）
9. 后勤主管查看统计数据

## 项目结构

```
.
├── backend/
│   ├── server.js          # 后端服务器主文件
│   ├── init-db.js         # 数据库初始化脚本
│   ├── package.json       # 后端依赖
│   └── data/              # SQLite 数据库文件目录
├── frontend/
│   └── index.html         # 前端单页应用
├── Dockerfile             # Docker 镜像构建文件
├── docker-compose.yml     # Docker Compose 配置
├── test-rules.js          # 业务规则测试脚本
└── README.md              # 项目说明
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/departments | 获取所有科室 |
| GET | /api/containers | 获取所有周转箱 |
| GET | /api/containers/available | 获取可用周转箱 |
| GET | /api/transfers | 获取交接记录列表 |
| GET | /api/transfers/:id | 获取单条交接记录详情 |
| POST | /api/transfers | 创建交接记录（科室打包） |
| PUT | /api/transfers/:id/weigh | 称重交接 |
| PUT | /api/transfers/:id/sign | 签收 |
| PUT | /api/transfers/:id/update-damage | 更新包装破损状态 |
| GET | /api/stats | 获取统计数据 |

## 初始数据

系统初始化时自动创建：
- **科室**: 内科、外科、急诊科、检验科、手术室、放射科
- **周转箱**: BOX001(25kg)、BOX002(25kg)、BOX003(20kg)、BOX004(20kg)、BOX005(30kg)
