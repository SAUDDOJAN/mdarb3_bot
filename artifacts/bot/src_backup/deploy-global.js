import "dotenv/config";
import { REST, Routes } from "discord.js";
import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
  throw new Error("DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID must be set.");
}

const commands = [];
const globalCommandsPath = join(__dirname, "commands", "global");

if (readdirSync(globalCommandsPath)) {
  const files = readdirSync(globalCommandsPath).filter((f) => f.endsWith(".js"));

  for (const file of files) {
    const filePath = join(globalCommandsPath, file);
    const module = await import(pathToFileURL(filePath).href);
    const command = module.default ?? module;
    if (command?.data) {
      commands.push(command.data.toJSON());
      console.log(`[GlobalDeploy] Queued: /${command.data.name}`);
    }
  }
}

const rest = new REST({ version: "10" }).setToken(token);

try {
  console.log(`[GlobalDeploy] Registering ${commands.length} global slash command(s)...`);
  // Using applicationCommands registers the command globally across ALL servers the bot is in
  const data = await rest.put(
    Routes.applicationCommands(clientId),
    { body: commands }
  );
  console.log(`[GlobalDeploy] Successfully registered ${data.length} global command(s).`);
} catch (err) {
  console.error("[GlobalDeploy] Error registering global commands:", err);
  process.exit(1);
}
