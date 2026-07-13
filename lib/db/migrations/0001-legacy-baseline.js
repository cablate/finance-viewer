module.exports = {
  version: 1,
  name: 'legacy-v0.2.3-baseline',
  source: 'Existing v0.2.3 SCHEMA_SQL and compatibility migrations are the version 1 baseline.',
  apply() {
    // The compatibility facade creates and repairs the legacy baseline before
    // the versioned runner starts. This row anchors future checksums.
  },
};
