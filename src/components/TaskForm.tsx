"use client";

import { useActionState, useState } from "react";
import { createTaskAction } from "@/app/actions/tasks";

export type OperationOption = {
  id: string;
  name: string;
  /** Единица измерения работ операции: м, м², шт, компл. */
  unit: string;
  /** Норма трудозатрат, чел.-ч на единицу; null, если не задана. */
  laborNorm: string | null;
};

export default function TaskForm({
  subProjectId,
  operations,
}: {
  subProjectId: string;
  operations: OperationOption[];
}) {
  const [state, formAction, pending] = useActionState(createTaskAction, {});
  const [operationId, setOperationId] = useState("");
  const [volume, setVolume] = useState("1");

  const operation = operations.find((o) => o.id === operationId);
  const unit = operation?.unit ?? "ед.";
  const plannedLabor =
    operation?.laborNorm && Number(volume) > 0
      ? (Number(operation.laborNorm) * Number(volume)).toFixed(2)
      : null;

  return (
    <form action={formAction}>
      {state.error && <div className="error-banner">{state.error}</div>}
      <input type="hidden" name="subProjectId" value={subProjectId} />

      <div className="field">
        <label htmlFor="operationId">Операция</label>
        <select
          id="operationId"
          name="operationId"
          required
          value={operationId}
          onChange={(e) => setOperationId(e.target.value)}
        >
          <option value="" disabled>
            Выберите операцию
          </option>
          {operations.map((op) => (
            <option key={op.id} value={op.id}>
              {op.name} ({op.unit})
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="title">Название задачи</label>
        <input id="title" name="title" required />
      </div>

      <div className="field">
        <label htmlFor="volume">Объём работ, {unit}</label>
        <input
          id="volume"
          name="volume"
          type="number"
          step="0.001"
          min="0.001"
          required
          value={volume}
          onChange={(e) => setVolume(e.target.value)}
        />
        <p className="hint">
          {operation
            ? `Материалы спишутся по норме техкарты × ${volume || 0} ${unit}.`
            : "Выберите операцию — объём задаётся в её единицах."}
          {plannedLabor && ` Плановые трудозатраты: ${plannedLabor} чел.-ч.`}
        </p>
      </div>

      <div className="field">
        <label htmlFor="description">Описание (необязательно)</label>
        <textarea id="description" name="description" />
      </div>

      <button type="submit" disabled={pending}>
        {pending ? "Сохраняем..." : "Создать задачу"}
      </button>
    </form>
  );
}
