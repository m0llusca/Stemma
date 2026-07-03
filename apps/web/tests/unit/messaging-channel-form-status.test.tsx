import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessagingChannelForm } from "@/components/admin/messaging-channel-form";

vi.mock("@/lib/messaging-actions", () => ({
  saveMessagingChannel: vi.fn()
}));

function renderForm(status: string) {
  return render(
    <MessagingChannelForm
      kind="telegram"
      displayName="Telegram"
      status={status}
      maskedWebhook={null}
      hasSecret={false}
    />
  );
}

describe("messaging channel form status control", () => {
  it("does not render an activation checkbox — the page footer toggle owns activation", () => {
    const { container } = renderForm("active");

    expect(container.querySelector('input[type="checkbox"][name="status"]')).toBeNull();
  });

  it("passes the current status through a hidden field so saving does not change it", () => {
    const active = renderForm("active");
    const activeHidden = active.container.querySelector('input[type="hidden"][name="status"]') as HTMLInputElement | null;

    expect(activeHidden).not.toBeNull();
    expect(activeHidden?.value).toBe("active");

    active.unmount();

    const draft = renderForm("draft");
    const draftHidden = draft.container.querySelector('input[type="hidden"][name="status"]') as HTMLInputElement | null;

    expect(draftHidden?.value).toBe("draft");
  });

  it("keeps the submit button enabled (pending-only disable pattern)", () => {
    const { container } = renderForm("draft");
    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement | null;

    expect(submit).not.toBeNull();
    expect(submit?.disabled).toBe(false);
  });
});
