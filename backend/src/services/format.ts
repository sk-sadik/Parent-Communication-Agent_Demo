// Deterministic formatting helpers shared by the reply templates.
//
// Dates come from PostgreSQL `date` columns and are UTC midnight, so all
// getters below use UTC to avoid an off-by-one day on other timezones.

import type { Language } from "../generated/prisma/enums.js";

const EN_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const TE_MONTHS = [
  "జనవరి",
  "ఫిబ్రవరి",
  "మార్చి",
  "ఏప్రిల్",
  "మే",
  "జూన్",
  "జూలై",
  "ఆగస్టు",
  "సెప్టెంబర్",
  "అక్టోబర్",
  "నవంబర్",
  "డిసెంబర్",
] as const;

export function formatDate(date: Date, language: Language): string {
  const day = date.getUTCDate();
  const month = date.getUTCMonth();
  const year = date.getUTCFullYear();
  if (language === "te") {
    return `${day} ${TE_MONTHS[month]} ${year}`;
  }
  return `${day} ${EN_MONTHS[month]} ${year}`;
}

export function formatDateRange(from: Date, to: Date, language: Language): string {
  return `${formatDate(from, language)} – ${formatDate(to, language)}`;
}

export function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

/** Indian digit grouping (4,50,000) without depending on ICU data. */
export function formatAmount(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const [whole, fraction] = rounded.toFixed(2).split(".");
  const digits = whole ?? "0";
  const lastThree = digits.slice(-3);
  const rest = digits.slice(0, -3);
  const grouped = rest
    ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${lastThree}`
    : lastThree;
  const minor = fraction === "00" ? "" : `.${fraction}`;
  return `₹${grouped}${minor}`;
}
