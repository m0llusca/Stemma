import type { Prisma } from "@prisma/client";
import {
  createDemoCalendar,
  resolveDemoSeedNow,
  type DemoCalendar
} from "./demo-calendar";
import {
  buildDemoOperationalStatusPlan,
  buildOperationalConversationSeeds,
  type DemoOperationalSeedContext,
  type OperationalConversationSeed
} from "./demo-operational-seeds";
import {
  buildDemoAnalyticalScenario,
  type DemoAnalyticalScenario,
  type DemoReviewSeedContext,
  type ReviewedConversationSeed
} from "./demo-review-seeds";
import {
  validateDemoScenario,
  type DemoOperationalStatusPlanInput,
  type DemoScenarioInput
} from "./demo-seed-validation";
import { assertSeedAllowed } from "./seed-guard";

export const demoEntityIds = {
  workspace: "demo-workspace",
  analyst: "demo-user-analyst",
  teamLead: "demo-user-team-lead",
  seniorAnalyst: "demo-user-senior-analyst"
} as const;

export const demoEntityNames = {
  workspace: "Демо Контроль качества",
  analyst: "Проверяющий",
  teamLead: "Руководитель контроля качества",
  seniorAnalyst: "Мария Кузнецова",
  supportAgent: "Иван Петров",
  supportOlga: "Ольга Иванова",
  supportDenis: "Денис Соколов",
  supportElena: "Елена Морозова"
} as const;

type BuiltDemoScenarios = {
  reviewedSeeds: ReviewedConversationSeed[];
  analyticalScenario: DemoAnalyticalScenario;
  operationalSeeds: OperationalConversationSeed[];
  statusPlan: DemoOperationalStatusPlanInput;
};

export type PreparedDemoSeed = BuiltDemoScenarios & {
  ids: typeof demoEntityIds;
  names: typeof demoEntityNames;
  calendar: DemoCalendar;
};

export type PrepareDemoSeedDependencies = {
  assertSeedAllowed: typeof assertSeedAllowed;
  resolveDemoSeedNow: typeof resolveDemoSeedNow;
  createDemoCalendar: typeof createDemoCalendar;
  buildScenarios: (calendar: DemoCalendar) => BuiltDemoScenarios;
  validateDemoScenario: (input: DemoScenarioInput) => void;
};

export type DemoSeedTransactionHost = {
  $transaction<Result>(
    callback: (transaction: Prisma.TransactionClient) => Promise<Result>,
    options?: {
      maxWait?: number;
      timeout?: number;
    }
  ): Promise<Result>;
};

const reviewContext = {
  analystId: demoEntityIds.analyst,
  teamLeadId: demoEntityIds.teamLead,
  seniorAnalystId: demoEntityIds.seniorAnalyst,
  supportAgentName: demoEntityNames.supportAgent,
  supportOlgaName: demoEntityNames.supportOlga,
  supportDenisName: demoEntityNames.supportDenis,
  supportElenaName: demoEntityNames.supportElena
} satisfies DemoReviewSeedContext;

const operationalContext = {
  analystId: demoEntityIds.analyst,
  analystName: demoEntityNames.analyst,
  teamLeadId: demoEntityIds.teamLead,
  teamLeadName: demoEntityNames.teamLead,
  seniorAnalystId: demoEntityIds.seniorAnalyst,
  seniorAnalystName: demoEntityNames.seniorAnalyst,
  supportAgentName: demoEntityNames.supportAgent,
  supportOlgaName: demoEntityNames.supportOlga,
  supportDenisName: demoEntityNames.supportDenis,
  supportElenaName: demoEntityNames.supportElena
} satisfies DemoOperationalSeedContext;

function buildScenarios(calendar: DemoCalendar): BuiltDemoScenarios {
  const analyticalScenario = buildDemoAnalyticalScenario(reviewContext, calendar);
  return {
    reviewedSeeds: analyticalScenario.reviews,
    analyticalScenario,
    operationalSeeds: buildOperationalConversationSeeds(
      operationalContext,
      calendar
    ),
    statusPlan: buildDemoOperationalStatusPlan()
  };
}

const defaultDependencies: PrepareDemoSeedDependencies = {
  assertSeedAllowed,
  resolveDemoSeedNow,
  createDemoCalendar,
  buildScenarios,
  validateDemoScenario
};

export function prepareDemoSeed(
  env: NodeJS.ProcessEnv,
  dependencyOverrides: Partial<PrepareDemoSeedDependencies> = {}
): PreparedDemoSeed {
  const dependencies = {
    ...defaultDependencies,
    ...dependencyOverrides
  };

  dependencies.assertSeedAllowed(env);
  const now = dependencies.resolveDemoSeedNow(env);
  const calendar = dependencies.createDemoCalendar(now);
  const scenarios = dependencies.buildScenarios(calendar);

  dependencies.validateDemoScenario({
    calendar,
    reviewedSeeds: scenarios.reviewedSeeds,
    analyticalScenario: scenarios.analyticalScenario,
    operationalSeeds: scenarios.operationalSeeds,
    statusPlan: scenarios.statusPlan
  });

  return {
    ids: demoEntityIds,
    names: demoEntityNames,
    calendar,
    ...scenarios
  };
}

export async function runPreparedDemoSeed<Result>(
  env: NodeJS.ProcessEnv,
  transactionHost: DemoSeedTransactionHost,
  mutationCallback: (
    preparedDemoSeed: PreparedDemoSeed,
    transaction: Prisma.TransactionClient
  ) => Result | Promise<Result>,
  dependencyOverrides: Partial<PrepareDemoSeedDependencies> = {}
): Promise<Result> {
  const preparedDemoSeed = prepareDemoSeed(env, dependencyOverrides);

  return transactionHost.$transaction(
    (transaction) =>
      Promise.resolve(mutationCallback(preparedDemoSeed, transaction)),
    {
      maxWait: 10_000,
      timeout: 60_000
    }
  );
}
