/**
 * Расчёт готовности по дереву задач.
 *
 * Готовность листа — доля выполненного объёма. Готовность узла — взвешенная
 * сумма готовностей детей.
 *
 * Вес соседей берётся по первому подходящему правилу:
 *   1. `weight` — если проставлен у всех. Так задают этапы: навеска щита 15 %,
 *      расключение 85 %.
 *   2. `amount` — сумма позиции по КП. Это правило листа КП
 *      (`=КП!F9/КП!$F$29`): дороже позиция — больше её вклад в готовность.
 *   3. плановый объём;
 *   4. поровну.
 *
 * Ничего не хранится в БД: дерево одного объекта — сотня строк, пересчёт
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
  /** Сумма позиции по КП. Не задана — вес считается по объёму. */
  amount?: unknown;
  /** Цена за единицу по КП — для заработанного на выполненном объёме. */
  unitPrice?: unknown;
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
  /** Доля этой строки в готовности всего объекта, 0..1. */
  absShare: number;
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

function isSet(value: unknown): boolean {
  return value !== null && value !== undefined;
}

/** Нормирует набор чисел в доли. null — если правило неприменимо. */
function normalize(values: number[]): number[] | null {
  const sum = values.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return null;
  return values.map((v) => v / sum);
}

/**
 * Доли соседей: явные веса → деньги КП → плановый объём → поровну.
 * Сумма долей всегда 1 (при непустом списке).
 */
function sharesOf<T extends TaskNodeInput>(siblings: T[]): number[] {
  if (siblings.length === 0) return [];

  if (siblings.every((t) => isSet(t.weight))) {
    const byWeight = normalize(siblings.map((t) => toNumber(t.weight)));
    if (byWeight) return byWeight;
  }

  if (siblings.every((t) => isSet(t.amount))) {
    const byMoney = normalize(siblings.map((t) => toNumber(t.amount)));
    if (byMoney) return byMoney;
  }

  const byVolume = normalize(siblings.map((t) => toNumber(t.volume)));
  if (byVolume) return byVolume;

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

  const build = (parentId: string | null, depth: number, parentShare: number): TaskNode<T>[] => {
    const siblings = byParent.get(parentId) ?? [];
    const shares = sharesOf(siblings);

    return siblings.map((task, i) => {
      const absShare = parentShare * shares[i];
      const children = build(task.id, depth + 1, absShare);
      const node: TaskNode<T> = {
        task,
        children,
        depth,
        share: shares[i],
        absShare,
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

  return build(null, 0, 1);
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
