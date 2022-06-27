# TiDB Read Duration

TiDB read by calling `Next` on cascade executors. So here we dig into the data source executors which actually cause the latency.

## Point get

```railroad
Diagram(
    Choice(
        0,
        NonTerminal("Resolve TSO", {href: "tidb-kv-client#resolve-tso"}),
        Comment("Read by clustered PK"),
    ),
    Choice(
        0,
        NonTerminal("Read handle by index key", {href: "tidb-snapshot-read#get"}),
        Comment("Read by clustered PK, encode handle by key"),
    ),
    NonTerminal("Read value by handle", {href: "tidb-snapshot-read#get"}),
)
```

## Batch Point get

```railroad
Diagram(
    NonTerminal("Resolve TSO", {href: "tidb-kv-client#resolve-tso"}),
    Choice(
        0,
        NonTerminal("Read all handles by index keys", {href: "tidb-snapshot-read#batch-get"}),
        Comment("Read by clustered PK, encode handle by keys"),
    ),
    NonTerminal("Read values by handles", {href: "tidb-snapshot-read#batch-get"}),
)
```

Similar with point get, but batch point get has no change to skip resolving timestamp.

## Table Scan

```railroad
Diagram(
    NonTerminal("Resolve TSO", {href: "tidb-kv-client#resolve-tso"}),
    NonTerminal("Build table scan coprocessor tasks and send it in async goroutines"),
    NonTerminal("Read values by handles", {href: "tidb-snapshot-read#batch-get"}),
)
```

Actually TiDB split part of the ranges an optional signed ranges, but here we skip it.

