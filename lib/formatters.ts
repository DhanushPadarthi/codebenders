/**
 * Formats a number to Indian Rupee currency string (e.g. ₹1,42,500 or ₹1,42,500.50)
 */
export function formatINR(amount: number, options?: { showDecimals?: boolean; compact?: boolean }): string {
  if (isNaN(amount)) return "₹0";

  const { showDecimals = false, compact = false } = options || {};

  if (compact) {
    if (Math.abs(amount) >= 10000000) {
      return `₹${(amount / 10000000).toFixed(2)} Cr`;
    }
    if (Math.abs(amount) >= 100000) {
      return `₹${(amount / 100000).toFixed(2)} L`;
    }
    if (Math.abs(amount) >= 1000) {
      return `₹${(amount / 1000).toFixed(1)}k`;
    }
  }

  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(amount);

  return formatted;
}

/**
 * Formats a date string (YYYY-MM-DD or ISO) into readable Indian business date format
 */
export function formatDate(dateInput: string | Date, format: "short" | "medium" | "long" = "medium"): string {
  if (!dateInput) return "—";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "—";

  if (format === "short") {
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  }

  if (format === "long") {
    return date.toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Returns human-relative date (e.g. "Today", "Yesterday", "In 3 days", "5 days ago")
 */
export function formatRelativeDays(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days > 1) return `In ${days} days`;
  return `${Math.abs(days)} days ago`;
}
