/**
 * Phone helpers. Leads are keyed by E.164 numbers (+213661234567).
 */

/**
 * Normalises a number typed by a person in Algeria.
 * Accepts "0661 23 45 67", "0661-234-567", "+213661234567", "00213661234567",
 * "213661234567" and landlines such as "033 27 19 65".
 * Other international numbers are accepted when written with + or 00.
 */
export function normalizeDzPhone(input: string): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith("+");
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  let international = hasPlus;
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
    international = true;
  }

  if (international || digits.startsWith("213")) {
    if (digits.startsWith("213")) {
      const national = digits.slice(3).replace(/^0/, "");
      return isDzNational(national) ? `+213${national}` : null;
    }
    // Foreign number in international format (family abroad booking for relatives).
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  if (digits.startsWith("0")) {
    const national = digits.slice(1);
    return isDzNational(national) ? `+213${national}` : null;
  }
  return null;
}

/** National significant number: mobile 5/6/7 + 8 digits, landline 2/3/4 + 7 digits. */
function isDzNational(n: string): boolean {
  return /^[5-7]\d{8}$/.test(n) || /^[2-4]\d{7}$/.test(n);
}

/** WhatsApp sends wa_id / from as digits with country code and no plus sign. */
export function waIdToE164(waId: string | null | undefined): string | null {
  if (!waId) return null;
  const digits = String(waId).replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

export function phoneDigits(e164: string | null | undefined): string {
  return (e164 ?? "").replace(/\D/g, "");
}

/** Human-friendly display: +213 661 23 45 67. Falls back to the raw value. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = /^\+213(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(e164);
  if (m) return `+213 ${m[1]}${m[2]} ${m[3]} ${m[4]} ${m[5]}`;
  return e164;
}

/** Masks the middle digits for logs: +21366•••••67. */
export function maskPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  if (e164.length <= 7) return "•••";
  return `${e164.slice(0, 6)}•••••${e164.slice(-2)}`;
}

/** Direct chat link that opens the customer's conversation in WhatsApp. */
export function waChatLink(e164: string | null | undefined, text?: string): string | null {
  const digits = phoneDigits(e164);
  if (!digits) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
