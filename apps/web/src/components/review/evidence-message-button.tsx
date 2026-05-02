"use client";

export function EvidenceMessageButton({ messageId }: { messageId: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("review:evidence-message-selected", { detail: { messageId } }));
      }}
      className="rounded border border-[#d7dce5] bg-white px-2 py-1 text-xs font-semibold text-[#0b4f52] hover:bg-[#eef4f4]"
    >
      В доказательство
    </button>
  );
}
