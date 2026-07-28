"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";

type ActionState = { error?: string };

export default function ActionForm({
  action,
  children,
  submitLabel = "Сохранить",
  className,
  buttonClassName,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  children?: ReactNode;
  submitLabel?: string;
  className?: string;
  buttonClassName?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      {state.error && <div className="error-banner">{state.error}</div>}
      {children}
      <button type="submit" className={buttonClassName} disabled={pending}>
        {pending ? "Сохраняем..." : submitLabel}
      </button>
    </form>
  );
}
