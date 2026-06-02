import { query } from "./database/index.js";
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

  return false; // Not handled
}
