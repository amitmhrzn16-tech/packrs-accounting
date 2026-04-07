import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Supported currencies with display symbols and Intl locale hints
export const SUPPORTED_CURRENCIES: Array<{
  code: string;
  name: string;
  symbol: string;
  locale: string;
}> = [
  { code: "NPR", name: "Nepalese Rupee", symbol: "रू", locale: "en-NP" },
  { code: "USD", name: "US Dollar", symbol: "$", locale: "en-US" },
  { code: "EUR", name: "Euro", symbol: "€", locale: "en-IE" },
  { code: "GBP", name: "British Pound", symbol: "£", locale: "en-GB" },
  { code: "INR", name: "Indian Rupee", symbol: "₹", locale: "en-IN" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", locale: "ja-JP" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", locale: "zh-CN" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", locale: "en-AU" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", locale: "en-CA" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", locale: "en-SG" },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", locale: "en-AE" },
  { code: "CHF", name: "Swiss Franc", symbol: "CHF", locale: "de-CH" },
];

export function getCurrencyMeta(code: string) {
  return (
    SUPPORTED_CURRENCIES.find((c) => c.code === code) || SUPPORTED_CURRENCIES[0]
  );
}

export function formatCurrency(amount: number, currency = "NPR"): string {
  const meta = getCurrencyMeta(currency);
  try {
    return new Intl.NumberFormat(meta.locale, {
      style: "currency",
      currency: meta.code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${meta.symbol} ${amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
