import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { ban } from "../../modules/moderation.js";

export default {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member from the server")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName("user").setDescription("The member to ban").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the ban")),
  async execute(interaction) {
    await ban(interaction);
  },
};
