/**
 * Состояние блоков работ: что можно выдавать монтажникам прямо сейчас.
 *
 * Блок доступен, когда его предшественники набрали нужный порог готовности.
 * Порог по умолчанию 100 %, но его снижают, чтобы вести работы параллельно:
 * при 60 % маркировку можно начинать, не дожидаясь последнего метра кабеля.
 *
 * Причина блокировки заполняется вручную (нет материалов, нет доступа, не
 * готова стройка) и перебивает расчёт: такой блок красный, даже если все
 * предшественники закрыты.
 */

import type { TaskNode, TaskNodeInput } from "@/lib/task-progress";
import { flattenTree } from "@/lib/task-progress";

export type BlockState = "DONE" | "BLOCKED" | "AVAILABLE" | "WAITING";

export const BLOCK_STATE_LABEL: Record<BlockState, string> = {
  DONE: "Выполнен",
  BLOCKED: "Заблокирован",
  AVAILABLE: "Доступен",
  WAITING: "Ожидает предшественников",
};

export type WorkBlockInput = {
  id: string;
  code: string;
  name: string;
  kpPositions: string | null;
  sortOrder: number;
  threshold: unknown;
  blockReason: string | null;
  customerNote: string | null;
};

export type BlockStatus<B extends WorkBlockInput> = {
  block: B;
  state: BlockState;
  /** Готовность блока 0..1 — по задачам, привязанным к нему. */
  progress: number;
  /** Готовность предшественников 0..1. Без предшественников — 1. */
  predecessorProgress: number;
  /** Порог, при котором блок открывается, 0..1. */
  threshold: number;
  /** Коды предшественников, из-за которых блок ещё ждёт. */
  blockedBy: string[];
};

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Готовность каждого блока по дереву задач.
 *
 * Строки взвешиваются своей долей в объекте (`absShare`), поэтому блок,
 * собранный из разных веток дерева — навеска щитов ПВ1 и ПВ2 лежат под
 * разными родителями — считается корректно.
 *
 * Учитываются только листья: у контейнера и его детей доли пересекаются, и
 * сложение тех и других завысило бы вклад ветки вдвое.
 */
export function blockProgressByTasks<T extends TaskNodeInput & { blockId?: string | null }>(
  roots: TaskNode<T>[]
): Map<string, number> {
  const weighted = new Map<string, { done: number; total: number }>();

  for (const node of flattenTree(roots)) {
    if (node.children.length > 0) continue;
    const blockId = node.task.blockId;
    if (!blockId) continue;

    const acc = weighted.get(blockId) ?? { done: 0, total: 0 };
    acc.done += node.absShare * node.progress;
    acc.total += node.absShare;
    weighted.set(blockId, acc);
  }

  const out = new Map<string, number>();
  for (const [blockId, { done, total }] of weighted) {
    out.set(blockId, total > 0 ? done / total : 0);
  }
  return out;
}

/**
 * Состояние всех блоков объекта.
 *
 * `dependencies` — рёбра «блок ждёт предшественника». Готовность
 * предшественников усредняется по их числу: как в листе «Зависимости», где
 * несколько предшественников дают одну долю на всех.
 */
export function computeBlockStates<B extends WorkBlockInput>(
  blocks: B[],
  dependencies: { blockId: string; predecessorId: string }[],
  progressByBlock: Map<string, number>
): BlockStatus<B>[] {
  const predecessorsOf = new Map<string, string[]>();
  for (const dep of dependencies) {
    const list = predecessorsOf.get(dep.blockId);
    if (list) list.push(dep.predecessorId);
    else predecessorsOf.set(dep.blockId, [dep.predecessorId]);
  }

  const codeById = new Map(blocks.map((b) => [b.id, b.code]));

  return blocks.map((block) => {
    const progress = progressByBlock.get(block.id) ?? 0;
    const predecessors = predecessorsOf.get(block.id) ?? [];

    const predecessorProgress =
      predecessors.length === 0
        ? 1
        : predecessors.reduce((sum, id) => sum + (progressByBlock.get(id) ?? 0), 0) /
          predecessors.length;

    // Порог 0 означал бы «открыт всегда» — в КП его задают как долю, и
    // отсутствующее значение читается как 100 %, а не как «без ограничений».
    const raw = toNumber(block.threshold);
    const threshold = raw > 0 ? Math.min(raw, 1) : 1;

    const blockedBy = predecessors
      .filter((id) => (progressByBlock.get(id) ?? 0) < threshold)
      .map((id) => codeById.get(id) ?? id)
      .sort((a, b) => a.localeCompare(b, "ru", { numeric: true }));

    let state: BlockState;
    if (progress >= 1) {
      state = "DONE";
    } else if (block.blockReason && block.blockReason.trim().length > 0) {
      state = "BLOCKED";
    } else if (predecessorProgress >= threshold) {
      state = "AVAILABLE";
    } else {
      state = "WAITING";
    }

    return { block, state, progress, predecessorProgress, threshold, blockedBy };
  });
}

/**
 * Проверка, что граф очерёдности не содержит цикла: иначе блоки навсегда
 * ждут друг друга, а расчёт состояний молча вернёт «Ожидает» для всех.
 * Возвращает коды блоков, попавших в цикл.
 */
export function findDependencyCycle<B extends WorkBlockInput>(
  blocks: B[],
  dependencies: { blockId: string; predecessorId: string }[]
): string[] {
  const edges = new Map<string, string[]>();
  for (const dep of dependencies) {
    const list = edges.get(dep.blockId);
    if (list) list.push(dep.predecessorId);
    else edges.set(dep.blockId, [dep.predecessorId]);
  }

  const VISITING = 1;
  const DONE = 2;
  const marks = new Map<string, number>();
  const stack: string[] = [];
  const codeById = new Map(blocks.map((b) => [b.id, b.code]));

  const walk = (id: string): string[] | null => {
    const mark = marks.get(id);
    if (mark === DONE) return null;
    if (mark === VISITING) {
      const from = stack.indexOf(id);
      return stack.slice(from >= 0 ? from : 0).map((x) => codeById.get(x) ?? x);
    }

    marks.set(id, VISITING);
    stack.push(id);
    for (const next of edges.get(id) ?? []) {
      const cycle = walk(next);
      if (cycle) return cycle;
    }
    stack.pop();
    marks.set(id, DONE);
    return null;
  };

  for (const block of blocks) {
    const cycle = walk(block.id);
    if (cycle) return cycle;
  }
  return [];
}
