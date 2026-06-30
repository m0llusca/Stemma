import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    coachingPlan: {
      create: vi.fn(),
      updateMany: vi.fn()
    },
    trainingAssignment: {
      updateMany: vi.fn()
    }
  };

  return {
    auditLog: vi.fn(),
    canManageTraining: vi.fn(),
    getCurrentUser: vi.fn(),
    revalidatePath: vi.fn(),
    prisma: {
      $transaction: vi.fn(),
      coachingPlan: {
        findFirst: vi.fn()
      }
    },
    tx
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath
}));

vi.mock("@/lib/audit", () => ({
  auditLog: mocks.auditLog
}));

vi.mock("@/lib/current-user", () => ({
  canManageTraining: mocks.canManageTraining,
  getCurrentUser: mocks.getCurrentUser
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

function managerUser() {
  return {
    id: "manager-1",
    workspaceId: "workspace-1",
    role: "TEAM_LEAD",
    name: "Тимлид"
  };
}

describe("coaching plan actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.getCurrentUser.mockResolvedValue(managerUser());
    mocks.canManageTraining.mockReturnValue(true);
    mocks.prisma.coachingPlan.findFirst.mockResolvedValue({ id: "plan-1" });
    mocks.tx.coachingPlan.create.mockResolvedValue({ id: "plan-1" });
    mocks.tx.coachingPlan.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.trainingAssignment.updateMany.mockResolvedValue({ count: 1 });
    mocks.auditLog.mockResolvedValue({});
  });

  describe("createCoachingPlan", () => {
    it("persists a workspace-scoped plan and audits it", async () => {
      const { createCoachingPlan } = await import("@/lib/coaching-plan-actions");
      const formData = new FormData();
      formData.set("agentName", "Оператор");
      formData.set("title", "Работа с возражениями");
      formData.set("focusArea", "Возражения");

      await createCoachingPlan(formData);

      expect(mocks.tx.coachingPlan.create).toHaveBeenCalledWith({
        data: {
          workspaceId: "workspace-1",
          agentName: "Оператор",
          title: "Работа с возражениями",
          focusArea: "Возражения",
          createdById: "manager-1"
        }
      });
      expect(mocks.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "coaching.plan_created", targetId: "plan-1" }),
        mocks.tx
      );
      expect(mocks.revalidatePath).toHaveBeenCalledWith("/coaching");
    });

    it("stores a null focus area when omitted", async () => {
      const { createCoachingPlan } = await import("@/lib/coaching-plan-actions");
      const formData = new FormData();
      formData.set("agentName", "Оператор");
      formData.set("title", "Тон общения");

      await createCoachingPlan(formData);

      expect(mocks.tx.coachingPlan.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ focusArea: null }) })
      );
    });

    it("rejects creation without manager rights", async () => {
      mocks.canManageTraining.mockReturnValue(false);
      const { createCoachingPlan } = await import("@/lib/coaching-plan-actions");
      const formData = new FormData();
      formData.set("agentName", "Оператор");
      formData.set("title", "План");

      await expect(createCoachingPlan(formData)).rejects.toThrow("Нет прав");
      expect(mocks.tx.coachingPlan.create).not.toHaveBeenCalled();
    });

    it("requires both agent and title", async () => {
      const { createCoachingPlan } = await import("@/lib/coaching-plan-actions");
      const formData = new FormData();
      formData.set("agentName", "Оператор");

      await expect(createCoachingPlan(formData)).rejects.toThrow("Нужны оператор и название");
      expect(mocks.tx.coachingPlan.create).not.toHaveBeenCalled();
    });
  });

  describe("updateCoachingPlanStatus", () => {
    it("completes a plan scoped to the caller's workspace", async () => {
      const { updateCoachingPlanStatus } = await import("@/lib/coaching-plan-actions");
      const formData = new FormData();
      formData.set("id", "plan-1");
      formData.set("status", "completed");

      await updateCoachingPlanStatus(formData);

      expect(mocks.tx.coachingPlan.updateMany).toHaveBeenCalledWith({
        where: { id: "plan-1", workspaceId: "workspace-1" },
        data: { status: "completed" }
      });
      expect(mocks.auditLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: "coaching.plan_status_updated" }),
        mocks.tx
      );
    });

    it("rejects an invalid status", async () => {
      const { updateCoachingPlanStatus } = await import("@/lib/coaching-plan-actions");
      const formData = new FormData();
      formData.set("id", "plan-1");
      formData.set("status", "done");

      await expect(updateCoachingPlanStatus(formData)).rejects.toThrow("Некорректный статус");
      expect(mocks.tx.coachingPlan.updateMany).not.toHaveBeenCalled();
    });

    it("requires manager rights", async () => {
      mocks.canManageTraining.mockReturnValue(false);
      const { updateCoachingPlanStatus } = await import("@/lib/coaching-plan-actions");
      const formData = new FormData();
      formData.set("id", "plan-1");
      formData.set("status", "completed");

      await expect(updateCoachingPlanStatus(formData)).rejects.toThrow("Нет прав");
    });
  });

  describe("addAssignmentToPlan", () => {
    it("links an assignment to a workspace plan", async () => {
      const { addAssignmentToPlan } = await import("@/lib/coaching-plan-actions");
      const formData = new FormData();
      formData.set("assignmentId", "assignment-1");
      formData.set("coachingPlanId", "plan-1");

      await addAssignmentToPlan(formData);

      expect(mocks.prisma.coachingPlan.findFirst).toHaveBeenCalledWith({
        where: { id: "plan-1", workspaceId: "workspace-1" },
        select: { id: true }
      });
      expect(mocks.tx.trainingAssignment.updateMany).toHaveBeenCalledWith({
        where: { id: "assignment-1", workspaceId: "workspace-1" },
        data: { coachingPlanId: "plan-1" }
      });
    });

    it("detaches an assignment when no plan is given", async () => {
      const { addAssignmentToPlan } = await import("@/lib/coaching-plan-actions");
      const formData = new FormData();
      formData.set("assignmentId", "assignment-1");

      await addAssignmentToPlan(formData);

      expect(mocks.prisma.coachingPlan.findFirst).not.toHaveBeenCalled();
      expect(mocks.tx.trainingAssignment.updateMany).toHaveBeenCalledWith({
        where: { id: "assignment-1", workspaceId: "workspace-1" },
        data: { coachingPlanId: null }
      });
    });

    it("rejects a plan from another workspace", async () => {
      mocks.prisma.coachingPlan.findFirst.mockResolvedValue(null);
      const { addAssignmentToPlan } = await import("@/lib/coaching-plan-actions");
      const formData = new FormData();
      formData.set("assignmentId", "assignment-1");
      formData.set("coachingPlanId", "foreign-plan");

      await expect(addAssignmentToPlan(formData)).rejects.toThrow("План коучинга не найден");
      expect(mocks.tx.trainingAssignment.updateMany).not.toHaveBeenCalled();
    });
  });

  describe("createCoachingPlanState", () => {
    it("returns a success toast on persistence", async () => {
      const { createCoachingPlanState } = await import("@/lib/coaching-plan-actions");
      const formData = new FormData();
      formData.set("agentName", "Оператор");
      formData.set("title", "План");

      const result = await createCoachingPlanState(null, formData);

      expect(result).toMatchObject({ ok: true, toast: "План коучинга создан." });
    });

    it("returns the thrown error message on failure", async () => {
      mocks.canManageTraining.mockReturnValue(false);
      const { createCoachingPlanState } = await import("@/lib/coaching-plan-actions");
      const formData = new FormData();
      formData.set("agentName", "Оператор");
      formData.set("title", "План");

      const result = await createCoachingPlanState(null, formData);

      expect(result).toMatchObject({ ok: false });
      expect(result && "message" in result && result.message).toContain("Нет прав");
    });
  });
});
