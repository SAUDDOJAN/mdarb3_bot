import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadEvents(client) {
  const eventsPath = join(__dirname, "../events");
  const files = readdirSync(eventsPath).filter((f) => f.endsWith(".js"));

  for (const file of files) {
    const filePath = join(eventsPath, file);
    const module = await import(pathToFileURL(filePath).href);
    const event = module.default ?? module;

    if (!event?.name || !event?.execute) {
      console.warn(`[Events] Skipping ${file} — missing name or execute`);
      continue;
    }

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }

    console.log(`[Events] Registered: ${event.name}`);
  }
}
