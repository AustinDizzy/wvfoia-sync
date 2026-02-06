CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
  first_name,
  middle_name,
  last_name,
  organization,
  agency,
  subject,
  details,
  response,
  content='entries',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 1'
);

CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts_vocab USING fts5vocab(entries_fts, 'row');

CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
  INSERT INTO entries_fts(rowid, first_name, middle_name, last_name, organization, agency, subject, details, response)
  VALUES (new.id, new.first_name, new.middle_name, new.last_name, new.organization, new.agency, new.subject, new.details, new.response);
END;

CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, first_name, middle_name, last_name, organization, agency, subject, details, response)
  VALUES ('delete', old.id, old.first_name, old.middle_name, old.last_name, old.organization, old.agency, old.subject, old.details, old.response);
END;

CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
  INSERT INTO entries_fts(entries_fts, rowid, first_name, middle_name, last_name, organization, agency, subject, details, response)
  VALUES ('delete', old.id, old.first_name, old.middle_name, old.last_name, old.organization, old.agency, old.subject, old.details, old.response);
  INSERT INTO entries_fts(rowid, first_name, middle_name, last_name, organization, agency, subject, details, response)
  VALUES (new.id, new.first_name, new.middle_name, new.last_name, new.organization, new.agency, new.subject, new.details, new.response);
END;

INSERT INTO entries_fts(entries_fts) VALUES ('rebuild');
