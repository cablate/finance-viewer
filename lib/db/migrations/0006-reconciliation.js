const SOURCE = `financial-reconciliation-v1:
valued_items,valuation_snapshots,transfer_matches,source_conflicts,
review_tasks,identity_redirects,instruments-merge-target`;

function apply(db) {
  db.exec(`
    ALTER TABLE instruments ADD COLUMN merged_into_instrument_id INTEGER REFERENCES instruments(id) ON DELETE RESTRICT;

    CREATE TABLE valued_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, item_key TEXT NOT NULL UNIQUE,
      entity_id INTEGER NOT NULL REFERENCES reporting_entities(id) ON DELETE RESTRICT,
      item_type TEXT NOT NULL, display_name TEXT NOT NULL, position TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
      authority TEXT NOT NULL, review_state TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;
    CREATE INDEX valued_items_entity_idx ON valued_items(entity_id,active,item_type);

    CREATE TABLE valuation_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT, valuation_key TEXT NOT NULL UNIQUE,
      item_id INTEGER NOT NULL REFERENCES valued_items(id) ON DELETE RESTRICT,
      source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
      as_of_date TEXT NOT NULL, value_minor INTEGER NOT NULL, currency TEXT NOT NULL,
      valuation_method TEXT NOT NULL, confidence REAL, authority TEXT NOT NULL,
      review_state TEXT NOT NULL, record_status TEXT NOT NULL DEFAULT 'posted', note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(item_id,source_id,as_of_date,valuation_method),
      CHECK(confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
    ) STRICT;
    CREATE INDEX valuation_snapshot_lookup_idx ON valuation_snapshots(item_id,as_of_date DESC);

    CREATE TABLE transfer_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT, match_key TEXT NOT NULL UNIQUE,
      from_transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
      to_transaction_id INTEGER REFERENCES transactions(id) ON DELETE RESTRICT,
      amount_minor INTEGER NOT NULL, currency TEXT NOT NULL, match_status TEXT NOT NULL,
      confidence REAL, authority TEXT NOT NULL, review_state TEXT NOT NULL, note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(from_transaction_id,to_transaction_id),
      CHECK(to_transaction_id IS NULL OR from_transaction_id <> to_transaction_id),
      CHECK(confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
    ) STRICT;
    CREATE INDEX transfer_match_status_idx ON transfer_matches(match_status,review_state);

    CREATE TABLE source_conflicts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, conflict_key TEXT NOT NULL UNIQUE,
      target_context TEXT NOT NULL, semantic_key TEXT NOT NULL,
      left_source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
      right_source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'open', selected_source_id INTEGER REFERENCES sources(id) ON DELETE RESTRICT,
      resolution_note TEXT, resolved_at TEXT, authority TEXT NOT NULL, review_state TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(target_context,semantic_key,left_source_id,right_source_id),
      CHECK(left_source_id <> right_source_id)
    ) STRICT;
    CREATE INDEX source_conflict_status_idx ON source_conflicts(status,target_context);

    CREATE TABLE review_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, task_key TEXT NOT NULL UNIQUE,
      task_kind TEXT NOT NULL, resource_type TEXT NOT NULL, resource_key TEXT NOT NULL,
      source_conflict_id INTEGER REFERENCES source_conflicts(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'open', priority INTEGER NOT NULL DEFAULT 50,
      reason TEXT NOT NULL, resolution_source_id INTEGER REFERENCES sources(id) ON DELETE RESTRICT,
      resolution_note TEXT, resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(task_kind,resource_type,resource_key)
    ) STRICT;
    CREATE INDEX review_task_queue_idx ON review_tasks(status,priority DESC,created_at);

    CREATE TABLE identity_redirects (
      id INTEGER PRIMARY KEY AUTOINCREMENT, resource_type TEXT NOT NULL,
      old_key TEXT NOT NULL, new_key TEXT NOT NULL,
      proposal_key TEXT NOT NULL REFERENCES human_confirmation_requests(proposal_key) ON DELETE RESTRICT,
      merged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(resource_type,old_key), CHECK(old_key <> new_key)
    ) STRICT;
    CREATE INDEX identity_redirect_target_idx ON identity_redirects(resource_type,new_key);
  `);
}

module.exports = { version: 6, name: 'financial-reconciliation-v1', source: SOURCE, apply };
