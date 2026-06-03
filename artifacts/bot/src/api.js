import { query } from "./database/index.js";
import { getNotifications } from "./database/index.js";
import client from "./client.js";
import { DUNGEON_DATA } from "./modules/dungeonLfg.js";

// We need a helper to mock a Discord interaction for the API
export async function handleDungeonsApi(req, res, parsedUrl) {
  // CORS are already set in index.js

  if (req.method === "GET" && parsedUrl.pathname === "/api/dungeons") {
    try {
      const activeGroups = await query("SELECT * FROM dungeon_lfg_groups WHERE status = 'open' ORDER BY created_at DESC");
      
      const enrichedGroups = activeGroups.rows.map(g => {
        const dungeon = DUNGEON_DATA[g.dungeon_name];
        
        let waitingCount = 0;
        if (g.slot_tank && g.slot_tank.user_id) waitingCount++;
        if (g.slot_healer && g.slot_healer.user_id) waitingCount++;
        if (g.slot_dps1 && g.slot_dps1.user_id) waitingCount++;
        if (g.slot_dps2 && g.slot_dps2.user_id) waitingCount++;

        return {
          id: g.id,
          dungeon_name: g.dungeon_name,
          difficulty: g.difficulty,
          leader_id: g.leader_id,
          voice_invite_url: g.voice_invite_url,
          created_at: g.created_at,
          icon: dungeon ? dungeon.icon : null,
          level: dungeon ? dungeon.level : null,
          minCp: dungeon ? dungeon.minCp : null,
          stars: dungeon ? dungeon.stars : null,
          waitingCount,
          slots: {
            tank: g.slot_tank,
            healer: g.slot_healer,
            dps1: g.slot_dps1,
            dps2: g.slot_dps2
          }
        };
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: enrichedGroups }));
    } catch (err) {
      console.error("[API] Error fetching dungeons:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return true; // Handled
  }

  // GET /api/notifications
  if (req.method === "GET" && parsedUrl.pathname === "/api/notifications") {
    try {
      const notifs = await getNotifications(20);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true, data: notifs }));
    } catch (err) {
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: "Internal Server Error" }));
    }
    return true;
  }

  // Handle POST /api/dungeons/join
  if (req.method === "POST" && parsedUrl.pathname === "/api/dungeons/join") {
    let body = "";
    req.on("data", chunk => body += chunk.toString());
    req.on("end", async () => {
      try {
        const { groupId, userId, role } = JSON.parse(body);
        if (!groupId || !userId || !role) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: "Missing parameters" }));
          return;
        }

        // We need to call the same logic as the Discord button!
        const { apiJoinGroup } = await import("./modules/dungeonLfg.js");
        const result = await apiJoinGroup(groupId, userId, role, client);
        
        if (result.success) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } else {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        }
      } catch (err) {
        console.error("[API] Error joining dungeon:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Internal Server Error" }));
      }
    });
    return true; // Wait asynchronously for 'end'
  }

  // GET /api/guilds/members
  if (req.method === "GET" && parsedUrl.pathname.startsWith("/api/guilds/members/")) {
    const guildIdStr = parsedUrl.pathname.split("/").pop();
    try {
      if (guildIdStr === "aion2") {
        const mainGuild = await client.guilds.fetch("861355983975874601").catch(() => null);
        if (!mainGuild) throw new Error("Main guild not found");

        const pveRole = mainGuild.roles.cache.get("1401376073077231702");
        const pvpRole = mainGuild.roles.cache.get("1499929678704807946");

        const allAionMembers = new Map();

        if (pveRole) {
          pveRole.members.forEach(m => {
            allAionMembers.set(m.id, { discordMember: m, branch: "PvE" });
          });
        }
        if (pvpRole) {
          pvpRole.members.forEach(m => {
            // If they have both, mark as PvP or just overwrite
            allAionMembers.set(m.id, { discordMember: m, branch: "PvP" });
          });
        }

        // Fetch DB info to enrich with CP and Character Name
        // We use power_cards and recruits to cover all accepted members.
        const [powerRes, recruitsRes] = await Promise.all([
          query("SELECT user_id, character_name, class_name, combat_power as cp, profile_image as avatar FROM power_cards"),
          query("SELECT user_id, character_name, class_name, combat_power as cp, profile_image as avatar FROM recruits WHERE status='accepted'")
        ]);
        
        const dbMap = new Map();
        // Recruits as base
        recruitsRes.rows.forEach(r => dbMap.set(r.user_id, r));
        // Power cards overwrite recruits (since they are usually more updated)
        powerRes.rows.forEach(r => dbMap.set(r.user_id, r));

        const finalMembers = [];
        allAionMembers.forEach((data, userId) => {
          const dbData = dbMap.get(userId) || {};
          finalMembers.push({
            id: userId,
            name: dbData.character_name || data.discordMember.user.globalName || data.discordMember.user.username,
            avatar: dbData.avatar || data.discordMember.user.displayAvatarURL({ extension: "png", size: 128 }),
            class_name: dbData.class_name || "",
            cp: dbData.cp || null,
            role: data.branch
          });
        });

        // Sort by CP descending
        finalMembers.sort((a, b) => (b.cp || 0) - (a.cp || 0));

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data: finalMembers }));
        return true;
      } else {
        const mainGuild = await client.guilds.fetch("861355983975874601").catch(() => null);
        if (!mainGuild) throw new Error("Main guild not found");
        // Removed members.fetch() to avoid rate limits. We will fetch on startup instead.
        const roleId = guildIdStr === "tl" ? "1292754458492796982" : "1511293343353667656";
        const role = mainGuild.roles.cache.get(roleId);
        if (!role) throw new Error("Role not found");
        
        const membersList = role.members.map(m => ({
          id: m.id,
          name: m.user.globalName || m.user.username,
          avatar: m.user.displayAvatarURL({ extension: "png", size: 128 }),
          role: m.id === mainGuild.ownerId ? "Leader" : "Member"
        }));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data: membersList }));
        return true;
      }
    } catch (err) {
      console.error("[API] Error fetching members:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
      return true;
    }
  }

  // Get TL Status
  if (req.method === "GET" && parsedUrl.pathname === "/api/guilds/tl/status") {
    const discordId = parsedUrl.query.discordId;
    if (!discordId) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "Discord ID is required" }));
      return true;
    }

    try {
      const { query } = await import("./database/index.js");
      const result = await query("SELECT status FROM tl_recruits WHERE user_id = $1", [discordId]);
      
      if (result.rowCount > 0) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, status: result.rows[0].status }));
      } else {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, status: "none" }));
      }
      return true;
    } catch (err) {
      console.error("[API] Error fetching TL status:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
      return true;
    }
  }

  // Handle Join POST APIs
  if (req.method === "POST" && parsedUrl.pathname.startsWith("/api/join/")) {
    const game = parsedUrl.pathname.split("/").pop();
    let body = "";
    req.on("data", chunk => body += chunk.toString());
    req.on("end", async () => {
      try {
        const data = JSON.parse(body);
        const { discordId } = data;
        if (!discordId) throw new Error("Discord ID is required");

        const mainGuild = await client.guilds.fetch("861355983975874601").catch(() => null);
        if (!mainGuild) throw new Error("Main guild not found");
        const member = await mainGuild.members.fetch(discordId).catch(() => null);
        if (!member) throw new Error("أنت غير متواجد في سيرفر الديسكورد الأساسي، الرجاء الانضمام أولاً.");

        const { EmbedBuilder } = await import("discord.js");

        if (game === "tl") {
          const { className, playstyle, status } = data;

          const { query } = await import("./database/index.js");

          // Check current status - if already pending or accepted, return success silently without spamming
          const existing = await query("SELECT status FROM tl_recruits WHERE user_id = $1", [discordId]);
          if (existing.rowCount > 0) {
            const currentStatus = existing.rows[0].status;
            if (currentStatus === 'pending' || currentStatus === 'accepted') {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: true }));
              return true;
            }
          }

          // Insert or Update pending request
          await query(
            `INSERT INTO tl_recruits (user_id, discord_tag, class_name, playstyle, game_status, status)
             VALUES ($1, $2, $3, $4, $5, 'pending')
             ON CONFLICT (user_id) DO UPDATE SET
               discord_tag = $2, class_name = $3, playstyle = $4, game_status = $5, status = 'pending', updated_at = NOW()`,
            [discordId, member.user.tag, className, playstyle, status]
          );
          
          const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import("discord.js");
          
          const cardEmbed = new EmbedBuilder()
            .setColor("#8B0000")
            .setTitle("📋 طلب انضمام جديد — Throne and Liberty")
            .setThumbnail(member.user.displayAvatarURL({ extension: "png" }))
            .setDescription([
              `مقدم الطلب: <@${discordId}>`,
              ``,
              `**الاسم:** ${member.user.username}`,
              `**الكلاس والأسلحة:** ${className}`,
              `**أسلوب اللعب:** ${playstyle}`,
              `**الوضع الحالي:** ${status}`,
            ].join("\n"))
            .setFooter({ text: "Throne and Liberty • M3RGEEN Gaming Community" })
            .setTimestamp();

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`tl:accept:${discordId}`).setLabel("قبول ✅").setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`tl:reject:${discordId}`).setLabel("رفض ❌").setStyle(ButtonStyle.Danger)
          );

          // Send to Review Channel (1511534262380265533)
          const reviewChannel = await client.channels.fetch("1511534262380265533").catch(() => null);
          if (reviewChannel) {
            const msg = await reviewChannel.send({ embeds: [cardEmbed], components: [row] });
            await query("UPDATE tl_recruits SET message_id = $1 WHERE user_id = $2", [msg.id, discordId]);
          }

          // Send DM to the user
          try {
            const dmEmbed = new EmbedBuilder()
              .setColor("#FEE75C")
              .setTitle("⏳ طلب الانضمام قيد المراجعة")
              .setDescription("تم إرسال طلب انضمامك لجيلد Throne and Liberty للإدارة بنجاح. يرجى الانتظار لحين الموافقة وسيصلك إشعار بالنتيجة.")
              .setTimestamp();
            await member.send({ embeds: [dmEmbed] });
          } catch (err) {
            console.log(`Could not send DM to ${discordId}`);
          }

        } else if (game === "gw2") {
          const { selectedClass } = data;
          if (!selectedClass) throw new Error("يجب اختيار الكلاس");

          // Check if already in guild (has the GW2 role)
          const GW2_ROLE_ID = "1511293343353667656";
          if (member.roles.cache.has(GW2_ROLE_ID)) {
            // Return success silently without sending duplicate embed
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true }));
            return true;
          }

          // Add GW2 role
          await member.roles.add(GW2_ROLE_ID);

          // Build welcome embed (same style as Discord bot)
          const welcomeEmbed = new EmbedBuilder()
            .setColor("#B70000")
            .setTitle(`⚔️ مقاتل جديد انضم لقيلد Guild Wars 2!`)
            .setDescription(`رحبو معانا بالبطل <@${discordId}> القادم من التطبيق!\nإضافة قوية للقيلد بكلاس الـ **${selectedClass}** 🔥`)
            .setThumbnail(member.user.displayAvatarURL({ extension: "png" }))
            .addFields(
              { name: "الاسم", value: member.user.username, inline: true },
              { name: "الكلاس", value: selectedClass, inline: true }
            )
            .setFooter({ text: "Guild Wars 2 • M3RGEEN Gaming Community" })
            .setTimestamp();

          const membersChannel = await client.channels.fetch("1511308034939289700").catch(() => null);
          if (membersChannel) await membersChannel.send({ embeds: [welcomeEmbed] });

          // Update member count channel name
          const { updateGW2MemberCount } = await import("./modules/guildwars2.js");
          await updateGW2MemberCount(client);

        } else if (game === "aion2") {
          // Aion 2 complex join
          const { shugoUrl, guildRoleId, branch } = data;
          const { scrapeProfile } = await import("./modules/scraper.js");
          const result = await scrapeProfile(shugoUrl);
          if (!result.success) throw new Error(result.error);
          
          const { characterName, characterLevel, className, combatPower, profileImage, raceName, serverName } = result.data;
          
          // Double verification check if already exists
          const dup = await query("SELECT user_id FROM recruits WHERE shugo_url = $1 AND user_id != $2 AND guild_id = '861355983975874601'", [shugoUrl, discordId]);
          if (dup.rowCount > 0) throw new Error("هذا الرابط مسجل مسبقاً لعضو آخر.");

          // Insert pending app
          await query(
            `INSERT INTO recruits
               (guild_id, user_id, discord_tag, character_name, character_level, class_name, combat_power,
                race_name, server_name, profile_image, shugo_url, status, guild_branch, character_data)
             VALUES ('861355983975874601',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11,$12)
             ON CONFLICT (guild_id, user_id) DO UPDATE SET
               discord_tag=$2, character_name=$3, character_level=$4, class_name=$5,
               combat_power=$6, race_name=$7, server_name=$8, profile_image=$9, shugo_url=$10,
               status='pending', guild_branch=$11, character_data=$12, updated_at=NOW()
             RETURNING *`,
            [
              discordId, member.user.tag, characterName, characterLevel, className, combatPower || 0,
              raceName, serverName, profileImage, shugoUrl, branch || 'pve', JSON.stringify(result.data)
            ]
          );

          // Embed Formatting Helpers
          const numFmt = (n) => Number(n).toLocaleString("en-US");
          const fmtItem = (item, showSlot = true) => {
            const prefix = item.enchant > 0 ? `+${item.enchant} ` : "";
            const slot = showSlot && item.slot ? ` *(${item.slot})*` : "";
            return `${prefix}${item.name}${slot}`;
          };
          const fmtGearSection = (items, showSlot = true) => {
            if (!items || items.length === 0) return null;
            return items.map((it) => fmtItem(it, showSlot)).join("\n");
          };
          const STAT_DISPLAY = {
            str: { emoji: "💪", label: "Might" }, dex: { emoji: "🏃", label: "Dexterity" },
            agi: { emoji: "🎯", label: "Precision" }, wis: { emoji: "🛡️", label: "Willpower" },
            int: { emoji: "🧠", label: "Intelligence" }, con: { emoji: "❤️", label: "Constitution" },
          };
          const fmtBaseStats = (stats) => {
            if (!stats) return null;
            const order = ["str", "dex", "agi", "wis", "int", "con"];
            const entries = order.map((k) => ({ ...STAT_DISPLAY[k], value: stats[k]?.value ?? null })).filter((e) => e.value !== null);
            if (entries.length === 0) return null;
            const lines = [];
            for (let i = 0; i < entries.length; i += 2) {
              const l = entries[i], r = entries[i + 1];
              lines.push(`${l.emoji} **${l.label}**: \`${numFmt(l.value)}\`` + (r ? `　${r.emoji} **${r.label}**: \`${numFmt(r.value)}\`` : ""));
            }
            return lines.join("\n");
          };
          const fmtTitles = (titles) => {
            if (!titles) return null;
            const parts = [];
            if (titles.active) parts.push(`**${String(titles.active).slice(0, 50)}**`);
            if (titles.ownedCount) parts.push(`\`${titles.ownedCount}${titles.totalCount ? `/${titles.totalCount}` : ""} ألقاب\``);
            return parts.length > 0 ? parts.join("  •  ") : null;
          };

          const REVIEW_CHANNEL_ID = "1496262240058478792";
          const adminChannel = await client.channels.fetch(REVIEW_CHANNEL_ID).catch(() => null);
          if (adminChannel) {
            const data = result.data;
            const branchLabel = branch === 'pvp' ? "⚔️ PvP Guild" : "🛡️ PvE Guild";
            const cpDisplay = combatPower > 0 ? numFmt(combatPower) : "—";
            
            const description =
              `[🔗 عرض البروفايل على shugo.gg](${shugoUrl})\n` +
              `👑 مقدم الطلب: <@${discordId}>\n` +
              `🚩 القسم المطلوب: **${branchLabel}**`;

            const infoBlock =
              `👤 الاسم: **${characterName}**\n` +
              `📊 المستوى: **${characterLevel}**\n` +
              `⚔️ الكلاس: **${className ?? "—"}**\n` +
              `🌍 السيرفر: **${serverName ?? "—"}**\n` +
              `🧬 العرق: **${raceName ?? "—"}**\n` +
              `🏆 الرتبة (Abyss): **${data.abyss_rank ?? "—"}** (${data.abyss_score?.toLocaleString() ?? 0})`;

            const fields = [
              { name: "معلومات الشخصية", value: infoBlock, inline: false },
              { name: "قوة القتال (Combat Power) ⚔️", value: `★  **${cpDisplay}**  ★`, inline: false },
            ];

            const baseStats = fmtBaseStats(data.stats);
            if (baseStats) fields.push({ name: "الخصائص الأساسية (Base Stats)", value: baseStats, inline: false });

            const titles = fmtTitles(data.titles);
            if (titles) fields.push({ name: "الألقاب (Titles)", value: titles, inline: false });

            const gear = data.gear || {};
            const weapons = fmtGearSection(gear.weapons);
            if (weapons) fields.push({ name: "⚔️ الأسلحة (Weapons)", value: weapons, inline: false });

            const armor = fmtGearSection(gear.armor);
            if (armor) fields.push({ name: "🛡️ الدروع (Armor)", value: armor, inline: false });

            const acc = fmtGearSection(gear.accessories);
            if (acc) fields.push({ name: "💍 الإكسسوارات (Accessories)", value: acc, inline: false });

            const arcana = fmtGearSection(gear.arcana, false);
            if (arcana) fields.push({ name: "🔮 الأركانا (Arcana)", value: arcana, inline: false });

            const runes = fmtGearSection(gear.runes, false);
            if (runes) fields.push({ name: "💎 الرونز (Runes)", value: runes, inline: false });

            fields.push({ name: "مقدّم الطلب", value: `👑 <@${discordId}>`, inline: false });

            const reviewEmbed = new EmbedBuilder()
              .setColor(branch === 'pvp' ? 0xed4245 : 0x57f287)
              .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
              .setTitle(`📋 طلب انضمام جديد (${branchLabel})`)
              .setDescription(description)
              .addFields(fields)
              .setThumbnail(data.classIconUrl)
              .setFooter({ text: `Discord ID: ${discordId}` })
              .setTimestamp();

            if (profileImage) reviewEmbed.setImage(profileImage);
            
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import("discord.js");
            // App DB ID requires fetching the row id
            const appRow = await query("SELECT id FROM recruits WHERE user_id = $1 AND guild_id = '861355983975874601'", [discordId]);
            const appId = appRow.rows[0].id;

            const reviewRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`recruit:accept:${discordId}:${appId}`)
                .setLabel("✅ قبول")
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`recruit:reject:${discordId}:${appId}`)
                .setLabel("❌ رفض")
                .setStyle(ButtonStyle.Danger)
            );
            await adminChannel.send({ embeds: [reviewEmbed], components: [reviewRow] });

            const confirmEmbed = new EmbedBuilder()
              .setColor('#00D1FF')
              .setTitle(`✅ تم تقديم طلبك بنجاح!`)
              .setDescription(`طلب انضمامك إلى **${branchLabel}** وصل للقيادة.\n\nسيتم مراجعته وسنرد عليك قريباً.\nشكراً لك! ⚔️`)
              .setTimestamp();
            await member.send({ embeds: [confirmEmbed] }).catch(() => {});

            // In-app Notification for Application Submitted
            try {
              const { createNotification } = await import('./database/index.js');
              const { emitNotification } = await import('./socket.js');
              const newNotif = await createNotification(
                'recruitment',
                `تم تقديم طلب انضمام (${branchLabel})`,
                `تم إرسال طلب انضمام ${characterName} إلى قادة الفيلق، وبانتظار المراجعة.`,
                { target_user_id: discordId }
              );
              emitNotification(newNotif);
            } catch (err) {
              console.error("Notification insert error:", err);
            }
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error("[API] Error handling join:", err);
        // The mobile app specifically expects HTTP 400 to display the error message properly (like Aion 2 does)
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return true;
  }

  return false; // Not handled
}
