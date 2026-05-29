import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { sendDungeonPanel } from "../../modules/dungeonLfg.js";

export default {
  data: new SlashCommandBuilder()
    .setName("setup_lfg")
    .setDescription("Post the persistent Dungeon LFG Board in this channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, client) {
    await sendDungeonPanel(interaction);
  },
};
