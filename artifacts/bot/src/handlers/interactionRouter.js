import * as tickets from "../modules/tickets.js";
import * as roles from "../modules/roles.js";
import * as giveaways from "../modules/giveaways.js";
import * as moderation from "../modules/moderation.js";
import * as alerts from "../modules/alerts.js";
import * as recruitment from "../modules/recruitment.js";
import * as events from "../modules/events.js";
import * as adminPanels from "../modules/adminPanels.js";
import * as staticTeams from "../modules/staticTeams.js";
import * as dungeonLfg from "../modules/dungeonLfg.js";
import * as alliance from "../modules/alliance.js";
import * as sageController from "../modules/sageController.js";
import * as sageGatekeeper from "../modules/sageGatekeeper.js";
import * as verification from "../modules/verification.js";
import * as social from "../modules/social.js";
import * as guildwars2 from "../modules/guildwars2.js";

const routers = {
  ticket: tickets.handleInteraction,
  roles: roles.handleInteraction,
  giveaway: giveaways.handleInteraction,
  mod: moderation.handleInteraction,
  alerts: alerts.handleInteraction,
  recruit: recruitment.handleInteraction,
  event: events.handleInteraction,
  mgmt: adminPanels.handleInteraction,
  static_team: staticTeams.handleInteraction,
  lfg: dungeonLfg.handleLfgInteraction,
  alliance: alliance.handleInteraction,
  // ── Sage Alliance Controller (isolated to guild 1507696012410749030) ──
  sage: sageController.handleInteraction,
  sage_gate_agree: sageGatekeeper.handleGatekeeperButton,
  sage_gate_reject: sageGatekeeper.handleGatekeeperButton,
  verify: verification.handleInteraction,
  social: social.handleInteraction,
  gw2: guildwars2.handleInteraction,
};

export async function route(interaction) {
  const customId = interaction.customId ?? "";
  const [prefix] = customId.split(":");

  console.log(`[Router] Received interaction: "${customId}" (prefix="${prefix}")`);

  const handler = routers[prefix];
  if (!handler) {
    // Must always acknowledge — otherwise Discord shows "This interaction failed"
    console.warn(`[Router] No handler found for prefix "${prefix}" (customId: "${customId}")`);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "❌ هذا الزر لم يعد متاحاً.", flags: 64 });
      }
    } catch (_) {}
    return;
  }

  try {
    await handler(interaction);
  } catch (err) {
    console.error(`[Router] Error handling interaction "${customId}":`, err);
    const reply = { content: "❌ حدث خطأ أثناء معالجة هذا الطلب، حاول مجدداً.", flags: 64 };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
}
