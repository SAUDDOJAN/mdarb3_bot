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
        const dbRes = await query("SELECT user_id as id, discord_tag as name, character_name, class_name, combat_power as cp, profile_image as avatar FROM sage_recruitment WHERE status = 'accepted' ORDER BY combat_power DESC");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, data: dbRes.rows }));
        return true;
      } else {
        const mainGuild = await client.guilds.fetch("861355983975874601").catch(() => null);
        if (!mainGuild) throw new Error("Main guild not found");
        await mainGuild.members.fetch();
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
          const { className, weapons, playstyle, status } = data;
          await member.roles.add("1292754458492796982"); // TL Role
          
          const cardEmbed = new EmbedBuilder()
            .setColor("#8B0000")
            .setTitle("📋 بطاقة لاعب جديد — Throne and Liberty")
            .setThumbnail(member.user.displayAvatarURL({ extension: "png" }))
            .setDescription([
              `انضم إلى الجيلد عبر التطبيق: <@${discordId}>`,
              ``,
              `**الاسم:** ${member.user.username}`,
              `**الكلاس:** ${className}`,
              `**الأسلحة:** ${weapons}`,
              `**أسلوب اللعب:** ${playstyle}`,
              `**الوضع الحالي:** ${status}`,
              `**القوانين:** ✅ وافق على قوانين الجيلد`,
            ].join("\n"))
            .setFooter({ text: "Throne and Liberty • M3RGEEN Gaming Community" })
            .setTimestamp();

          const membersChannel = await client.channels.fetch("1511464947425476799").catch(() => null);
          if (membersChannel) await membersChannel.send({ embeds: [cardEmbed] });

        } else if (game === "gw2") {
          const { selectedClass } = data;
          await member.roles.add("1511293343353667656"); // GW2 Role
          
          const welcomeEmbed = new EmbedBuilder()
            .setColor("#B70000")
            .setTitle(`⚔️ مقاتل جديد انضم لقيلد Guild Wars 2!`)
            .setDescription(`رحبو معانا بالبطل <@${discordId}> القادم من التطبيق!\nإضافة قوية للقيلد بكلاس الـ **${selectedClass}** 🔥`)
            .setThumbnail(member.user.displayAvatarURL({ extension: "png" }))
            .addFields(
              { name: "الاسم", value: member.user.username, inline: false },
              { name: "الكلاس", value: `${selectedClass}`, inline: false }
            )
            .setFooter({ text: "Guild Wars 2 • M3RGEEN Gaming Community" })
            .setTimestamp();

          const membersChannel = await client.channels.fetch("1511308034939289700").catch(() => null);
          if (membersChannel) await membersChannel.send({ embeds: [welcomeEmbed] });

        } else if (game === "aion2") {
          // Aion 2 complex join
          const { shugoUrl, guildRoleId } = data;
          const { scrapeProfile } = await import("./modules/scraper.js");
          const result = await scrapeProfile(shugoUrl);
          if (!result.success) throw new Error(result.error);
          
          const { characterName, characterLevel, className, combatPower, profileImage, raceName, serverName } = result.data;
          
          // Double verification check if already exists
          const dup = await query("SELECT user_id FROM sage_recruitment WHERE shugo_url = $1 AND user_id != $2", [shugoUrl, discordId]);
          if (dup.rowCount > 0) throw new Error("هذا الرابط مسجل مسبقاً لعضو آخر.");

          // Insert pending app
          await query(
            `INSERT INTO sage_recruitment
               (user_id, discord_tag, character_name, character_level, class_name, combat_power,
                race_name, server_name, profile_image, shugo_url, guild_role_id, guild_name,
                status, character_data, source_discord_server, joined_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending',$13,$14,NOW())
             ON CONFLICT (user_id) DO UPDATE SET
               discord_tag=$2, character_name=$3, character_level=$4, class_name=$5,
               combat_power=$6, race_name=$7, server_name=$8, profile_image=$9, shugo_url=$10,
               guild_role_id=$11, guild_name=$12, status='pending', character_data=$13,
               updated_at=NOW()
             RETURNING *`,
            [
              discordId, member.user.tag, characterName, characterLevel, className, combatPower || 0,
              raceName, serverName, profileImage, shugoUrl, guildRoleId, "تم الانضمام عبر التطبيق", JSON.stringify(result.data), "M3RGEEN App"
            ]
          );

          // We'll just notify the admin channel 
          const ALL_APP_CHANNEL_ID = "1508451380560531586";
          const adminChannel = await client.channels.fetch(ALL_APP_CHANNEL_ID).catch(() => null);
          if (adminChannel) {
            const reviewEmbed = new EmbedBuilder()
              .setColor(0xd4af37)
              .setTitle("📋 طلب انضمام جديد من التطبيق — Siege Alliance")
              .setDescription(`👑 Applicant: <@${discordId}>\n[🔗 View Profile on shugo.gg](${shugoUrl})`)
              .addFields(
                { name: "👤 Character", value: characterName ?? "—" },
                { name: "📊 Level", value: String(characterLevel ?? "—") },
                { name: "🎮 Class", value: className ?? "—" },
                { name: "⚡ Combat Power (CP)", value: `★ **${combatPower || "—"}** ★` }
              )
              .setTimestamp();
            if (profileImage) reviewEmbed.setImage(profileImage);
            
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import("discord.js");
            // App DB ID requires fetching the row id, but we can just use the user_id for simplicity here.
            // Note: In sageController it uses appId, we can fetch it:
            const appRow = await query("SELECT id FROM sage_recruitment WHERE user_id = $1", [discordId]);
            const appId = appRow.rows[0].id;
            
            const reviewRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`sage:accept:${discordId}:${appId}`).setLabel("✅ Accept").setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId(`sage:reject:${discordId}:${appId}`).setLabel("❌ Reject").setStyle(ButtonStyle.Danger)
            );
            await adminChannel.send({ embeds: [reviewEmbed], components: [reviewRow] });
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error("[API] Error handling join:", err);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return true;
  }

  return false; // Not handled
}
