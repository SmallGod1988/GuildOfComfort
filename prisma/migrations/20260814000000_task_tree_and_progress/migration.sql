-- Иерархия задач: раздел → задача → подзадача → под-подзадача.
-- Существующие задачи остаются корневыми (parentId = NULL) и ведут себя как прежде.
ALTER TABLE "tasks" ADD COLUMN "parentId" TEXT;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "tasks_parentId_idx" ON "tasks"("parentId");
CREATE INDEX "tasks_subProjectId_idx" ON "tasks"("subProjectId");

-- Номер строки из КП, порядок вывода, признак раздела-заголовка.
ALTER TABLE "tasks" ADD COLUMN "code" TEXT;
ALTER TABLE "tasks" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tasks" ADD COLUMN "isSection" BOOLEAN NOT NULL DEFAULT false;

-- Вес строки в готовности родителя (%) и фактически выполненный объём.
ALTER TABLE "tasks" ADD COLUMN "weight" DECIMAL(7,4);
ALTER TABLE "tasks" ADD COLUMN "volumeFact" DECIMAL(12,3) NOT NULL DEFAULT 0;

-- Своя единица измерения (когда операции нет), система и гибкая задача.
ALTER TABLE "tasks" ADD COLUMN "unit" TEXT;
ALTER TABLE "tasks" ADD COLUMN "system" TEXT;
ALTER TABLE "tasks" ADD COLUMN "isFlexible" BOOLEAN NOT NULL DEFAULT false;

-- Контроль ОТК: кто принял работу.
ALTER TABLE "tasks" ADD COLUMN "reviewedById" TEXT;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Операция становится необязательной: у разделов и задач-контейнеров её нет.
-- Существующие строки уже заполнены, данные не теряются.
ALTER TABLE "tasks" ALTER COLUMN "operationId" DROP NOT NULL;
