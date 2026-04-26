// ISO 3166-1 alpha-3 → display name. Backend stores User.country as
// String(3), so we receive "NGA" / "CMR" etc. Unknown codes fall back
// to the raw ISO-3 string (better than rendering nothing).
const COUNTRY_NAMES: Record<string, string> = {
  // V1 primary markets
  NGA: "Nigeria",
  GHA: "Ghana",
  KEN: "Kenya",
  CMR: "Cameroon",
  // V1 secondary
  ZAF: "South Africa",
  CIV: "Côte d'Ivoire",
  SEN: "Senegal",
  TZA: "Tanzania",
  UGA: "Uganda",
  RWA: "Rwanda",
  MAR: "Morocco",
  EGY: "Egypt",
  ETH: "Ethiopia",
  // Diaspora hubs
  USA: "United States",
  GBR: "United Kingdom",
  FRA: "France",
  CAN: "Canada",
  BEL: "Belgium",
  DEU: "Germany",
};

export function countryName(iso3: string | null | undefined): string | null {
  if (!iso3) return null;
  return COUNTRY_NAMES[iso3] ?? iso3;
}
