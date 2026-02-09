# wr-server-cli

前端项目一键部署到服务器的 CLI 工具，通过 SSH 连接远程服务器，自动完成打包、压缩、上传、备份、解压全流程。

支持 Windows / macOS / Linux，兼容交互式终端与非交互环境（CI/CD、AI 助手）。

## 安装

```bash
npm install -g wr-server-cli
```

> 要求 Node.js >= 20

## 快速开始

### 1. 创建配置文件

在项目根目录创建 `deploy.config.mjs`：

```js
export default {
  projectName: "my-app",
  readyTimeout: 20000,

  qa: {
    name: "测试环境",
    script: "build:qa",
    host: "192.168.1.100",
    port: 22,
    username: "root",
    distPath: "dist",
    webDir: "/var/www/my-app",
    bakDir: "/var/backups/my-app",
    isRemoveRemoteFile: true,
    isRemoveLocalFile: true,
    verifyAddress: "http://192.168.1.100",
  },

  prod: {
    name: "生产环境",
    script: "build:prod",
    host: "10.0.0.1",
    port: 22,
    username: "root",
    distPath: "dist",
    webDir: "/var/www/my-app",
    bakDir: "/var/backups/my-app",
    isRemoveRemoteFile: true,
    isRemoveLocalFile: true,
    verifyAddress: "https://my-app.com",
  },
};
```

### 2. 执行部署

```bash
wr-server deploy -m qa    # 部署到测试环境
wr-server deploy -m prod  # 部署到生产环境
```

如果本地已打包完成，可跳过打包步骤：

```bash
wr-server deploy -m qa --local
```

## 命令参数

```
wr-server deploy [options]
```

| 参数 | 说明 |
|------|------|
| `-m, --mode <env>` | 指定部署环境，如 `dev` / `qa` / `prod` |
| `--local` | 跳过本地打包，直接使用已有产物 |
| `--auto` | 自动模式，跳过所有交互确认 |

## 配置说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|:----:|------|
| `projectName` | `string` | 是 | 项目名称 |
| `readyTimeout` | `number` | 否 | SSH 连接超时时间（毫秒） |

环境名称为配置对象的 key，不限于 `dev` / `qa` / `prod`，可自由定义。

### 环境配置（EnvConfig）

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|:----:|:------:|------|
| `name` | `string` | 是 | - | 环境名称（仅用于提示显示） |
| `script` | `string` | 否 | - | 打包脚本名（对应 `npm run <script>`） |
| `host` | `string` | 是 | - | 服务器地址 |
| `port` | `number` | 是 | - | SSH 端口号 |
| `username` | `string` | 是 | - | 服务器登录用户名 |
| `distPath` | `string` | 是 | - | 本地打包输出目录 |
| `webDir` | `string` | 是 | - | 服务器部署路径（不可为 `/`） |
| `bakDir` | `string` | 否 | - | 远程备份目录（设置后部署前自动备份） |
| `isRemoveRemoteFile` | `boolean` | 否 | `true` | 部署前是否删除远程旧文件 |
| `isRemoveLocalFile` | `boolean` | 否 | `true` | 部署后是否删除本地打包文件 |
| `verifyAddress` | `string` | 否 | - | 部署完成后提示的验证地址 |

## 密码管理

支持两种方式提供服务器密码：

**方式一：环境变量（推荐）**

设置 `WR_SERVER_CODE_<ENV>`，`<ENV>` 为大写环境名：

```bash
# Linux / macOS
export WR_SERVER_CODE_QA=your_password
export WR_SERVER_CODE_PROD=your_password

# Windows PowerShell
$env:WR_SERVER_CODE_QA="your_password"

# Windows CMD
set WR_SERVER_CODE_QA=your_password
```

**方式二：交互输入**

未设置环境变量时，部署过程中会交互式提示输入密码。

> 自动模式下必须通过环境变量提供密码，否则将报错退出。

## 自动模式

适用于 CI/CD 流水线和 AI 助手等非交互环境。以下任一条件触发：

- 传入 `--auto` 参数
- 运行环境无 TTY（自动检测）

自动模式下：
- 跳过部署确认交互
- 密码必须通过环境变量提供

```bash
# CI/CD 示例
export WR_SERVER_CODE_QA=your_password
wr-server deploy -m qa --auto

# AI 助手调用（非 TTY 环境自动识别，--auto 可省略）
wr-server deploy -m qa
```

## 部署流程

```
1. 执行本地打包（npm run <script>）
2. 压缩打包目录为 zip
3. SSH 连接服务器
4. 上传 zip 到服务器
5. 备份远程旧文件（如配置了 bakDir）
6. 删除远程旧文件（如 isRemoveRemoteFile 为 true）
7. 解压并部署
8. 清理本地打包文件（如 isRemoveLocalFile 为 true）
```

## License

MIT
