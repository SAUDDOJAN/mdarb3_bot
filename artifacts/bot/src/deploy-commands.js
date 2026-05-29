import "dotenv/config";
import { REST, Routes } from "discord.js";
import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !guildId) {
  throw new Error("DISCORD_BOT_TOKEN and DISCORD_GUILD_ID must be set.");
}

const commands = [];
const commandsPath = join(__dirname, "commands");
const categoryDirs = readdirSync(commandsPath, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "global")
  .map((d) => d.name);

for (const category of categoryDirs) {
  const categoryPath = join(commandsPath, category);
  const files = readdirSync(categoryPath).filter((f) => f.endsWith(".js"));

  for (const file of files) {
    const filePath = join(categoryPath, file);
    const module = await import(pathToFileURL(filePath).href);
    const command = module.default ?? module;
    if (command?.data) {
      commands.push(command.data.toJSON());
      console.log(`[Deploy] Queued: /${command.data.name}`);
    }
  }
}

const rest = new REST({ version: "10" }).setToken(token);

try {
  console.log(`[Deploy] Registering ${commands.length} slash command(s) to guild ${guildId}...`);
  const data = await rest.put(
    Routes.applicationGuildCommands(
      (await rest.get(Routes.oauth2CurrentApplication())).id,
      guildId
    ),
    { body: commands }
  );
  console.log(`[Deploy] Successfully registered ${data.length} command(s).`);
} catch (err) {
  console.error("[Deploy] Error registering commands:", err);
  process.exit(1);
}
