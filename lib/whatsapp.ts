export const WHATSAPP_NUMBER = "+923006789807";

export function waLink(number: string = WHATSAPP_NUMBER): string {
  return "https://wa.me/" + number.replace(/[^0-9]/g, "");
}
