import { Command } from "commander";
import { deploy } from "./commands/deploy";

const program = new Command();

program.version("1.2.1");

program
  .command("deploy")
  .description("deploy to server")
  .option("-m, --mode [mode]", "deploy mode")
  .option("--local", "local build")
  .option("--auto", "auto mode, skip interactive prompts")
  .action(async (opts) => {
    const { mode, local, auto } = opts;
    await deploy(mode, { local, auto });
  });

program.parseAsync(process.argv);
