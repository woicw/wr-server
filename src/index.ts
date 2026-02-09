import { Command } from "commander";
import { deploy } from "./commands/deploy";

const program = new Command();

program.version("1.1.1");

program
  .command("deploy")
  .description("deploy to server")
  .option("-m, --mode [mode]", "deploy mode")
  .option("--local", "local build")
  .action(async (opts) => {
    const { mode, local } = opts;
    await deploy(mode, local);
  });

program.parseAsync(process.argv);
