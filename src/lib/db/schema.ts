import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const entries = sqliteTable("entries", {
  id: integer("id").primaryKey(),
  agency: text("agency").notNull(),
  organization: text("organization"),
  first_name: text("first_name"),
  middle_name: text("middle_name"),
  last_name: text("last_name"),
  request_date: text("request_date"),
  completion_date: text("completion_date"),
  entry_date: text("entry_date"),
  fee: text("fee"),
  is_amended: integer("is_amended"),
  subject: text("subject"),
  details: text("details"),
  resolution: text("resolution"),
  response: text("response")
});
