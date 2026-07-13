const SOURCE = `financial-investments-v1:
instruments,investment_trades,holding_snapshots,market_quotes,fx_quotes,investment_cash_matches`;

function apply(db) {
  db.exec(`
    CREATE TABLE instruments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, instrument_key TEXT NOT NULL UNIQUE,
      instrument_type TEXT NOT NULL, name TEXT NOT NULL, symbol TEXT, exchange TEXT, isin TEXT,
      quote_currency TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
      authority TEXT NOT NULL, review_state TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(symbol,exchange,quote_currency)
    ) STRICT;
    CREATE TABLE investment_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT, trade_key TEXT NOT NULL UNIQUE,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      instrument_id INTEGER NOT NULL REFERENCES instruments(id) ON DELETE RESTRICT,
      source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
      trade_date TEXT NOT NULL, settle_date TEXT, activity_type TEXT NOT NULL,
      quantity_decimal TEXT, unit_price_decimal TEXT, gross_minor INTEGER, net_minor INTEGER,
      fee_minor INTEGER NOT NULL DEFAULT 0, tax_minor INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL,
      external_id TEXT, record_status TEXT NOT NULL DEFAULT 'posted', authority TEXT NOT NULL,
      review_state TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(account_id,source_id,external_id)
    ) STRICT;
    CREATE TABLE holding_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT, holding_key TEXT NOT NULL UNIQUE,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
      instrument_id INTEGER NOT NULL REFERENCES instruments(id) ON DELETE RESTRICT,
      source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
      as_of_date TEXT NOT NULL, quantity_decimal TEXT NOT NULL,
      reported_cost_basis_minor INTEGER, reported_market_value_minor INTEGER, currency TEXT NOT NULL,
      authority TEXT NOT NULL, review_state TEXT NOT NULL, record_status TEXT NOT NULL DEFAULT 'posted',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(account_id,instrument_id,source_id,as_of_date)
    ) STRICT;
    CREATE TABLE market_quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, quote_key TEXT NOT NULL UNIQUE,
      instrument_id INTEGER NOT NULL REFERENCES instruments(id) ON DELETE RESTRICT,
      source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
      price_decimal TEXT NOT NULL, quote_currency TEXT NOT NULL, as_of_date TEXT NOT NULL,
      quote_type TEXT NOT NULL, provider TEXT NOT NULL, authority TEXT NOT NULL,
      confidence REAL, review_state TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(instrument_id,source_id,as_of_date,quote_type)
    ) STRICT;
    CREATE TABLE fx_quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT, fx_key TEXT NOT NULL UNIQUE,
      source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
      base_currency TEXT NOT NULL, quote_currency TEXT NOT NULL, rate_decimal TEXT NOT NULL,
      as_of_date TEXT NOT NULL, provider TEXT NOT NULL, authority TEXT NOT NULL,
      confidence REAL, review_state TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(base_currency,quote_currency,source_id,as_of_date)
    ) STRICT;
    CREATE TABLE investment_cash_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT, match_key TEXT NOT NULL UNIQUE,
      trade_id INTEGER NOT NULL REFERENCES investment_trades(id) ON DELETE RESTRICT,
      transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
      amount_minor INTEGER NOT NULL, reconciliation_status TEXT NOT NULL,
      authority TEXT NOT NULL, review_state TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(trade_id,transaction_id)
    ) STRICT;
    CREATE INDEX holding_lookup_idx ON holding_snapshots(account_id,instrument_id,as_of_date DESC);
    CREATE INDEX market_quote_lookup_idx ON market_quotes(instrument_id,quote_currency,as_of_date DESC);
    CREATE INDEX fx_quote_lookup_idx ON fx_quotes(base_currency,quote_currency,as_of_date DESC);
  `);
}

module.exports = { version: 5, name: 'financial-investments-v1', source: SOURCE, apply };
