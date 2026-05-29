import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { cases } from "../../modules/moderation.js";

export default {
  data: new SlashCommandBuilder()
    .setName("cases")
    .setDescription("View moderation cases for a user")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName("user").setDescription("The user to look up").setRequired(true)),
  async execute(interaction) {
    await cases(interaction);
  },
};
