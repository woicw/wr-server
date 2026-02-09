import { NodeSSH } from "node-ssh";
import { execa } from "execa";
import * as colors from "yoctocolors";
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import archiver from "archiver";
import {
  getDeployConfigFileName,
  log,
  succeed,
  error,
  underline,
  getDeployConfigFilePath,
  hasFileOrDir,
  remove,
} from "../utils";
import { password as psword, confirm } from "@clack/prompts";
import ora from "ora";
import dayjs from "dayjs";

interface EnvConfig {
  name: string;
  script: string;
  host: string;
  port: number;
  password: string;
  username: string;
  distPath: string;
  webDir: string;
  bakDir: string;
  isRemoveRemoteFile: boolean;
  isRemoveLocalFile: boolean;
  verifyAddress: string;
}

interface DeployConfig {
  projectName: string;
  readyTimeout: number;
  [env: string]: EnvConfig | string | number;
}

interface DeployOptions {
  local?: boolean;
  auto?: boolean;
}

type TaskFn = (config: EnvConfig, index: number) => Promise<void> | void;

const ssh = new NodeSSH();

/** 当前部署环境名 */
let currentEnv = "";

/**
 * 是否自动模式（跳过所有交互式 prompt）
 * 触发条件（任一满足）：
 * 1. 配置文件 auto: true
 * 2. CLI 传入 --auto
 * 3. 非 TTY 环境（CI / AI agent）
 */
let autoMode = false;

/** 判断是否处于交互式终端 */
const isInteractive = () => process.stdin.isTTY === true;

/** 检查环境配置 */
const checkEnvCorrect = (config: DeployConfig, env: string) => {
  const keys: (keyof EnvConfig)[] = [
    "name",
    "host",
    "port",
    "username",
    "distPath",
    "webDir",
  ];

  const envConfig = config[env] as EnvConfig | undefined;
  if (!envConfig) {
    error("配置错误：未指定部署环境或指定部署环境不存在");
    process.exit(1);
  }

  for (const key of keys) {
    if (!envConfig[key] || envConfig[key] === "/") {
      error(
        `配置错误：${underline(`${env}环境`)} ${underline(`${key}属性`)} 配置不正确`
      );
      process.exit(1);
    }
  }
};

/** 执行打包脚本 */
const execBuild = async (config: EnvConfig, index: number) => {
  const { script } = config;
  log(`(${index}) ${script}`);
  const spinner = ora("正在打包中\n");
  spinner.start();
  try {
    await execa("npm", ["run", script]);
    spinner.stop();
    succeed("打包成功");
  } catch (e: unknown) {
    spinner.stop();
    error("打包失败");
    error(String(e));
    process.exit(1);
  }
};

/** 打包 Zip（跨平台路径） */
const buildZip = async (config: EnvConfig, index: number) => {
  const zipPath = path.join(process.cwd(), `${config.distPath}.zip`);
  const distFullPath = path.join(process.cwd(), config.distPath);

  await new Promise<void>((resolve, reject) => {
    log(`(${index}) 打包 ${underline(config.distPath)} Zip`);

    const archive = archiver("zip", {
      zlib: { level: 9 },
      forceLocalTime: true,
    }).on("error", (e: Error) => {
      error(String(e));
      reject(e);
    });

    const output = createWriteStream(zipPath).on("close", () => {
      succeed(`${underline(`${config.distPath}.zip`)} 打包成功`);
      resolve();
    });

    output.on("error", (e: Error) => {
      error(`打包zip出错: ${e}`);
      reject(e);
    });

    archive.pipe(output);
    archive.directory(distFullPath, false);
    archive.finalize();
  });
};

/** 连接 SSH（优先环境变量 → 自动模式要求环境变量 → 交互输入） */
const connectSSH = async (config: EnvConfig, index: number) => {
  try {
    log(`(${index}) ssh 连接 ${underline(config.host)}`);

    const envKey = `WR_SERVER_CODE_${currentEnv.toUpperCase()}`;
    const envPassword = process.env[envKey];

    if (envPassword) {
      config.password = envPassword;
      succeed(`已从环境变量 ${underline(envKey)} 读取密码`);
    } else if (autoMode) {
      error(
        `自动模式下未找到环境变量 ${underline(envKey)}，请先设置：\n` +
          `  export ${envKey}=your_password`
      );
      process.exit(1);
    } else {
      const answer = await psword({ message: "请输入服务器密码" });
      config.password = answer as string;
    }

    await ssh.connect(config);
    succeed("ssh 连接成功");
  } catch (e: unknown) {
    error(String(e));
    process.exit(1);
  }
};

/** 上传本地文件 */
const uploadLocalFile = async (config: EnvConfig, index: number) => {
  try {
    const localFileName = `${config.distPath}.zip`;
    const remoteFileName = `${config.webDir}.zip`;
    const localPath = path.join(process.cwd(), localFileName);

    log(`(${index}) 上传打包 zip 至目录 ${underline(remoteFileName)}`);
    const spinner = ora("正在上传中\n");
    spinner.start();

    await ssh.putFile(localPath, remoteFileName, null, { concurrency: 1 });

    spinner.stop();
    succeed("上传成功");
  } catch (e: unknown) {
    error(`上传失败：${e}`);
    process.exit(1);
  }
};

/** 备份远程文件（时间戳使用 Windows 兼容格式） */
const backupRemoteFile = async (config: EnvConfig, index: number) => {
  try {
    const { webDir, bakDir } = config;
    const dirName = webDir.split("/").at(-1);
    const zipFileName = `${dirName}_${dayjs().format("YYYY-MM-DD_HH-mm-ss")}.zip`;

    log(`(${index}) 备份远程文件 ${underline(webDir)}`);

    await ssh.execCommand(`[ ! -d ${bakDir} ] && mkdir -p ${bakDir}`);
    await ssh.execCommand(`zip -q -r ${bakDir}/${zipFileName} ${webDir}`);

    succeed(`备份成功 备份至 ${underline(`${bakDir}/${zipFileName}`)}`);
  } catch (e: unknown) {
    error(String(e));
    process.exit(1);
  }
};

/** 删除远程文件 */
const removeRemoteFile = async (config: EnvConfig, index: number) => {
  try {
    const { webDir } = config;
    log(`(${index}) 删除远程文件 ${underline(webDir)}`);
    await ssh.execCommand(`rm -rf ${webDir}`);
    succeed("删除成功");
  } catch (e: unknown) {
    error(String(e));
    process.exit(1);
  }
};

/** 解压远程文件 */
const unzipRemoteFile = async (config: EnvConfig, index: number) => {
  try {
    const { webDir } = config;
    const remoteFileName = `${webDir}.zip`;
    log(`(${index}) 解压远程文件 ${underline(remoteFileName)}`);
    await ssh.execCommand(
      `unzip -o ${remoteFileName} -d ${webDir} && rm -rf ${remoteFileName}`
    );
    succeed("解压成功");
  } catch (e: unknown) {
    error(String(e));
    process.exit(1);
  }
};

/** 删除本地打包文件 */
const removeLocalFile = async (config: EnvConfig, index: number) => {
  const localPath = path.join(process.cwd(), config.distPath);
  log(`(${index}) 删除本地打包目录 ${underline(localPath)}`);
  await remove(localPath);
  await unlink(`${localPath}.zip`);
  succeed("删除本地打包目录成功");
};

/** 断开 SSH */
const disconnectSSH = () => {
  ssh.dispose();
};

/** 创建任务列表 */
const createTaskList = (config: EnvConfig, local?: boolean): TaskFn[] => {
  const {
    script,
    bakDir,
    isRemoveRemoteFile = true,
    isRemoveLocalFile = true,
  } = config;

  const tasks: TaskFn[] = [];

  if (!local && script) tasks.push(execBuild);
  tasks.push(buildZip);
  tasks.push(connectSSH);
  tasks.push(uploadLocalFile);
  if (bakDir) tasks.push(backupRemoteFile);
  if (isRemoveRemoteFile) tasks.push(removeRemoteFile);
  tasks.push(unzipRemoteFile);
  if (isRemoveLocalFile) tasks.push(removeLocalFile);
  tasks.push(disconnectSSH);

  return tasks;
};

/** 顺序执行任务列表 */
const executeTaskList = async (tasks: TaskFn[], config: EnvConfig) => {
  for (let i = 0; i < tasks.length; i++) {
    await tasks[i](config, i + 1);
  }
};

export const deploy = async (env: string, opts: DeployOptions = {}) => {
  const configPath = getDeployConfigFilePath();
  const hasFile = await hasFileOrDir(configPath);

  if (!hasFile) {
    error(`${getDeployConfigFileName()} 文件不存在，请先创建配置文件`);
    process.exit(1);
  }

  const config = (await import(configPath)).default as DeployConfig;
  const { projectName } = config;
  const startTime = performance.now();

  if (!env) {
    error("请通过 -m 参数指定部署环境，如 dev / qa / prod");
    process.exit(1);
  }

  currentEnv = env;
  // --auto 参数或非 TTY 环境（CI / AI agent）触发自动模式
  autoMode = opts.auto || !isInteractive();

  if (autoMode) {
    log("[自动模式] 跳过交互式确认");
  }

  checkEnvCorrect(config, env);

  const envConfig: EnvConfig = {
    ...(config[env] as EnvConfig),
    readyTimeout: config.readyTimeout,
  } as EnvConfig & { readyTimeout: number };

  const { stdout: branch } = await execa("git", [
    "rev-parse",
    "--abbrev-ref",
    "HEAD",
  ]);
  console.log("当前分支：", branch);

  if (!autoMode) {
    const answer = await confirm({
      message: `是否将 ${underline(projectName)} 项目 ${colors.greenBright(branch)} 分支部署到 ${underline(envConfig.name)}?`,
    });
    if (!answer) {
      process.exit(1);
    }
  }

  const tasks = createTaskList(envConfig, opts.local);
  await executeTaskList(tasks, envConfig);

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
  succeed(
    `恭喜您，${underline(projectName)} 项目 ${branch} 分支已在 ${underline(envConfig.name)} 部署成功 耗时${elapsed}s\n`
  );
  succeed(`验证地址：${underline(envConfig.verifyAddress || envConfig.host)}`);
  process.exit(0);
};
