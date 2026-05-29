import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { kick } from "../../modules/moderation.js";

export default {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member from the server")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) => o.setName("user").setDescription("The member to kick").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the kick")),
  async execute(interaction) {
    await kick(interaction);
  },
};
