"use client";

export function EvidenceMessageButton({ messageId }: { messageId: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(new CustomEvent("review:evidence-message-selected", { detail: { messageId } }));
      }}
      className="rounded-md border border-[#d9e0ea] bg-white px-2 py-1 text-xs font-semibold text-[#1d3fae] hover:bg-[#edf2ff]"
    >
      В доказательство
    </button>
  );
}
