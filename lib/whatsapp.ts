export const WHATSAPP_NUMBER = "923411120049";
export const WHATSAPP_DISPLAY = "+92 341 1120049";

export function waLink(number: string = WHATSAPP_NUMBER): string {
  return "https://wa.me/" + number.replace(/[^0-9]/g, "");
}
