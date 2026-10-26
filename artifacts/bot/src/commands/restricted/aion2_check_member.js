import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import { query } from "../../database/index.js";

const AION2_MEMBER_ROLE_ID = "1401376073077231702";
const EARLY_ACCESS_ROLE_ID = "1551161877017403412";

export default {
  data: new SlashCommandBuilder()
    .setName("aion2_check_member")
    .setDescription("READ-ONLY Diagnostic: Check the complete AION 2 membership state for a user")
    .addUserOption(option => 
      option.setName("user")
        .setDescription("The Discord user to check")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (e) {
      console.error("[CheckMember] Failed to deferReply:", e);
      return;
    }

    try {
      if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.editReply({ content: "❌ عذراً، هذا الأمر مخصص للإدارة العليا فقط." });
      }

      const targetUser = interaction.options.getUser("user");
      const discordId = targetUser.id;

      // Fetch ALL rows for this user, ordered newest first
      const appRes = await query(`
        SELECT 
          id, status, guild_type, selected_class, playstyle, 
          transition_status, processing_action, processing_by, 
          processing_started_at, created_at, updated_at, 
          reviewed_by, reviewed_at
        FROM aion2_global_applications 
        WHERE discord_id = $1
        ORDER BY id DESC
      `, [discordId]);

      const rows = appRes.rows;
      const activeRows = rows.filter(r => ['PENDING', 'ACCEPTED', 'PROCESSING'].includes(r.status));
      const historicalRows = rows.filter(r => !['PENDING', 'ACCEPTED', 'PROCESSING'].includes(r.status));

      // Fetch Discord Roles safely
      let hasAionRole = false;
      let hasEarlyRole = false;
      let member = null;
      try {
        const guild = await interaction.client.guilds.fetch(process.env.MAIN_GUILD_ID || "861355983975874601");
        member = await guild.members.fetch(discordId).catch(() => null);
        if (member) {
          hasAionRole = member.roles.cache.has(AION2_MEMBER_ROLE_ID);
          hasEarlyRole = member.roles.cache.has(EARLY_ACCESS_ROLE_ID);
        }
      } catch (e) {
        console.error("[CheckMember] Role fetch error", e);
      }

      // Determine current logical state
      let logicalState = "NOT REGISTERED";
      let isCurrentMember = false;
      let canReapply = false;
      let applyBlocker = null;

      if (activeRows.length > 1) {
        logicalState = "CONFLICT / INVALID STATE";
        applyBlocker = "CONFLICT / INVALID STATE";
      } else if (activeRows.length === 1) {
        const active = activeRows[0];
        if (active.transition_status === 'MIGRATING_TO_EARLY') {
          logicalState = "MIGRATING_TO_EARLY";
          isCurrentMember = true;
          applyBlocker = "migration transition";
        } else if (active.transition_status === 'REMOVING') {
          logicalState = "REMOVAL IN PROGRESS";
          isCurrentMember = true; // Technically still active until removal completes
          applyBlocker = "removal transition";
        } else if (active.status === 'PENDING') {
          logicalState = "PENDING GLOBAL";
          applyBlocker = "PENDING application";
        } else if (active.status === 'PROCESSING') {
          logicalState = "PROCESSING GLOBAL";
          applyBlocker = "PROCESSING application";
        } else if (active.status === 'ACCEPTED' && active.guild_type === 'GLOBAL') {
          logicalState = "ACCEPTED GLOBAL";
          isCurrentMember = true;
          applyBlocker = "ACCEPTED membership";
        } else if (active.status === 'ACCEPTED' && active.guild_type === 'EARLY_ACCESS') {
          logicalState = "ACCEPTED EARLY_ACCESS";
          isCurrentMember = true;
          applyBlocker = "ACCEPTED membership";
        }
      } else {
        if (rows.length > 0) {
          logicalState = "REMOVED / NO ACTIVE MEMBERSHIP";
          // Check if all rows are rejected
          if (rows.every(r => r.status === 'REJECTED')) {
             logicalState = "REJECTED / NO ACTIVE MEMBERSHIP";
          }
        }
        canReapply = true;
      }

      // DB vs Discord Consistency
      let expectedAion = false;
      let expectedEarly = false;
      if (logicalState === "ACCEPTED GLOBAL" || logicalState === "MIGRATING_TO_EARLY") {
        expectedAion = true;
      } else if (logicalState === "ACCEPTED EARLY_ACCESS") {
        expectedAion = true;
        expectedEarly = true;
      } else if (logicalState === "REMOVAL IN PROGRESS") {
        // Unpredictable since roles are being stripped.
        // It could be missing or present depending on when it crashed.
      }

      let consistencyReport = "";
      if (logicalState === "CONFLICT / INVALID STATE") {
        consistencyReport = "❌ MISMATCH DETECTED: Multiple active rows found in database.";
      } else {
        if (hasAionRole === expectedAion && hasEarlyRole === expectedEarly) {
          consistencyReport = "✅ DB and Discord are synchronized.";
        } else {
          consistencyReport = "❌ MISMATCH DETECTED\n\n**Database:**\n" + logicalState + "\n\n**Discord:**\nAION 2 Member = " + (hasAionRole ? "YES" : "NO") + "\nEarly Access = " + (hasEarlyRole ? "YES" : "NO") + "\n\n**Diagnosis:**\n";
          
          if (logicalState.includes("NO ACTIVE") && (hasAionRole || hasEarlyRole)) {
             consistencyReport += "The player was removed from the database but the Discord membership roles were not removed.";
          } else if (logicalState.includes("ACCEPTED") && !hasAionRole) {
             consistencyReport += "The player is accepted in the database but is missing the required AION 2 Member role in Discord.";
          } else if (logicalState === "ACCEPTED EARLY_ACCESS" && !hasEarlyRole) {
             consistencyReport += "The player is an Early Access member in the database but is missing the Early Access role in Discord.";
          } else if (logicalState === "ACCEPTED GLOBAL" && hasEarlyRole) {
             consistencyReport += "The player is a Global member in the database but incorrectly has the Early Access role in Discord.";
          } else {
             consistencyReport += "Role state does not match expected baseline.";
          }
        }
      }

      // Eligibility check
      let canApplyGlobal = false;
      let canApplyEarly = false;
      let canMigrate = false;
      let migrationBlocker = "";

      if (canReapply) {
         canApplyGlobal = true;
         canApplyEarly = true;
         migrationBlocker = "User is not an active ACCEPTED GLOBAL member. User must use the normal Join Gateway.";
      } else {
         if (logicalState === "ACCEPTED GLOBAL") {
           canMigrate = true;
         } else {
           migrationBlocker = "User is not an active ACCEPTED GLOBAL member.";
         }
      }

      // Capacity / Roster
      let countedGlobal = false;
      let countedEarly = false;
      if (logicalState === "ACCEPTED GLOBAL") countedGlobal = true;
      if (logicalState === "ACCEPTED EARLY_ACCESS") countedEarly = true;

      let conflicts = [];
      if (activeRows.length > 1) {
        conflicts.push("more than one active application");
      }
      const hasAccepted = activeRows.some(r => r.status === 'ACCEPTED');
      const hasPending = activeRows.some(r => r.status === 'PENDING');
      if (hasAccepted && hasPending) conflicts.push("ACCEPTED + PENDING simultaneously");
      
      if (activeRows.some(r => r.status === 'PROCESSING' && r.processing_started_at && (new Date() - new Date(r.processing_started_at)) > 300000)) {
         conflicts.push("PROCESSING stuck state");
      }
      if (activeRows.some(r => r.transition_status === 'MIGRATING_TO_EARLY' && r.transition_started_at && (new Date() - new Date(r.transition_started_at)) > 300000)) {
         conflicts.push("MIGRATING_TO_EARLY stuck state");
      }
      if (activeRows.some(r => r.transition_status === 'REMOVING' && r.transition_started_at && (new Date() - new Date(r.transition_started_at)) > 300000)) {
         conflicts.push("REMOVING stuck state");
      }
      if (logicalState.includes("NO ACTIVE") && (hasAionRole || hasEarlyRole)) conflicts.push("DB says REMOVED but membership roles remain");
      if (logicalState.includes("ACCEPTED") && !hasAionRole) conflicts.push("DB says ACCEPTED but required Discord role missing");

      // Format Embed
      let responseText = `🔎 **AION 2 MEMBER DIAGNOSTIC**\n\n👤 **User:** <@${discordId}>\n\n━━━━━━━━━━━━\n📌 **CURRENT STATE**\n\nMember: ${isCurrentMember ? "YES" : "NO"}\nStatus: ${logicalState}\nCan reapply: ${canReapply ? "YES" : "NO"}\n\n━━━━━━━━━━━━\n🗄️ **DATABASE**\n\n**Active Application:**\n`;
      
      const safeIso = (dateObj) => {
         if (!dateObj) return 'NULL';
         try {
            return new Date(dateObj).toISOString();
         } catch(e) {
            return String(dateObj);
         }
      };

      if (activeRows.length > 0) {
        const active = activeRows[0];
        responseText += `\`\`\`yaml\nID: ${active.id}\nStatus: ${active.status}\nGuild Type: ${active.guild_type}\nClass: ${active.selected_class || 'NULL'}\nPlaystyle: ${active.playstyle || 'NULL'}\nTransition: ${active.transition_status || 'NULL'}\nProcessing Action: ${active.processing_action || 'NULL'}\nProcessing By: ${active.processing_by || 'NULL'}\nCreated: ${safeIso(active.created_at)}\nUpdated: ${safeIso(active.updated_at)}\nReviewed By: ${active.reviewed_by || 'NULL'}\n\`\`\`\n`;
      } else {
        responseText += "None\n\n";
      }

      responseText += "**Historical Records:**\n";
      if (historicalRows.length > 0) {
        historicalRows.forEach(h => {
          responseText += `\`#${h.id} — ${h.status} — ${h.guild_type}\`\n`;
        });
        responseText += "\n";
      } else {
        responseText += "None\n\n";
      }

      responseText += `━━━━━━━━━━━━\n🎭 **DISCORD ROLES**\n\nAION 2 Member: ${hasAionRole ? "✅ YES" : "❌ NO"}\nEarly Access: ${hasEarlyRole ? "✅ YES" : "❌ NO"}\n\n━━━━━━━━━━━━\n🔄 **ELIGIBILITY**\n\nGlobal Application: ${canApplyGlobal ? "✅ YES" : "❌ NO"}\nDirect Early Join: ${canApplyEarly ? "✅ YES" : "❌ NO"}\nMigration Panel: ${canMigrate ? "✅ YES" : "❌ NO"}\n`;
      
      if (!canReapply && applyBlocker) {
         responseText += `Reason Blocked: ${applyBlocker}\n`;
      }
      if (!canMigrate && migrationBlocker) {
         responseText += `Migration Reason: ${migrationBlocker}\n`;
      }

      responseText += `\n━━━━━━━━━━━━\n📊 **ROSTER**\n\nGlobal: ${countedGlobal ? "✅ Consumes Global class slot" : "❌ Not counted"}\nEarly Access: ${countedEarly ? "✅ Consumes Early seat" : "❌ Not counted"}\n\n━━━━━━━━━━━━\n🔗 **CONSISTENCY**\n\n${consistencyReport}\n`;

      if (conflicts.length > 0) {
        responseText += `\n━━━━━━━━━━━━\n⚠️ **CONFLICTS DETECTED**\n\n${conflicts.map(c => `- ${c}`).join('\n')}\n`;
      }

      // Split text if it exceeds 4000 characters
      if (responseText.length > 4000) {
         responseText = responseText.substring(0, 3995) + "...";
      }

      const embed = new EmbedBuilder()
        .setColor("#3498DB")
        .setDescription(responseText);

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("[CheckMember] Unhandled error during execution:", err);
      // Attempt to safely reply to user
      try {
        await interaction.editReply({ content: "❌ حدث خطأ داخلي أثناء تنفيذ أمر الفحص. يرجى مراجعة سجلات البوت (Logs)." });
      } catch (replyErr) {
        console.error("[CheckMember] Failed to editReply after error:", replyErr);
      }
    }
  }
};
