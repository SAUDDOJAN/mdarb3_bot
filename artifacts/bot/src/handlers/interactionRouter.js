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
import * as throneliberty from "../modules/throneliberty.js";
import * as aion2GlobalTemp from "../modules/aion2GlobalTemp.js";
import * as aion2Confirmation from "../modules/aion2Confirmation.js";
import * as aion2ShugoRegistration from "../modules/aion2ShugoRegistration.js";
import { lfgRouter, lfgModalRouter } from "../modules/aion2Lfg/router.js";
import { handleAion2Pagination } from "../modules/aion2Lfg/admin/pagination.js";
import { handleDungeonPointsPagination } from "../commands/utility/dungeon_points.js";
import { handleCleanupButton } from "../modules/welcomeCleanup.js";
import * as aion2SiegeAlert from "../modules/aion2SiegeAlert.js";

const routers = {
  dgpts_page: handleDungeonPointsPagination,
  cleanup_welcome: handleCleanupButton,
  aion2_page: handleAion2Pagination,
  temp_aion2_global: aion2GlobalTemp.handleInteraction,
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
  throne: throneliberty.handleInteraction,
  tl: throneliberty.handleInteraction,
};

export async function route(interaction) {
  const customId = interaction.customId ?? "";
  const [prefix] = customId.split(":");

  console.log(`[Router] Received interaction: "${customId}" (prefix="${prefix}")`);
  
  if (customId.startsWith("aion2_siege_")) {
    try {
      await aion2SiegeAlert.handleInteraction(interaction);
    } catch (err) {
      console.error(`[Router] Error handling siege interaction "${customId}":`, err);
      const reply = { content: "❌ حدث خطأ أثناء معالجة تسجيل الحضور، حاول مجدداً.", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply).catch(() => {});
      } else {
        await interaction.reply(reply).catch(() => {});
      }
    }
    return;
  }

  if (customId.startsWith("aion2_lfg_")) {
    try {
      if (interaction.isModalSubmit()) {
        await lfgModalRouter(interaction);
      } else {
        await lfgRouter(interaction);
      }
    } catch (err) {
      console.error("[LFG Router] Error:", err);
      if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: "Error processing LFG action.", ephemeral: true });
    }
    return;
  }

  if (customId.startsWith("temp_aion2_")) {
    try {
      await aion2GlobalTemp.handleInteraction(interaction);
    } catch (err) {
      console.error(`[Router] Error handling interaction "${customId}":`, err);
      const reply = { content: "❌ حدث خطأ أثناء معالجة هذا الطلب، حاول مجدداً.", flags: 64 };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply).catch(() => {});
      } else {
        await interaction.reply(reply).catch(() => {});
      }
    }
    return;
  }

  if (customId.startsWith("aion2_conf_")) {
    try {
      await aion2Confirmation.handleInteraction(interaction);
    } catch (err) {
      console.error(`[Router] Error handling interaction "${customId}":`, err);
      const reply = { content: "❌ حدث خطأ أثناء معالجة هذا الطلب، حاول مجدداً.", flags: 64 };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply).catch(() => {});
      } else {
        await interaction.reply(reply).catch(() => {});
      }
    }
    return;
  }

  if (customId.startsWith("aion2_shugo_")) {
    try {
      await aion2ShugoRegistration.handleShugoInteraction(interaction);
    } catch (err) {
      console.error(`[Router] Error handling Shugo registration interaction "${customId}":`, err);
      const reply = { content: "❌ حدث خطأ أثناء معالجة تسجيل Shugo، حاول مجدداً.", flags: 64 };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply).catch(() => {});
      } else {
        await interaction.reply(reply).catch(() => {});
      }
    }
    return;
  }

  if (customId.startsWith("ticket_") || customId.startsWith("ticket:")) {
    try {
      await tickets.handleInteraction(interaction);
    } catch (err) {
      console.error(`[Router] Error handling ticket interaction "${customId}":`, err);
      const reply = { content: "❌ حدث خطأ أثناء معالجة التذكرة، حاول مجدداً.", flags: 64 };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply).catch(() => {});
      } else {
        await interaction.reply(reply).catch(() => {});
      }
    }
    return;
  }

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
