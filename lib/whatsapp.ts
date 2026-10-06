export const WHATSAPP_NUMBER = "923195843344";
export const WHATSAPP_DISPLAY = "+92 319 5843344";

export function waLink(number: string = WHATSAPP_NUMBER): string {
  return "https://wa.me/" + number.replace(/[^0-9]/g, "");
}
