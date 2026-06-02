import { setLevelCommand, handleSetLevel } from "../../modules/adminPanels.js";

export default {
  data: setLevelCommand,
  async execute(interaction) {
    await handleSetLevel(interaction);
  }
};
