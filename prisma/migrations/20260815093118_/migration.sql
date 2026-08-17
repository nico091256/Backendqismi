-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Problem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ticketNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'Texnik muammo',
    "lastName" TEXT NOT NULL DEFAULT '',
    "firstName" TEXT NOT NULL DEFAULT '',
    "middleName" TEXT NOT NULL DEFAULT '',
    "position" TEXT NOT NULL DEFAULT '',
    "objectName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "room" TEXT,
    "computer" TEXT,
    "description" TEXT,
    "requestedItem" TEXT,
    "quantity" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Problem" ("computer", "createdAt", "description", "firstName", "id", "lastName", "middleName", "objectName", "phone", "position", "quantity", "requestedItem", "resolvedAt", "room", "status", "ticketNumber", "type", "updatedAt") SELECT "computer", "createdAt", "description", "firstName", "id", "lastName", "middleName", "objectName", "phone", "position", "quantity", "requestedItem", "resolvedAt", "room", "status", "ticketNumber", "type", "updatedAt" FROM "Problem";
DROP TABLE "Problem";
ALTER TABLE "new_Problem" RENAME TO "Problem";
CREATE UNIQUE INDEX "Problem_ticketNumber_key" ON "Problem"("ticketNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
