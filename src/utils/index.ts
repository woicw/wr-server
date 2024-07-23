import * as colors from "yoctocolors";
import {
  access,
  constants,
  readdir,
  rmdir,
  stat,
  unlink,
} from "node:fs/promises";
import ora from "ora";
import path from "node:path";

export const hasFileOrDir = async (path: string) => {
  try {
    await access(path, constants.R_OK | constants.W_OK);
    return true;
  } catch {
    return false;
  }
};

export const remove = async (path: string) => {
  if (await hasFileOrDir(path)) {
    const files = await readdir(path);
    for (const file of files) {
      const curPath = path + "/" + file;
      if ((await stat(curPath)).isDirectory()) {
        await remove(curPath);
      } else {
        await unlink(curPath);
      }
    }

    await rmdir(path);
  }
};
export const getDeployConfigFileName = () => {
  return `deploy.config.mjs`;
};

export const getDeployConfigFilePath = () => {
  return `${path.join(process.cwd())}/${getDeployConfigFileName()}`;
};
// 日志信息
export const log = (message: string) => {
  console.log(message);
};
// 成功信息
export const succeed = (message: string) => {
  ora().succeed(colors.greenBright(message));
};
// 提示信息
export const info = (message: string) => {
  ora().info(colors.blueBright(message));
};
// 错误信息
export const error = (message: string) => {
  ora().fail(colors.redBright(message));
};
// 下划线重点信息
export const underline = (message: string) => {
  return colors.underline(message);
};
