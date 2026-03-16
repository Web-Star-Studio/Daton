import {
  OrganizationGoal as OrganizationGoalEnum,
  OrganizationMaturityLevel as OrganizationMaturityLevelEnum,
  OrganizationSector as OrganizationSectorEnum,
  OrganizationSize as OrganizationSizeEnum,
  type OrganizationGoal,
  type OrganizationMaturityLevel,
  type OrganizationSector,
  type OrganizationSize,
} from "@workspace/api-client-react";

export type {
  OrganizationGoal,
  OrganizationMaturityLevel,
  OrganizationSector,
  OrganizationSize,
};

export const ORGANIZATION_SECTORS = [
  OrganizationSectorEnum.manufacturing,
  OrganizationSectorEnum.agro,
  OrganizationSectorEnum.food_beverage,
  OrganizationSectorEnum.mining,
  OrganizationSectorEnum.oil_gas,
  OrganizationSectorEnum.energy,
  OrganizationSectorEnum.chemical,
  OrganizationSectorEnum.pulp_paper,
  OrganizationSectorEnum.steel,
  OrganizationSectorEnum.logistics,
  OrganizationSectorEnum.financial,
  OrganizationSectorEnum.telecom,
  OrganizationSectorEnum.public,
  OrganizationSectorEnum.pharma_cosmetics,
  OrganizationSectorEnum.automotive,
  OrganizationSectorEnum.technology,
  OrganizationSectorEnum.consumer_goods,
  OrganizationSectorEnum.utilities,
  OrganizationSectorEnum.healthcare,
  OrganizationSectorEnum.education,
  OrganizationSectorEnum.retail,
  OrganizationSectorEnum.construction,
  OrganizationSectorEnum.services,
  OrganizationSectorEnum.other,
] as const;

export const ORGANIZATION_SIZES = [
  OrganizationSizeEnum.micro,
  OrganizationSizeEnum.small,
  OrganizationSizeEnum.medium,
  OrganizationSizeEnum.large,
  OrganizationSizeEnum.xlarge,
  OrganizationSizeEnum.enterprise,
] as const;

export const ORGANIZATION_GOALS = [
  OrganizationGoalEnum.emissions_reduction,
  OrganizationGoalEnum.environmental_compliance,
  OrganizationGoalEnum.health_safety,
  OrganizationGoalEnum.energy_efficiency,
  OrganizationGoalEnum.water_management,
  OrganizationGoalEnum.waste_reduction,
  OrganizationGoalEnum.sustainability,
  OrganizationGoalEnum.quality,
  OrganizationGoalEnum.compliance,
  OrganizationGoalEnum.performance,
  OrganizationGoalEnum.innovation,
  OrganizationGoalEnum.cost_reduction,
] as const;

export const ORGANIZATION_MATURITY_LEVELS = [
  OrganizationMaturityLevelEnum.beginner,
  OrganizationMaturityLevelEnum.intermediate,
  OrganizationMaturityLevelEnum.advanced,
] as const;

export const SECTOR_LABELS: Record<OrganizationSector, string> = {
  manufacturing: "Indústria de transformação",
  agro: "Agro",
  food_beverage: "Alimentos e bebidas",
  mining: "Mineração",
  oil_gas: "Óleo e gás",
  energy: "Energia",
  chemical: "Químico",
  pulp_paper: "Papel e celulose",
  steel: "Siderurgia",
  logistics: "Logística",
  financial: "Financeiro",
  telecom: "Telecom",
  public: "Setor público",
  pharma_cosmetics: "Farma e cosméticos",
  automotive: "Automotivo",
  technology: "Tecnologia",
  consumer_goods: "Bens de consumo",
  utilities: "Utilities",
  healthcare: "Saúde",
  education: "Educação",
  retail: "Varejo",
  construction: "Construção",
  services: "Serviços",
  other: "Outro",
};

export const SIZE_LABELS: Record<OrganizationSize, string> = {
  micro: "Micro",
  small: "Pequena",
  medium: "Média",
  large: "Grande",
  xlarge: "Muito grande",
  enterprise: "Enterprise",
};

export const GOAL_LABELS: Record<OrganizationGoal, string> = {
  emissions_reduction: "Redução de emissões",
  environmental_compliance: "Conformidade ambiental",
  health_safety: "Saúde e segurança",
  energy_efficiency: "Eficiência energética",
  water_management: "Gestão de água",
  waste_reduction: "Redução de resíduos",
  sustainability: "Sustentabilidade",
  quality: "Qualidade",
  compliance: "Compliance",
  performance: "Performance",
  innovation: "Inovação",
  cost_reduction: "Redução de custos",
};

export const MATURITY_LABELS: Record<OrganizationMaturityLevel, string> = {
  beginner: "Inicial",
  intermediate: "Intermediário",
  advanced: "Avançado",
};

export const sectorOptions = ORGANIZATION_SECTORS.map((value) => ({ value, label: SECTOR_LABELS[value] }));
export const sizeOptions = ORGANIZATION_SIZES.map((value) => ({ value, label: SIZE_LABELS[value] }));
export const goalOptions = ORGANIZATION_GOALS.map((value) => ({ value, label: GOAL_LABELS[value] }));
export const maturityOptions = ORGANIZATION_MATURITY_LEVELS.map((value) => ({ value, label: MATURITY_LABELS[value] }));

export function getSectorLabel(value?: OrganizationSector | null, customSector?: string | null) {
  if (!value) return "Não informado";
  if (value === "other") return customSector?.trim() || "Não informado";
  return SECTOR_LABELS[value] ?? value;
}

export function getSizeLabel(value?: OrganizationSize | null) {
  return value ? (SIZE_LABELS[value] ?? value) : "Não informado";
}

export function getGoalLabel(value?: OrganizationGoal | null) {
  return value ? (GOAL_LABELS[value] ?? value) : "Não informado";
}

export function getMaturityLabel(value?: OrganizationMaturityLevel | null) {
  return value ? (MATURITY_LABELS[value] ?? value) : "Não informado";
}
