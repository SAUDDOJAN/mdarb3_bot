import { SlashCommandBuilder } from "discord.js";
import { data as originalData, execute as originalExecute } from "./app_alert.js";

export const data = new SlashCommandBuilder()
  .setName("broadcast")
  .setDescription("بث تنبيه أو خبر أو تحذير أو تحديث فوري لتطبيق M3RGEEN وروم الديسكورد");

// Copy options from originalData
originalData.options.forEach(opt => {
  data.options.push(opt);
});

export const execute = originalExecute;

export default {
  data,
  execute
};
