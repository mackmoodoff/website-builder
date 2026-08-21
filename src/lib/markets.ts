export type Market = {
  code: string;
  name: string;
  language: string;
  languageName: string;
};

export const MARKETS: Market[] = [
  { code: "US", name: "United States", language: "en", languageName: "English" },
  { code: "CA", name: "Canada", language: "en", languageName: "English" },
  { code: "UK", name: "United Kingdom", language: "en", languageName: "English" },
  { code: "TR", name: "Turkey", language: "tr", languageName: "Turkish" },
  { code: "ES", name: "Spain", language: "es", languageName: "Spanish" },
];

export function marketByCode(code: string): Market | undefined {
  return MARKETS.find((m) => m.code === code);
}
