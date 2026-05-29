import { EmbedBuilder, AttachmentBuilder } from "discord.js";
import { query } from "../database/index.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import path from "path";

const SAGE_GUILD_ID = "1507696012410749030";

// In-memory invite cache: Map<guildId, Map<inviteCode, usesCount>>
const inviteCache = new Map();

// ─── Cache invites for a guild ─────────────────────────────────────────────────
export async function cacheGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map();
    for (const [code, inv] of invites) {
      map.set(code, inv.uses ?? 0);
    }
    inviteCache.set(guild.id, map);
  } catch {
    // Bot may not have MANAGE_GUILD permission — silently skip
  }
}

export default {
  name: "guildMemberAdd",
  once: false,
  async execute(member, client) {
    // ── 1. Welcome message & Auto Role (existing logic, skipped for Sage) ──────────────────
    if (member.guild.id !== SAGE_GUILD_ID) {
      // Assign Visitor Role for the main guild
      const MAIN_GUILD_ID = process.env.MAIN_GUILD_ID || "861355983975874601";
      if (member.guild.id === MAIN_GUILD_ID) {
        try {
          const VISITOR_ROLE_ID = "1509197562203344937";
          await member.roles.add(VISITOR_ROLE_ID).catch(() => {});
          console.log(`[Gatekeeper] Assigned Visitor role to ${member.user.tag}`);
        } catch (e) {
          console.error("[Gatekeeper] Error assigning visitor role:", e.message);
        }
      }
    }

    // ── 2. Sage Gatekeeper (Assign Verification Role immediately) ──────────────
    if (member.guild.id === SAGE_GUILD_ID) {
      try {
        const VERIFICATION_ROLE_ID = "1508444579488075868";
        await member.roles.add(VERIFICATION_ROLE_ID).catch(() => {});
        console.log(`[SageGatekeeper] Assiged Verification role to ${member.user.tag}`);
      } catch (e) {
        console.error("[SageGatekeeper] Error assigning verification role:", e.message);
      }
    }

    // ── 3. Sage invite tracking (only for Sage Guild) ──────────────────────────
    if (member.guild.id !== SAGE_GUILD_ID) return;

    try {
      // Compare current invite uses vs cached to find which invite was used
      const currentInvites = await member.guild.invites.fetch().catch(() => null);
      if (!currentInvites) return;

      const cached = inviteCache.get(member.guild.id) ?? new Map();
      let usedCode = null;

      for (const [code, inv] of currentInvites) {
        const prevUses = cached.get(code) ?? 0;
        if ((inv.uses ?? 0) > prevUses) {
          usedCode = code;
          break;
        }
      }

      // Update cache with fresh counts
      const newMap = new Map();
      for (const [code, inv] of currentInvites) {
        newMap.set(code, inv.uses ?? 0);
      }
      inviteCache.set(member.guild.id, newMap);

      if (!usedCode) return;

      // Look up source server name from our invite sources table
      const sourceRes = await query(
        "SELECT source_server_name FROM sage_invite_sources WHERE invite_code = $1",
        [usedCode]
      );
      const sourceName = sourceRes.rows[0]?.source_server_name ?? null;
      if (!sourceName) return;

      // Store temporarily so sageController can pick it up when they submit the form
      await query(
        `INSERT INTO sage_pending_source (user_id, source_server_name)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET source_server_name = $2, detected_at = NOW()`,
        [member.id, sourceName]
      );

      console.log(`[SageInvite] ${member.user.tag} joined via invite "${usedCode}" from "${sourceName}"`);

      // ── 3. Silent Entry Fallback (If screening/onboarding is bypassed) ──────
      if (member.pending === false) {
        const { default: guildMemberUpdateEvent } = await import("./guildMemberUpdate.js");
        await guildMemberUpdateEvent.execute({ pending: true, guild: member.guild }, member);
      }
    } catch (err) {
      console.error("[SageInvite] Error in invite tracking:", err.message);
    }
  },
};
