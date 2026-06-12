"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createCoachingPin } from "@/lib/coaching-pin-actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="action-button action-button--primary action-button--small" disabled={pending}>
      {pending ? "Сохранение…" : "Сохранить заметку"}
    </button>
  );
}

export function CoachingPinComposer({ conversationId, messageId }: { conversationId: string; messageId: string }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button type="button" className="action-button action-button--small coaching-pin-add" onClick={() => setOpen(true)}>
        + Заметка коучинга
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      className="coaching-pin-composer"
      action={async (formData) => {
        await createCoachingPin(formData);
        formRef.current?.reset();
        setOpen(false);
      }}
    >
      <input type="hidden" name="conversationId" value={conversationId} />
      <input type="hidden" name="messageId" value={messageId} />
      <textarea
        name="body"
        className="form-control text-sm coaching-pin-composer__input"
        rows={2}
        maxLength={2000}
        required
        autoFocus
        placeholder="Что подсветить оператору в этом сообщении?"
      />
      <div className="coaching-pin-composer__actions">
        <SubmitButton />
        <button type="button" className="action-button action-button--small" onClick={() => setOpen(false)}>
          Отмена
        </button>
      </div>
    </form>
  );
}
