/**
 * M3RGEEN Ticket System — Main Module Entry Point
 */

import { buildTicketPanelComponents } from "./embeds.js";
import { handleTicketInteraction } from "./router.js";
import { TICKET_CHANNELS } from "./config.js";

export { handleTicketInteraction } from "./router.js";
export * from "./config.js";
export * from "./db.js";
export * from "./archiver.js";

/**
 * Send or update the ticket panel in the designated TICKET channel.
 */
export async function sendTicketPanel(targetChannel) {
  const { embeds, components } = buildTicketPanelComponents();
  return await targetChannel.send({ embeds, components });
}
