export const SCHEMA_CONTRACT_GAPS = [
  "review.calibrationSessionId",
  "conversation.samplingType.OUT_OF_SAMPLE"
] as const;

export type SchemaContractGap = (typeof SCHEMA_CONTRACT_GAPS)[number];

export function schemaContractGaps(input: {
  reviewColumns: readonly string[];
  samplingCheck: string | null;
}): SchemaContractGap[] {
  const gaps: SchemaContractGap[] = [];

  if (!input.reviewColumns.includes("calibrationSessionId")) {
    gaps.push("review.calibrationSessionId");
  }

  if (!input.samplingCheck?.includes("OUT_OF_SAMPLE")) {
    gaps.push("conversation.samplingType.OUT_OF_SAMPLE");
  }

  return gaps;
}

type SchemaQueryClient = {
  $queryRaw: <T>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
};

export async function loadSchemaContractGaps(db: SchemaQueryClient) {
  const columns = await db.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Review'
      AND column_name = 'calibrationSessionId'
  `;
  const checks = await db.$queryRaw<Array<{ definition: string }>>`
    SELECT pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conname = 'Conversation_samplingType_chk'
  `;

  return schemaContractGaps({
    reviewColumns: columns.map((column) => column.column_name),
    samplingCheck: checks[0]?.definition ?? null
  });
}
