CREATE TABLE "entries" (
  "id" INTEGER NOT NULL UNIQUE,
  "agency" TEXT NOT NULL,
  "organization" TEXT,
  "first_name" TEXT,
  "middle_name" TEXT,
  "last_name" TEXT,
  "request_date" TEXT NOT NULL,
  "completion_date" TEXT,
  "entry_date" TEXT,
  "fee" TEXT,
  "is_amended" INTEGER NOT NULL,
  "subject" TEXT,
  "details" TEXT,
  "resolution" TEXT,
  "response" TEXT,
  PRIMARY KEY("id")
);