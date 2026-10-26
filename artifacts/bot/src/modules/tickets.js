/**
 * M3RGEEN Ticket System — Module Facade
 * 
 * Re-exports the modular ticket system and maintains backwards-compatibility.
 */

export * from "./tickets/index.js";
import { handleTicketInteraction, sendTicketPanel } from "./tickets/index.js";

// Backwards-compatible aliases
export const handleInteraction = handleTicketInteraction;
export const sendPanel = async (interaction) => {
  return await sendTicketPanel(interaction.channel);
};
