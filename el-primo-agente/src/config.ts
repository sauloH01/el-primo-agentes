// src/config.ts
// Reglas de negocio de EL PRIMO

export const MIN_BUDGET = 4_000_000; // COP — ticket mínimo
export const OUTSIDE_ZONE_FEE = 80_000; // COP — viáticos fuera de Fusagasugá (descontable)

export const VALID_ZONES = [
  "Fusagasugá",
  "Chinauta",
  "Silvania",
  "La Mesa",
  "Bogotá",
  "Melgar",
  "Girardot",
];

export const TIERS = [
  { name: "Básico", multiplier: 1.0 },
  { name: "Premium", multiplier: 1.2 },
  { name: "Lujo", multiplier: 1.5 },
] as const;
