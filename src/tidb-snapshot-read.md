# TiDB Snapshot Read Duration

TiDB implement read queries by calling get, batchget, scan of snapshot, and coprocessor requests, this section describe the duration of snapshot reads.

## Get

```railroad
Diagram(
  OneOrMore(
    Sequence(
      Span("Load region cache", {href: "tidb-kv-client#load-region-cache"}),
      Span("Send request and wait for response", {href: "tidb-kv-client#send-request"}),
    ),
    Choice(
      0,
      Sequence(
        Comment("Lock error"),
        Span("Resolve lock"),
        Comment("Retry"),
      ),
      Comment("Region error, Invalid region cache & Retry"),
      Comment("Retry"),
    ),
  ),
)
```

## BatchGet

```railroad
Diagram(
  Stack(
    Sequence(
      Span("Group keys into batches by regions"),
      Comment("For each batch"),
    ),
    Sequence(
      OneOrMore(
        Sequence(
      Span("Load region cache", {href: "tidb-kv-client#load-region-cache"}),
          Span("Send request and wait for response", {href: "tidb-kv-client#send-request"}),
        ),
        Choice(
          0,
          Sequence(
            Comment("Lock error"),
            Span("Resolve lock"),
            Comment("Retry"),
          ),
          Comment("Region error, Invalid region cache & Retry"),
          Comment("Retry"),
        ),
      ),
    ),
  )
)
```

## Coprocessor Scan

```railroad
Diagram(
  OneOrMore(
    Sequence(
      Span("Load region cache", {href: "tidb-kv-client#load-region-cache"}),
      Span("Send request and wait for response", {href: "tidb-kv-client#send-request"}),
    ),
    Choice(
      0,
      Sequence(
        Comment("Lock error"),
        Span("Resolve lock"),
        Comment("Retry"),
      ),
      Comment("Region error, Invalid region cache & Retry"),
      Comment("Retry"),
    ),
  ),
)
```
