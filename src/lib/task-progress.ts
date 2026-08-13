/**
 * Расчёт готовности по дереву задач.
 *
 * Готовность листа — доля выполненного объёма. Готовность узла — взвешенная
 * сумма готовностей детей. Вес берётся из `weight` (проценты, заданные в КП);
 * если он не проставлен — распределяется пропорционально плановому объёму,
 * а при нулевых объёмах — поровну.
 *
 * Ничего не хранится в БД: дерево одного объекта — десятки строк, пересчёт
 * дешевле, чем поддержание денормализованного поля в согласованном виде.
 */

/** Минимум полей задачи, нужный для расчёта. */
export type TaskNodeInput = {
  id: string;
  parentId: string | null;
  sortOrder: number;
  code: string | null;
  isSection: boolean;
  status: string;
  /** Decimal из Prisma приходит объектом — принимаем всё, что приводится к числу. */
  volume: unknown;
  volumeFact: unknown;
  weight: unknown;
};

export type TaskNode<T extends TaskNodeInput> = {
  task: T;
  children: TaskNode<T>[];
  /** Глубина: 0 у корневых строк. */
  depth: number;
  /** Готовность 0..1. */
  progress: number;
  /** Доля этой строки в готовности родителя, 0..1. */
  share: number;
  /** План и факт: у листа — свои, у контейнера — сумма по детям. */
  volumePlan: number;
  volumeFact: number;
};

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/**
 * Доли соседей по правилам КП: явные веса, иначе плановый объём, иначе поровну.
 * Сумма долей всегда 1 (при непустом списке).
 */
function sharesOf<T extends TaskNodeInput>(siblings: T[]): number[] {
  if (siblings.length === 0) return [];

  const weights = siblings.map((t) => toNumber(t.weight));
  const allWeighted = siblings.every((t) => t.weight !== null && t.weight !== undefined);
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (allWeighted && weightSum > 0) {
    return weights.map((w) => w / weightSum);
  }

  const volumes = siblings.map((t) => toNumber(t.volume));
  const volumeSum = volumes.reduce((a, b) => a + b, 0);
  if (volumeSum > 0) {
    return volumes.map((v) => v / volumeSum);
  }

  return siblings.map(() => 1 / siblings.length);
}

/**
 * Собирает плоский список задач в дерево и считает готовность каждого узла.
 * Строки, чей родитель отсутствует в списке, становятся корневыми — так срез
 * по одному разделу тоже считается.
 */
export function buildTaskTree<T extends TaskNodeInput>(tasks: T[]): TaskNode<T>[] {
  const byParent = new Map<string | null, T[]>();
  const known = new Set(tasks.map((t) => t.id));

  for (const task of tasks) {
    const key = task.parentId && known.has(task.parentId) ? task.parentId : null;
    const bucket = byParent.get(key);
    if (bucket) bucket.push(task);
    else byParent.set(key, [task]);
  }

  for (const bucket of byParent.values()) {
    bucket.sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return (a.code ?? "").localeCompare(b.code ?? "", "ru", { numeric: true });
    });
  }

  const build = (parentId: string | null, depth: number): TaskNode<T>[] => {
    const siblings = byParent.get(parentId) ?? [];
    const shares = sharesOf(siblings);

    return siblings.map((task, i) => {
      const children = build(task.id, depth + 1);
      const node: TaskNode<T> = {
        task,
        children,
        depth,
        share: shares[i],
        progress: 0,
        volumePlan: toNumber(task.volume),
        volumeFact: toNumber(task.volumeFact),
      };

      if (children.length > 0) {
        node.progress = children.reduce((sum, c) => sum + c.share * c.progress, 0);
        // План контейнера остаётся плановым из КП, если он задан явно;
        // факт всегда собирается снизу — вручную его никто не вводит.
        const childPlan = children.reduce((sum, c) => sum + c.volumePlan, 0);
        if (node.volumePlan <= 0) node.volumePlan = childPlan;
        node.volumeFact = children.reduce((sum, c) => sum + c.volumeFact, 0);
      } else if (task.isSection) {
        // Пустой раздел ничего не весит.
        node.progress = 0;
      } else if (task.status === "DONE") {
        // Штучная работа без учёта объёма закрывается статусом.
        node.progress = 1;
      } else if (node.volumePlan > 0) {
        node.progress = clamp01(node.volumeFact / node.volumePlan);
      }

      return node;
    });
  };

  return build(null, 0);
}

/** Готовность по всему списку — то же правило, что и внутри узла. */
export function totalProgress<T extends TaskNodeInput>(roots: TaskNode<T>[]): number {
  return roots.reduce((sum, node) => sum + node.share * node.progress, 0);
}

/** Дерево в плоский список сверху вниз — для отрисовки таблицы. */
export function flattenTree<T extends TaskNodeInput>(nodes: TaskNode<T>[]): TaskNode<T>[] {
  const out: TaskNode<T>[] = [];
  const walk = (list: TaskNode<T>[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

/** «0,0 %» — как в листе КП. */
export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1).replace(".", ",")} %`;
}
