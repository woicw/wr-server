import { NodeSSH } from "node-ssh";

import { execa } from "execa";
import * as colors from "yoctocolors";
import { createWriteStream } from "node:fs";
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
import { unlink } from "node:fs/promises";

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

const ssh = new NodeSSH();

// 任务列表
let taskList: any;

// 检查环境是否正确
const checkEnvCorrect = (config: DeployConfig, env: "dev" | "qa" | "prod") => {
  const keys: (keyof EnvConfig)[] = [
    "name",
    "host",
    "port",
    "username",
    "distPath",
    "webDir",
  ];

  if (config) {
    keys.forEach((key) => {
      if (!config?.[env]?.[key] || config[env][key] === "/") {
        error(
          `配置错误：${underline(`${env}环境`)} ${underline(
            `${key}属性`
          )} 配置不正确`
        );
        process.exit(1);
      }
    });
  } else {
    error("配置错误：未指定部署环境或指定部署环境不存在");
    process.exit(1);
  }
};

// 执行打包脚本
const execBuild = async (config: EnvConfig, index: number) => {
  const { script } = config;
  log(`(${index}) ${script}`);
  const spinner = ora("正在打包中\n");

  spinner.start();
  try {
    await execa("npm", ["run", script]);
    spinner.stop();
    succeed("打包成功");
  } catch (e: any) {
    spinner.stop();
    error("打包失败");
    error(e?.toString());
    process.exit(1);
  }
};

// 打包Zip
const buildZip = async (config: EnvConfig, index: number) => {
  await new Promise((resolve, reject) => {
    log(`(${index}) 打包 ${underline(config.distPath)} Zip`);
    const archive = archiver("zip", {
      zlib: { level: 9 },
      forceLocalTime: true,
    }).on("error", (e: any) => {
      error(e);
    });

    const output = createWriteStream(
      `${process.cwd()}/${config.distPath}.zip`
    ).on("close", (e: any) => {
      if (e) {
        error(`打包zip出错: ${e}`);
        reject(e);
        process.exit(1);
      } else {
        succeed(`${underline(`${config.distPath}.zip`)} 打包成功`);
        resolve(1);
      }
    });

    archive.pipe(output);
    archive.directory(config.distPath, false);
    archive.finalize();
  });
};

// 连接ssh
const connectSSH = async (config: EnvConfig, index: number) => {
  try {
    log(`(${index}) ssh 连接 ${underline(config.host)}`);

    const answer = await psword({
      message: "请输入服务器密码",
    });

    config.password = answer as string;

    await ssh.connect(config);
    succeed("ssh 连接成功");
  } catch (e: any) {
    error(e?.toString());
    process.exit(1);
  }
};

// 上传本地文件
const uploadLocalFile = async (config: EnvConfig, index: number) => {
  try {
    const localFileName = `${config.distPath}.zip`;
    const remoteFileName = `${config.webDir}.zip`;
    const localPath = `${process.cwd()}/${localFileName}`;

    log(`(${index}) 上传打包 zip 至目录 ${underline(remoteFileName)}`);

    const spinner = ora("正在上传中\n");

    spinner.start();

    await ssh.putFile(localPath, remoteFileName, null, {
      concurrency: 1,
    });

    spinner.stop();
    succeed("上传成功");
  } catch (e) {
    error(`上传失败：${e}`);
    process.exit(1);
  }
};

// 备份远程文件
const backupRemoteFile = async (config: EnvConfig, index: number) => {
  try {
    const { webDir, bakDir } = config;
    const dirName = webDir.split("/")[webDir.split("/").length - 1];
    const zipFileName = `${dirName}_${dayjs().format(
      "YYYY-MM-DD_HH:mm:ss"
    )}.zip`;

    log(`(${index}) 备份远程文件 ${underline(webDir)}`);

    await ssh.execCommand(`[ ! -d ${bakDir} ] && mkdir ${bakDir}`);

    await ssh.execCommand(`zip -q -r ${bakDir}/${zipFileName} ${webDir}`);

    succeed(`备份成功 备份至 ${underline(`${bakDir}/${zipFileName}`)}`);
  } catch (e: any) {
    error(e?.toString());
    process.exit(1);
  }
};

// 删除远程文件
const removeRemoteFile = async (config: EnvConfig, index: number) => {
  try {
    const { webDir } = config;

    log(`(${index}) 删除远程文件 ${underline(webDir)}`);

    await ssh.execCommand(`rm -rf ${webDir}`);

    succeed("删除成功");
  } catch (e: any) {
    error(e?.toString());
    process.exit(1);
  }
};

// 解压远程文件
const unzipRemoteFile = async (config: EnvConfig, index: number) => {
  try {
    const { webDir } = config;
    const remoteFileName = `${webDir}.zip`;

    log(`(${index}) 解压远程文件 ${underline(remoteFileName)}`);

    await ssh.execCommand(
      `unzip -o ${remoteFileName} -d ${webDir} && rm -rf ${remoteFileName}`
    );

    succeed("解压成功");
  } catch (e: any) {
    error(e?.toString());
    process.exit(1);
  }
};

// 删除本地打包文件
const removeLocalFile = async (config: EnvConfig, index: number) => {
  const localPath = `${process.cwd()}/${config.distPath}`;

  log(`(${index}) 删除本地打包目录 ${underline(localPath)}`);

  await remove(localPath);
  await unlink(`${localPath}.zip`);
  succeed("删除本地打包目录成功");
};

// 断开ssh
const disconnectSSH = () => {
  ssh.dispose();
};

// 创建任务列表
const createTaskList = (config: EnvConfig, local?: boolean) => {
  const {
    script,
    bakDir,
    isRemoveRemoteFile = true,
    isRemoveLocalFile = true,
  } = config;

  taskList = [];
  !local && script && taskList.push(execBuild);
  taskList.push(buildZip);
  taskList.push(connectSSH);
  taskList.push(uploadLocalFile);
  bakDir && taskList.push(backupRemoteFile);
  isRemoveRemoteFile && taskList.push(removeRemoteFile);
  taskList.push(unzipRemoteFile);
  isRemoveLocalFile && taskList.push(removeLocalFile);
  taskList.push(disconnectSSH);
};

// 执行任务列表
const executeTaskList = async (config: any) => {
  for (const [index, execute] of new Map<
    number,
    (config: EnvConfig, index: number) => any
  >(taskList.map((execute: () => any, index: number) => [index, execute]))) {
    await execute(config, index + 1);
  }
};

export const deploy = async (env: string, local?: boolean) => {
  const hasFile = await hasFileOrDir(getDeployConfigFilePath());

  if (hasFile) {
    const config = (await import(getDeployConfigFilePath())).default;

    const projectName = config.projectName;
    const currentTime = new Date().getTime();

    const createdEnvConfig = (env: any) => {
      checkEnvCorrect(config, env);

      return Object.assign(config[env], {
        readyTimeout: config.readyTimeout,
      });
    };

    if (env) {
      const envConfig = createdEnvConfig(env);
      const { stdout } = await execa("git", [
        "rev-parse",
        "--abbrev-ref",
        "HEAD",
      ]);
      console.log("当前分支：", stdout);

      const answer = await confirm({
        message: `是否将 ${underline(projectName)} 项目 ${colors.greenBright(
          stdout
        )} 分支部署到 ${underline(envConfig.name)}?`,
      });

      if (answer) {
        createTaskList(envConfig, local);

        await executeTaskList(envConfig);

        succeed(
          `恭喜您， ${underline(
            projectName
          )} 项目 ${stdout} 分支已在 ${underline(
            envConfig.name
          )} 部署成功 耗时${(new Date().getTime() - currentTime) / 1000}s\n`
        );
        succeed(
          `验证地址：${underline(envConfig.verifyAddress || envConfig.host)}`
        );
        process.exit(0);
      } else {
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  } else {
    error(`${getDeployConfigFileName()} 文件不存在，请先创建配置文件`);
    process.exit(1);
  }
};
