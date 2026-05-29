import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { warn } from "../../modules/moderation.js";

export default {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Issue a warning to a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("The member to warn").setRequired(true))
    .addStringOption((o) => o.setName("reason").setDescription("Reason for the warning").setRequired(true)),
  async execute(interaction) {
    await warn(interaction);
  },
};
