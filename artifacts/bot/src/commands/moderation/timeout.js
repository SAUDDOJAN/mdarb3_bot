import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { timeout } from "../../modules/moderation.js";

export default {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Timeout a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("The member to timeout").setRequired(true))
    .addIntegerOption((o) => o.setName("minutes").setDescription("Duration in minutes").setRequired(true).setMinValue(1).setMaxValue(10080))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the timeout")),
  async execute(interaction) {
    await timeout(interaction);
  },
};
