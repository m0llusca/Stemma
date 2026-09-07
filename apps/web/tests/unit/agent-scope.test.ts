import { describe, expect, it } from "vitest";
import { agentConversationWhere, assertAgentOwnsAssignee } from "@/lib/agent-scope";

describe("agentConversationWhere", () => {
  it("scopes SUPPORT_AGENT by assigneeId", () => {
    expect(agentConversationWhere({ id: "u1", role: "SUPPORT_AGENT" })).toEqual({
      assigneeId: "u1"
    });
  });

  it("does not scope managers or other roles", () => {
    expect(agentConversationWhere({ id: "u1", role: "QA_ANALYST" })).toEqual({});
    expect(agentConversationWhere({ id: "u1", role: "TEAM_LEAD" })).toEqual({});
    expect(agentConversationWhere({ id: "u1", role: "ADMIN" })).toEqual({});
  });
});

describe("assertAgentOwnsAssignee", () => {
  it("throws when SUPPORT_AGENT reads another assignee", () => {
    expect(() =>
      assertAgentOwnsAssignee({ id: "u1", role: "SUPPORT_AGENT" }, { assigneeId: "other" })
    ).toThrow(/чужого|доступ/i);
  });

  it("throws when SUPPORT_AGENT and assigneeId is null", () => {
    expect(() =>
      assertAgentOwnsAssignee({ id: "u1", role: "SUPPORT_AGENT" }, { assigneeId: null })
    ).toThrow();
  });

  it("allows SUPPORT_AGENT when assigneeId matches", () => {
    expect(() =>
      assertAgentOwnsAssignee({ id: "u1", role: "SUPPORT_AGENT" }, { assigneeId: "u1" })
    ).not.toThrow();
  });

  it("is a no-op for non-agent roles even with null assignee", () => {
    expect(() =>
      assertAgentOwnsAssignee({ id: "u1", role: "QA_ANALYST" }, { assigneeId: null })
    ).not.toThrow();
    expect(() =>
      assertAgentOwnsAssignee({ id: "u1", role: "TEAM_LEAD" }, { assigneeId: "other" })
    ).not.toThrow();
  });
});
