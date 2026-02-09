import * as colors from "yoctocolors";
import { access, constants, rm } from "node:fs/promises";
import ora from "ora";
import path from "node:path";

/** 检查文件/目录是否存在 */
export const hasFileOrDir = async (filePath: string) => {
  try {
    await access(filePath, constants.R_OK | constants.W_OK);
    return true;
  } catch {
    return false;
  }
};

/** 递归删除文件/目录（跨平台兼容） */
export const remove = async (targetPath: string) => {
  if (await hasFileOrDir(targetPath)) {
    await rm(targetPath, { recursive: true, force: true });
  }
};

export const getDeployConfigFileName = () => "deploy.config.mjs";

export const getDeployConfigFilePath = () =>
  path.join(process.cwd(), getDeployConfigFileName());

/** 日志信息 */
export const log = (message: string) => {
  console.log(message);
};

/** 成功信息 */
export const succeed = (message: string) => {
  ora().succeed(colors.greenBright(message));
};

/** 提示信息 */
export const info = (message: string) => {
  ora().info(colors.blueBright(message));
};

/** 错误信息 */
export const error = (message: string) => {
  ora().fail(colors.redBright(message));
};

/** 下划线重点信息 */
export const underline = (message: string) => colors.underline(message);
