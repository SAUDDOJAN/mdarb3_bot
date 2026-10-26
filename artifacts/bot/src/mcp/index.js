import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import client from "../client.js";

const app = express();

function getAllowedChannels() {
  const mapping = process.env.MCP_ALLOWED_CHANNELS || "";
  const allowed = {};
  mapping.split(",").forEach(pair => {
    const [alias, id] = pair.split("=");
    if (alias && id) allowed[alias.trim()] = id.trim();
  });
  return allowed;
}

function getAllowedRoles() {
  const mapping = process.env.MCP_ALLOWED_ROLES || "";
  const allowed = {};
  mapping.split(",").forEach(pair => {
    const [alias, id] = pair.split("=");
    // Prevent everyone role specifically
    if (alias && id && alias.trim().toLowerCase() !== "everyone") {
      allowed[alias.trim()] = id.trim();
    }
  });
  return allowed;
}

// ---------------------------------------------------------
// SIMPLE OAUTH2 PROVIDER FOR CHATGPT
// ---------------------------------------------------------

// GET /mcp/authorize
app.get("/mcp/authorize", (req, res) => {
  const { client_id, redirect_uri, state } = req.query;
  
  if (client_id !== process.env.MCP_CLIENT_ID) {
    return res.status(401).send("Invalid client_id");
  }
  
  if (!redirect_uri) {
    return res.status(400).send("Missing redirect_uri");
  }

  // Generate auth code
  const authCode = "code_" + Date.now();
  
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.append("code", authCode);
  if (state) {
    redirectUrl.searchParams.append("state", state);
  }
  
  res.redirect(redirectUrl.toString());
});

// POST /mcp/token
app.post("/mcp/token", express.urlencoded({ extended: true }), (req, res) => {
  const { client_id, client_secret } = req.body;
  
  let authClientId = client_id;
  let authClientSecret = client_secret;
  
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Basic ")) {
    const decoded = Buffer.from(authHeader.substring(6), "base64").toString("utf8");
    const [id, secret] = decoded.split(":");
    authClientId = id;
    authClientSecret = secret;
  }

  if (authClientId !== process.env.MCP_CLIENT_ID || authClientSecret !== process.env.MCP_CLIENT_SECRET) {
    return res.status(401).json({ error: "invalid_client" });
  }

  res.json({
    access_token: process.env.MCP_AUTH_TOKEN,
    token_type: "Bearer",
    expires_in: 31536000,
    refresh_token: "refresh_" + Date.now()
  });
});

// ---------------------------------------------------------
// MCP AUTHENTICATION MIDDLEWARE
// ---------------------------------------------------------
app.use("/mcp/sse", (req, res, next) => {
  const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;
  const authHeader = req.headers.authorization;
  if (!MCP_AUTH_TOKEN) {
    console.error("[MCP] MCP_AUTH_TOKEN is not configured.");
    return res.status(500).json({ error: "Server misconfiguration" });
  }
  if (!authHeader || authHeader !== `Bearer ${MCP_AUTH_TOKEN}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
});

// ---------------------------------------------------------
// MCP SERVER LOGIC
// ---------------------------------------------------------

const server = new Server(
  {
    name: "discord-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

let transport = null;

app.get("/mcp/sse", async (req, res) => {
  console.log("[MCP] SSE Connection established");
  transport = new SSEServerTransport("/mcp/messages", res);
  await server.connect(transport);
});

app.post("/mcp/messages", async (req, res) => {
  if (transport) {
    try {
      await transport.handlePostMessage(req, res);
    } catch (e) {
      console.error("[MCP] Error handling message", e);
      if (!res.headersSent) res.status(500).send("Error handling message");
    }
  } else {
    res.status(400).send("No active SSE connection");
  }
});

// Define Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "discord_list_allowed_channels",
        description: "List all allowed Discord channels for publishing posts, returning their aliases and details.",
        inputSchema: {
          type: "object",
          properties: {},
          required: []
        }
      },
      {
        name: "discord_preview_post",
        description: "Validate and preview a Discord post without actually publishing it. Highly recommended before discord_publish_post.",
        inputSchema: {
          type: "object",
          properties: {
            channel_alias: { type: "string", description: "The alias of the channel to post to" },
            content: { type: "string", description: "The message content (max 2000 chars)" },
            title: { type: "string", description: "Optional embed title" },
            image_url: { type: "string", description: "Optional HTTPS image URL" },
            role_mention: { type: "string", description: "Optional role alias to mention" }
          },
          required: ["channel_alias", "content"]
        }
      },
      {
        name: "discord_publish_post",
        description: "DANGEROUS ACTION: Publish a verified post to a Discord channel. You MUST set confirmed: true after previewing.",
        inputSchema: {
          type: "object",
          properties: {
            channel_alias: { type: "string", description: "The alias of the channel" },
            content: { type: "string", description: "The message content (max 2000 chars)" },
            title: { type: "string", description: "Optional embed title" },
            image_url: { type: "string", description: "Optional HTTPS image URL" },
            role_mention: { type: "string", description: "Optional role alias to mention" },
            confirmed: { type: "boolean", description: "Must be exactly true to execute" }
          },
          required: ["channel_alias", "content", "confirmed"]
        }
      },
      {
        name: "discord_edit_post",
        description: "DANGEROUS ACTION: Edit an existing post created by this bot.",
        inputSchema: {
          type: "object",
          properties: {
            channel_alias: { type: "string", description: "The alias of the channel where the message is" },
            message_id: { type: "string", description: "The ID of the message to edit" },
            content: { type: "string", description: "The new message content" },
            title: { type: "string", description: "Optional new embed title" },
            image_url: { type: "string", description: "Optional new HTTPS image URL" },
            role_mention: { type: "string", description: "Optional role alias to mention" },
            confirmed: { type: "boolean", description: "Must be exactly true to execute" }
          },
          required: ["channel_alias", "message_id", "content", "confirmed"]
        }
      },
      {
        name: "discord_delete_post",
        description: "DANGEROUS ACTION: Delete a post created by this bot.",
        inputSchema: {
          type: "object",
          properties: {
            channel_alias: { type: "string", description: "The alias of the channel" },
            message_id: { type: "string", description: "The ID of the message to delete" },
            confirmed: { type: "boolean", description: "Must be exactly true to execute" }
          },
          required: ["channel_alias", "message_id", "confirmed"]
        }
      }
    ]
  };
});

function validatePostInput(args) {
  if (args.content && args.content.length > 2000) {
    throw new Error("Content exceeds Discord's 2000 character limit.");
  }
  if (args.image_url && !args.image_url.startsWith("https://")) {
    throw new Error("Image URL must use HTTPS.");
  }
  const allowedChannels = getAllowedChannels();
  const channelId = allowedChannels[args.channel_alias];
  if (!channelId) {
    throw new Error(`Channel alias '${args.channel_alias}' is not in the allowed list.`);
  }
  let roleId = null;
  if (args.role_mention) {
    const allowedRoles = getAllowedRoles();
    roleId = allowedRoles[args.role_mention];
    if (!roleId) {
      throw new Error(`Role alias '${args.role_mention}' is not in the allowed list.`);
    }
  }
  
  if (args.content && (args.content.includes("@everyone") || args.content.includes("@here"))) {
    throw new Error("@everyone and @here are strictly forbidden.");
  }
  
  return { channelId, roleId };
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    const MCP_ALLOWED_GUILD_ID = process.env.MCP_ALLOWED_GUILD_ID;
    if (!MCP_ALLOWED_GUILD_ID) {
      throw new Error("MCP_ALLOWED_GUILD_ID is not configured on the server.");
    }
    const guild = client.guilds.cache.get(MCP_ALLOWED_GUILD_ID);
    if (!guild) {
      throw new Error("Bot is not connected to the allowed guild.");
    }

    if (name === "discord_list_allowed_channels") {
      const result = [];
      const allowedChannels = getAllowedChannels();
      for (const [alias, id] of Object.entries(allowedChannels)) {
        const channel = guild.channels.cache.get(id);
        result.push({
          alias,
          id,
          name: channel ? channel.name : "Unknown/Uncached",
          accessible: !!channel
        });
      }
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    if (name === "discord_preview_post") {
      const { channelId, roleId } = validatePostInput(args);
      const preview = {
        target_channel: args.channel_alias,
        target_channel_id: channelId,
        content: `${roleId ? `<@&${roleId}> ` : ''}${args.content}`.trim(),
        title: args.title || null,
        image_url: args.image_url || null,
        status: "Valid and ready to publish. Use discord_publish_post with confirmed: true."
      };
      return { content: [{ type: "text", text: JSON.stringify(preview, null, 2) }] };
    }

    if (name === "discord_publish_post") {
      if (args.confirmed !== true) {
        throw new Error("You must set 'confirmed: true' to execute this action.");
      }
      const { channelId, roleId } = validatePostInput(args);
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel) throw new Error("Channel not found or bot lacks access.");
      
      const messageContent = `${roleId ? `<@&${roleId}> ` : ''}${args.content}`.trim();
      const payload = {
        content: messageContent || undefined,
        embeds: [],
        allowedMentions: {
          parse: [],
          roles: roleId ? [roleId] : [],
          users: [],
          repliedUser: false
        }
      };
      
      if (args.title || args.image_url) {
        const embed = { color: 0x5865F2 };
        if (args.title) embed.title = args.title;
        if (args.image_url) embed.image = { url: args.image_url };
        payload.embeds.push(embed);
      }

      console.log(`[MCP] Publishing post to channel ${channelId} (alias: ${args.channel_alias})`);
      const msg = await channel.send(payload);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            message_id: msg.id,
            channel_id: channel.id,
            channel_name: channel.name,
            message_url: msg.url,
            timestamp: new Date().toISOString()
          }, null, 2)
        }]
      };
    }

    if (name === "discord_edit_post") {
      if (args.confirmed !== true) {
        throw new Error("You must set 'confirmed: true' to execute this action.");
      }
      const { channelId, roleId } = validatePostInput(args);
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel) throw new Error("Channel not found or bot lacks access.");
      const msg = await channel.messages.fetch(args.message_id).catch(() => null);
      if (!msg) throw new Error("Message not found.");
      if (msg.author.id !== client.user.id) throw new Error("Can only edit messages authored by the bot.");

      const messageContent = `${roleId ? `<@&${roleId}> ` : ''}${args.content}`.trim();
      const payload = {
        content: messageContent || undefined,
        embeds: [],
        allowedMentions: {
          parse: [],
          roles: roleId ? [roleId] : [],
          users: [],
          repliedUser: false
        }
      };
      
      if (args.title || args.image_url) {
        const embed = { color: 0x5865F2 };
        if (args.title) embed.title = args.title;
        if (args.image_url) embed.image = { url: args.image_url };
        payload.embeds.push(embed);
      }

      console.log(`[MCP] Editing post ${args.message_id} in channel ${channelId}`);
      const updatedMsg = await msg.edit(payload);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            success: true,
            message_id: updatedMsg.id,
            message_url: updatedMsg.url
          }, null, 2)
        }]
      };
    }

    if (name === "discord_delete_post") {
      if (args.confirmed !== true) {
        throw new Error("You must set 'confirmed: true' to execute this action.");
      }
      const allowedChannels = getAllowedChannels();
      const channelId = allowedChannels[args.channel_alias];
      if (!channelId) throw new Error(`Channel alias '${args.channel_alias}' is not in the allowed list.`);
      
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (!channel) throw new Error("Channel not found or bot lacks access.");
      const msg = await channel.messages.fetch(args.message_id).catch(() => null);
      if (!msg) throw new Error("Message not found.");
      if (msg.author.id !== client.user.id) throw new Error("Can only delete messages authored by the bot.");

      console.log(`[MCP] Deleting post ${args.message_id} in channel ${channelId}`);
      await msg.delete();
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ success: true, action: "deleted" }, null, 2)
        }]
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    console.error(`[MCP] Tool error in ${name}:`, error.message);
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});

export const handleMcpRequest = app;
