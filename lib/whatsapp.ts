/** The WhatsApp Business (WABA) number the AI agent answers on.
 *
 *  This must stay the number attached to the WhatsApp Business account whose
 *  webhook feeds the n8n sales agent — every "Message us" link on the site
 *  lands here, so pointing it anywhere else means the agent never sees the
 *  conversation. The team's own number (+92 300 678 9807) is the escalation
 *  target inside n8n, deliberately NOT this one: the agent cannot notify a
 *  human on the same number it is replying from. */
export const WHATSAPP_NUMBER = "+923411120049";

export function waLink(number: string = WHATSAPP_NUMBER): string {
  return "https://wa.me/" + number.replace(/[^0-9]/g, "");
}
