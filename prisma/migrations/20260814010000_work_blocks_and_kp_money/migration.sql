-- Деньги из КП на задаче. Вес позиции в готовности объекта = amount / ИТОГО,
-- как в формуле листа КП (=КП!F9/КП!$F$29).
ALTER TABLE "tasks" ADD COLUMN "unitPrice" DECIMAL(12,2);
ALTER TABLE "tasks" ADD COLUMN "amount" DECIMAL(12,2);

-- Блоки работ: единица очерёдности, выдаваемая монтажникам.
CREATE TABLE "work_blocks" (
  "id"           TEXT NOT NULL PRIMARY KEY,
  "siteId"       TEXT NOT NULL,
  "code"         TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "kpPositions"  TEXT,
  "sortOrder"    INTEGER NOT NULL DEFAULT 0,
  "threshold"    DECIMAL(4,3) NOT NULL DEFAULT 1,
  "blockReason"  TEXT,
  "customerNote" TEXT,
  CONSTRAINT "work_blocks_siteId_fkey"
    FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "work_blocks_siteId_code_key" ON "work_blocks"("siteId", "code");
CREATE INDEX "work_blocks_siteId_idx" ON "work_blocks"("siteId");

-- Граф очерёдности: блок ждёт своих предшественников.
CREATE TABLE "work_block_dependencies" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "blockId"       TEXT NOT NULL,
  "predecessorId" TEXT NOT NULL,
  CONSTRAINT "work_block_dependencies_blockId_fkey"
    FOREIGN KEY ("blockId") REFERENCES "work_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "work_block_dependencies_predecessorId_fkey"
    FOREIGN KEY ("predecessorId") REFERENCES "work_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "work_block_dependencies_blockId_predecessorId_key"
  ON "work_block_dependencies"("blockId", "predecessorId");
CREATE INDEX "work_block_dependencies_predecessorId_idx"
  ON "work_block_dependencies"("predecessorId");

-- Привязка строки задачи к блоку. Соседи по дереву могут лежать в разных
-- блоках: навеска щита в одном, расключение — в другом.
ALTER TABLE "tasks" ADD COLUMN "blockId" TEXT;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_blockId_fkey"
  FOREIGN KEY ("blockId") REFERENCES "work_blocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "tasks_blockId_idx" ON "tasks"("blockId");
