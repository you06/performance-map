# TiDB Snapshot Read Duration

TiDB implement read queries by calling get, batchget, scan of snapshot, and coprocessor requests, this section describe the duration of snapshot reads.

## Get

```railroad
Diagram(
    OneOrMore(
        Sequence(
            NonTerminal("Load region cache"),
            NonTerminal("Send request and wait for response", {href: "tidb-kv-client#send-request"}),
        ),
        Choice(
            0,
            Sequence(
                Comment("Lock error"),
                NonTerminal("Resolve lock"),
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
            NonTerminal("Group keys into batches by regions"),
            Comment("For each batch"),
        ),
        Sequence(
            OneOrMore(
                Sequence(
                    NonTerminal("Load region cache"),
                    NonTerminal("Send request and wait for response", {href: "tidb-kv-client#send-request"}),
                ),
                Choice(
                    0,
                    Sequence(
                        Comment("Lock error"),
                        NonTerminal("Resolve lock"),
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
