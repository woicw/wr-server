# ssh 连接服务器自动部署

全局安装 wr-server-cli 工具包，该包使用的是 node esm 版本，需要使用 node20 以上版本；

安装完成后在项目根目录增加 deploy.config.mjs;该文件默认导出部署配置

```tsx
interface EnvConfig {
  // 环境对象
  name: string; // 环境名称
  script: string; // 打包命令
  host: string; // 服务器地址
  port: number; // 服务器端口号
  password: string; // 服务器登录密码
  username: string; // 服务器登录用户名
  distPath: string; // 本地打包生成目录
  webDir: string; // 服务器部署路径（不可为空或'/'）
  bakDir: string; // 备份路径 (打包前备份之前部署目录 最终备份路径为 /usr/local/nginx/backup/html.zip)
  isRemoveRemoteFile: boolean; // 是否删除远程文件（默认true）
  isRemoveLocalFile: boolean; // 是否删除本地文件（默认true）
  verifyAddress: string;
}
interface DeployConfig {
  projectName: string;
  readyTimeout: number;
  dev: EnvConfig;
  qa: EnvConfig;
  prod: EnvConfig;
}
```

```tsx
export default {
  projectName: 'example', // 项目名称
  readyTimeout: 20000, // 超时时间 (毫秒)

  qa: {
    // 环境对象
    name: '测试环境', // 环境名称
    script: 'build:qa', // 打包命令
    host: 'example.com', // 服务器地址
    port: 22, // 服务器端口号
    username: 'root', // 服务器登录用户名
    distPath: 'dist', // 本地打包生成目录
    webDir: '/example/code', // 服务器部署路径（不可为空或'/'）
    bakDir: '/front-end-backups', // 备份路径 (打包前备份之前部署目录 最终备份路径为 )
    isRemoveRemoteFile: true, // 是否删除远程文件（默认 true）
    isRemoveLocalFile: true, // 是否删除本地文件（默认 true）
    verifyAddress: 'http://example.com', // 验证页面地址
  },
};

```

配置完成后根目录执行 wr-server deploy -m dev/qa/prod，等待命令执行，按提示验证部署结果；