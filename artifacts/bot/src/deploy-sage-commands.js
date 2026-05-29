/**
 * deploy-sage-commands.js
 * Deploys ONLY the Sage Alliance commands to the Sage server (guild-specific).
 * Run: node src/deploy-sage-commands.js
 */
import "dotenv/config";
import { REST, Routes } from "discord.js";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const token = process.env.DISCORD_BOT_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const sageGuildId = process.env.SAGE_GUILD_ID || "1507696012410749030";

if (!token || !clientId) {
  throw new Error("DISCORD_BOT_TOKEN and DISCORD_CLIENT_ID must be set in .env");
}

// ── Sage-exclusive command files ──────────────────────────────────────────────
const SAGE_COMMAND_FILES = [
  join(__dirname, "commands", "utility", "sage_join.js"),
  // Add other sage commands here as needed
];

const commands = [];

for (const filePath of SAGE_COMMAND_FILES) {
  const module = await import(pathToFileURL(filePath).href);
  const command = module.default ?? module;
  if (command?.data) {
    commands.push(command.data.toJSON());
    console.log(`[SageDeploy] Queued: /${command.data.name}`);
  }
}

const rest = new REST({ version: "10" }).setToken(token);

try {
  console.log(`[SageDeploy] Registering ${commands.length} command(s) to Sage guild ${sageGuildId}...`);
  const data = await rest.put(
    Routes.applicationGuildCommands(clientId, sageGuildId),
    { body: commands }
  );
  console.log(`[SageDeploy] ✅ Successfully registered ${data.length} command(s) to Sage Alliance server.`);
} catch (err) {
  console.error("[SageDeploy] ❌ Error registering commands:", err);
  process.exit(1);
}
