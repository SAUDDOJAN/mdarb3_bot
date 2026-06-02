import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadCommands(client) {
  const commandsPath = join(__dirname, "../commands");
  const categoryDirs = readdirSync(commandsPath, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const category of categoryDirs) {
    const categoryPath = join(commandsPath, category);
    const files = readdirSync(categoryPath).filter((f) => f.endsWith(".js"));

    for (const file of files) {
      const filePath = join(categoryPath, file);
      const module = await import(pathToFileURL(filePath).href);
      const command = module.default ?? module;

      if (command?.data && command?.execute) {
        client.commands.set(command.data.name, command);
        console.log(`[Commands] Loaded: /${command.data.name}`);
      } else {
        console.warn(`[Commands] Skipping ${file} — missing data or execute`);
      }
    }
  }
}
