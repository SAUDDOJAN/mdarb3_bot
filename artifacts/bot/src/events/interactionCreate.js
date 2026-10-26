import { route } from "../handlers/interactionRouter.js";
import { PermissionFlagsBits } from "discord.js";

export default {
  name: "interactionCreate",
  once: false,
  async execute(interaction, client) {
    if (interaction.isChatInputCommand()) {
      // === CENTRALIZED MDARB3 MANAGER COMMAND AUTHORIZATION GATE ===
      const isAdministrator = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator) === true;
      const isSAdminShotCallerCmd =
        (interaction.commandName === "shotcaller" || interaction.commandName === "aion2_alert") &&
        interaction.member?.roles?.cache?.has("1554242295384252427") === true;
      
      if (isAdministrator || isSAdminShotCallerCmd) {
          // ALLOW: Administrators can execute all commands; S-Admin can execute /shotcaller
      } else {
          // DENY: Everyone else
          await interaction.reply({ content: "❌ لا تملك الصلاحية لاستخدام أوامر الإدارة الخاصة بالبوت.", ephemeral: true });
          return;
      }
      // =============================================================

      // Main guild ID for 'المعرقين' — hardcoded as a reliable fallback
      const MAIN_GUILD_ID = process.env.MAIN_GUILD_ID || "861355983975874601";
      // Sage Alliance server ID — strictly isolated
      const SAGE_GUILD_ID = "1507696012410749030";

      // Commands only accessible in the main guild
      const ALLIANCE_ONLY_COMMANDS = ["alliance-registration", "alliance-member"];

      // Commands allowed in ANY external server (Alliances)
      const ALLOWED_EXTERNAL_COMMANDS = ["crosschat"];

      // Commands exclusive to the Sage Alliance server (along with external commands)
      const SAGE_ONLY_COMMANDS = ["setup", "alerts", "help", "sage-join", "sage_mgmt_panel"];

      if (interaction.guildId === MAIN_GUILD_ID) {
        // ✅ Main guild: Allow ALL interactions — no restrictions
      } else if (interaction.guildId === SAGE_GUILD_ID) {
        // ✅ Sage server: allow setup, alerts, help, AND sage-specific commands
        const sageAllowed = [...ALLOWED_EXTERNAL_COMMANDS, ...SAGE_ONLY_COMMANDS];
        if (!sageAllowed.includes(interaction.commandName)) {
          await interaction.reply({
            content: "❌ عذراً، هذا الأمر غير متوفر في هذا السيرفر.",
            flags: 64,
          });
          return;
        }
      } else {
        // ❌ External server: Only allow crosschat
        if (!ALLOWED_EXTERNAL_COMMANDS.includes(interaction.commandName)) {
          await interaction.reply({
            content: "❌ عذراً، هذا الأمر غير متوفر في هذا السيرفر ومخصص فقط لسيرفر التحالف الرئيسي.",
            flags: 64,
          });
          return;
        }
      }


      // Alliance commands are restricted to the main guild only
      if (
        ALLIANCE_ONLY_COMMANDS.includes(interaction.commandName) &&
        interaction.guildId !== MAIN_GUILD_ID
      ) {
        await interaction.reply({
          content: "❌ هذا الأمر متاح فقط في سيرفر التحالف الرئيسي.",
          flags: 64,
        });
        return;
      }

      const command = client.commands.get(interaction.commandName);
      if (!command) {
        await interaction.reply({ content: "Unknown command.", flags: 64 });
        return;
      }
      try {
        await command.execute(interaction, client);
      } catch (err) {
        console.error(`[Commands] Error in /${interaction.commandName}:`, err);
        const reply = { content: "There was an error running this command.", flags: 64 };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply).catch(() => {});
        } else {
          await interaction.reply(reply).catch(() => {});
        }
      }
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        if (command.autocomplete) {
          await command.autocomplete(interaction, client);
        }
      } catch (err) {
        console.error(`[Commands] Error in autocomplete /${interaction.commandName}:`, err);
      }
      return;
    }

    if (
      interaction.isButton() ||
      interaction.isStringSelectMenu() ||
      interaction.isUserSelectMenu()
    ) {
      await route(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await route(interaction);
      return;
    }
  },
};
