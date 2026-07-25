const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function convertBelowThousand(n: number): string {
  if (n === 0) return "";
  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
  return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convertBelowThousand(n % 100) : "");
}

function convertInteger(n: number): string {
  if (n === 0) return "Zero";
  let result = "";
  const billion = Math.floor(n / 1000000000);
  const million = Math.floor((n % 1000000000) / 1000000);
  const thousand = Math.floor((n % 1000000) / 1000);
  const rest = n % 1000;

  if (billion) result += convertBelowThousand(billion) + " Billion ";
  if (million) result += convertBelowThousand(million) + " Million ";
  if (thousand) result += convertBelowThousand(thousand) + " Thousand ";
  if (rest) result += convertBelowThousand(rest);

  return result.trim();
}

const currencyNames: Record<string, { major: string; minor: string }> = {
  USD: { major: "US Dollar", minor: "Cents" },
  BDT: { major: "Taka", minor: "Poisha" },
  EUR: { major: "Euro", minor: "Cents" },
};

export function amountInWords(amount: number, currency: string): string {
  const cfg = currencyNames[currency] ?? { major: currency, minor: "Cents" };
  const major = Math.floor(amount);
  const minor = Math.round((amount - major) * 100);
  let text = `${cfg.major} ${convertInteger(major)} Only`;
  if (minor > 0) {
    text = `${cfg.major} ${convertInteger(major)} and ${cfg.minor} ${convertInteger(minor)} Only`;
  }
  return text;
}


export function currencySymbol(currency: string): string {
  if (currency === "USD") return "$";
  if (currency === "EUR") return "€";
  if (currency === "BDT") return "৳";
  return currency;
}