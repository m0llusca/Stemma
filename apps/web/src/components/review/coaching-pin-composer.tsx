"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { createCoachingPin } from "@/lib/coaching-pin-actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Сохранение…" : "Сохранить заметку"}
    </Button>
  );
}

export function CoachingPinComposer({ conversationId, messageId }: { conversationId: string; messageId: string }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="coaching-pin-add"
        onClick={() => setOpen(true)}
      >
        + Заметка к сообщению
      </Button>
    );
  }

  return (
    <form
      ref={formRef}
      className="coaching-pin-composer flex flex-col gap-2"
      action={async (formData) => {
        await createCoachingPin(formData);
        formRef.current?.reset();
        setOpen(false);
      }}
    >
      <input type="hidden" name="conversationId" value={conversationId} />
      <input type="hidden" name="messageId" value={messageId} />
      <Field>
        <FieldLabel className="sr-only" htmlFor={`coaching-pin-body-${messageId}`}>
          Заметка к сообщению
        </FieldLabel>
        <Textarea
          id={`coaching-pin-body-${messageId}`}
          name="body"
          className="coaching-pin-composer__input min-h-16 text-sm"
          rows={2}
          maxLength={2000}
          required
          autoFocus
          placeholder="Что обсудить по этому сообщению на калибровке?"
        />
      </Field>
      <div className="coaching-pin-composer__actions flex flex-wrap items-center gap-2">
        <SubmitButton />
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
