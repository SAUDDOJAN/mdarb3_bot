import "dotenv/config";
import { Client, GatewayIntentBits, Events, AuditLogEvent, PermissionFlagsBits, EmbedBuilder } from "discord.js";

const TARGET_GUILD_ID = "861355983975874601";
const SUPERVISOR_ROLE_ID = "1509497629564866680";
const S_ADMIN_ROLE_ID = "1554242295384252427";
const SHOT_CALLER_ROLE_ID = "1498423320704585768";
const LOG_CHANNEL_ID = "1290468734045261885";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
  ],
});

async function tryEnableManageRolesOnSAdmin() {
  try {
    const guild = await client.guilds.fetch(TARGET_GUILD_ID).catch(() => null);
    if (!guild) return;
    const role = await guild.roles.fetch(S_ADMIN_ROLE_ID).catch(() => null);
    if (!role) return;
    if (!role.permissions.has(PermissionFlagsBits.ManageRoles)) {
      const newPerms = role.permissions.add(PermissionFlagsBits.ManageRoles);
      await role.setPermissions(newPerms, "تفعيل إدارة الرولات لرول S-Admin (مقيد برول Shot Caller فقط عبر البوت)");
      console.log("[S-Admin Guard] Successfully enabled ManageRoles on S-Admin!");
    }
  } catch {
    // Will succeed once the bot's role is positioned above S-Admin
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`[S-Admin Guard] Active and monitoring as ${client.user.tag}`);
  await tryEnableManageRolesOnSAdmin();
  setInterval(tryEnableManageRolesOnSAdmin, 15000);
});

client.on(Events.GuildRoleUpdate, async () => {
  await tryEnableManageRolesOnSAdmin();
});

client.on(Events.GuildAuditLogEntryCreate, async (auditLogEntry, guild) => {
  if (guild.id !== TARGET_GUILD_ID) return;

  const { executorId, executor, targetId, action, changes, reason } = auditLogEntry;
  if (!executor || executor.bot || executor.system) return;

  try {
    const member = await guild.members.fetch(executorId).catch(() => null);
    if (!member) return;

    const isSAdmin = member.roles.cache.has(S_ADMIN_ROLE_ID);
    const isFullAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
    if (!isSAdmin || isFullAdmin) return;

    if (action === AuditLogEvent.RoleCreate && targetId) {
      await guild.roles.delete(targetId, "ممنوع: رتبة S-Admin مسموح لها بإعطاء Shot Caller فقط").catch(() => {});
      return;
    }

    if (action !== AuditLogEvent.MemberRoleUpdate || !targetId || !changes) return;

    const addedRoles = changes.find((c) => c.key === "$add")?.new || [];
    const removedRoles = changes.find((c) => c.key === "$remove")?.new || [];

    const targetMember = await guild.members.fetch(targetId).catch(() => null);
    let details = `**اللاعب المستهدف:** <@${targetId}>\n`;
    let embedColor = "#00d0ff";
    let actionLabel = "تحديث رتب عضو (S-Admin)";
    let hadViolation = false;

    for (const role of addedRoles) {
      if (role.id === SHOT_CALLER_ROLE_ID) {
        details += `✅ **إعطاء رول مصرح به:** <@&${role.id}>\n`;
      } else {
        hadViolation = true;
        embedColor = "#ef4444";
        actionLabel = "🚫 محاولة إعطاء رول غير مصرح به (تم السحب تلقائياً)";
        if (targetMember) {
          await targetMember.roles
            .remove(role.id, "ممنوع: رتبة S-Admin مسموح لها بإعطاء Shot Caller فقط")
            .catch((e) => console.error("[S-Admin Guard] Remove failed:", e.message));
        }
        details += `🚫 **مرفوض (تم السحب تلقائياً):** حاول إعطاء <@&${role.id}> — المسموح فقط: <@&${SHOT_CALLER_ROLE_ID}>\n`;
      }
    }

    for (const role of removedRoles) {
      if (role.id === SHOT_CALLER_ROLE_ID) {
        details += `❌ **سحب رول مصرح به:** <@&${role.id}>\n`;
      } else {
        hadViolation = true;
        embedColor = "#ef4444";
        actionLabel = "🚫 محاولة سحب رول غير مصرح به (تمت الاستعادة تلقائياً)";
        if (targetMember) {
          await targetMember.roles
            .add(role.id, "ممنوع: رتبة S-Admin مسموح لها بإدارة Shot Caller فقط")
            .catch((e) => console.error("[S-Admin Guard] Restore failed:", e.message));
        }
        details += `🚫 **مرفوض (تمت الاستعادة تلقائياً):** حاول سحب <@&${role.id}> — المسموح فقط: <@&${SHOT_CALLER_ROLE_ID}>\n`;
      }
    }

    const isSupervisor = member.roles.cache.has(SUPERVISOR_ROLE_ID);
    if (!hadViolation && isSupervisor) {
      // Already logged by supervisor tracker
      return;
    }

    const logChannel =
      guild.channels.cache.get(LOG_CHANNEL_ID) ||
      (await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null));
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setAuthor({ name: "تتبع نشاط المشرفين (S-Admin)", iconURL: executor.displayAvatarURL() })
        .setTitle(actionLabel)
        .setDescription(`**المشرف:** <@${executorId}>\n${details}`)
        .addFields({ name: "السبب المذكور", value: reason || "لا يوجد سبب (أو لم يكتبه المشرف)." })
        .setTimestamp()
        .setFooter({ text: "نظام المراقبة الأمنية 👁️" });
      await logChannel.send({ embeds: [embed] }).catch(() => {});
    }
  } catch (err) {
    console.error("[S-Admin Guard] Error:", err);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
