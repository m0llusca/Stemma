import type { Prisma } from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  runPreparedDemoSeed,
  type DemoSeedTransactionHost
} from "../../prisma/demo-seed-bootstrap";

const TEST_ENV = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://qc_app:qc_app@localhost:55432/qc_app_demo_verify?schema=public",
  DEMO_SEED_NOW: "2026-07-28T09:00:00.000Z"
} satisfies NodeJS.ProcessEnv;

type WorkspaceState = Map<string, { id: string; name: string }>;
type FakeTransaction = {
  workspace: {
    upsert(input: {
      where: { id: string };
      create: { id: string; name: string };
      update: unknown;
    }): Promise<void>;
  };
};

function transactionHost(initialState: WorkspaceState) {
  let state = new Map(initialState);
  let transactionClient: FakeTransaction | null = null;
  let transactionOptions: { maxWait?: number; timeout?: number } | undefined;

  return {
    host: {
      async $transaction<Result>(
        callback: (transaction: Prisma.TransactionClient) => Promise<Result>,
        options?: { maxWait?: number; timeout?: number }
      ): Promise<Result> {
        transactionOptions = options;
        const pending = new Map(state);
        const transaction: FakeTransaction = {
          workspace: {
            async upsert(input) {
              pending.set(input.where.id, input.create);
            }
          }
        };
        transactionClient = transaction;
        const result = await callback(
          transaction as unknown as Prisma.TransactionClient
        );
        state = pending;
        return result;
      }
    } satisfies DemoSeedTransactionHost,
    getState: () => state,
    getTransactionClient: () => transactionClient,
    getTransactionOptions: () => transactionOptions
  };
}

describe("runPreparedDemoSeed transaction seam", () => {
  it("keeps every real seed cleanup delete explicitly scoped", () => {
    const mutationPath = resolve(
      process.cwd(),
      "prisma/demo-seed-mutation.ts"
    );
    const source = readFileSync(mutationPath, "utf8");
    const sourceFile = ts.createSourceFile(
      mutationPath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
    const violations: string[] = [];

    function visit(node: ts.Node) {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "deleteMany"
      ) {
        const argument = node.arguments[0];
        const hasWhere =
          argument &&
          ts.isObjectLiteralExpression(argument) &&
          argument.properties.some(
            (property) =>
              ts.isPropertyAssignment(property) &&
              ((ts.isIdentifier(property.name) &&
                property.name.text === "where") ||
                (ts.isStringLiteral(property.name) &&
                  property.name.text === "where"))
          );

        if (!hasWhere) {
          const position = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(sourceFile)
          );
          violations.push(`${position.line + 1}:${position.character + 1}`);
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    expect(violations).toEqual([]);
  });

  it("rolls back demo writes after a forced mid-seed failure and preserves foreign rows", async () => {
    const foreignWorkspace = { id: "foreign-workspace", name: "Foreign tenant" };
    const testHost = transactionHost(
      new Map([[foreignWorkspace.id, foreignWorkspace]])
    );
    let receivedTransaction: Prisma.TransactionClient | null = null;

    await expect(
      runPreparedDemoSeed(
        TEST_ENV,
        testHost.host,
        async (prepared, transaction) => {
          receivedTransaction = transaction;
          await transaction.workspace.upsert({
            where: { id: prepared.ids.workspace },
            create: {
              id: prepared.ids.workspace,
              name: prepared.names.workspace
            },
            update: {}
          });
          throw new Error("forced mid-seed failure");
        }
      )
    ).rejects.toThrow("forced mid-seed failure");

    expect(receivedTransaction).toBe(testHost.getTransactionClient());
    expect(Array.from(testHost.getState().values())).toEqual([foreignWorkspace]);
  });

  it("commits through the transaction client supplied by the host", async () => {
    const testHost = transactionHost(new Map());

    await runPreparedDemoSeed(
      TEST_ENV,
      testHost.host,
      async (prepared, transaction) => {
        await transaction.workspace.upsert({
          where: { id: prepared.ids.workspace },
          create: {
            id: prepared.ids.workspace,
            name: prepared.names.workspace
          },
          update: {}
        });
      }
    );

    expect(testHost.getState().get("demo-workspace")).toEqual({
      id: "demo-workspace",
      name: "Демо Контроль качества"
    });
    expect(testHost.getTransactionOptions()).toEqual({
      maxWait: 10_000,
      timeout: 60_000
    });
  });
});
