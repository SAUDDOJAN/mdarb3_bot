import * as leveling from "../modules/leveling.js";

export default {
  name: "messageCreate",
  once: false,
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;
    await leveling.handleXp(message);
  },
};
