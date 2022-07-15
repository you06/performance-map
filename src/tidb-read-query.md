# TiDB Read Duration

TiDB read by calling `Next` on cascade executors. So here we dig into the data source executors which actually cause the latency.

## Point get

```railroad
Diagram(
  Choice(
    0,
    Span("Resolve TSO", {href: "tidb-kv-client#resolve-tso"}),
    Comment("Read by clustered PK in auto-commit-txn mode"),
  ),
  Choice(
    0,
    Span("Read handle by index key", {color: "green", href: "tidb-snapshot-read#get", tooltip: "tidb_tikvclient_txn_cmd_duration_seconds{type=\"get\"}"}),
    Comment("Read by clustered PK, encode handle by key"),
  ),
  Span("Read value by handle", {color: "green", href: "tidb-snapshot-read#get", tooltip: "tidb_tikvclient_txn_cmd_duration_seconds{type=\"get\"}"}),
)
```

## Batch Point get

```railroad
Diagram(
  Span("Resolve TSO", {href: "tidb-kv-client#resolve-tso"}),
  Choice(
    0,
    Span("Read all handles by index keys", {color: "green", href: "tidb-snapshot-read#batchget", tooltip: "tidb_tikvclient_txn_cmd_duration_seconds{type=\"batch_get\"}"}),
    Comment("Read by clustered PK, encode handle by keys"),
  ),
  Span("Read values by handles", {color: "green", href: "tidb-snapshot-read#batchget", tooltip: "tidb_tikvclient_txn_cmd_duration_seconds{type=\"batch_get\"}"}),
)
```

Similar with point get, but batch point get has no change to skip resolving timestamp.

## Table Scan & Index Scan

```railroad
Diagram(
  Stack(
    Span("Resolve TSO", {href: "tidb-kv-client#resolve-tso"}),
    Span("Load region cache for related table/index ranges"),
    OneOrMore(
      Sequence(
        Span("Wait for result", {color: "green", href: "tidb-snapshot-read#coprocessor-scan", tooltip: "tidb_distsql_handle_query_duration_seconds_bucket{sql_type=\"general\"}"}),
      ),
      Comment("Next loop: drain the result")
    ),
  )
)
```

Table scan and index scan almost share the same code path.
For table scan, TiDB split part of the ranges as an optional signed ranges, but here we skip it.

## IndexLookUp

```railroad
Diagram(
  Stack(
    Span("Resolve TSO", {href: "tidb-kv-client#resolve-tso"}),
    Span("Load region cache for related index ranges"),
    OneOrMore(
      Sequence(
        Span("Wait for index scan result", {color: "green", href: "tidb-snapshot-read#coprocessor-scan", tooltip: "tidb_distsql_handle_query_duration_seconds_bucket{sql_type=\"general\"}"}),
        Span("Wait for table scan result", {color: "green", href: "tidb-snapshot-read#coprocessor-scan", tooltip: "tidb_distsql_handle_query_duration_seconds_bucket{sql_type=\"general\"}"}),
      ),
      Comment("Next loop: drain the result")
    ),
  )
)
```

Note if the index/table scan both are fast enough, they can be ready before we call `Next`, then wait will not take any time.
