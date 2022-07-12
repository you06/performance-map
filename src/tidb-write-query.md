# TiDB Write Duration

TiDB process write queries in a no-delay way, and many write executors are based upon read executors.

```railroad
Diagram(
  Span("Execute write query"),
  Choice(
    0,
    Span("Pessimistic lock keys", {href: "tidb-kv-client#txn-kv-lock-keys"}),
    Comment("bypass in optimistic transaction")
  ),
  Choice(
    0,
    Span("Auto Commit Transaction"),
    Comment("bypass in non-auto-commit or explicit transaction")
  ),
)
```

## Insert

```railroad
Diagram(
  OneOrMore(
    Sequence(
      Choice(
        0,
        Span("Check key exist", {href: "tidb-snapshot-read#get"}),
        Comment("Skip check for optimistic transaction")
      ),
      Span("Insert into membuffer")
    ),
    Comment("Loop insert rows")
  )
)
```

TiDB processes insert in memory so it's fast for small dataset.
With large dataset like `insert into select`, the insert is processed only in a single thread(about 50,000 to 100,000 rows per second), there may be a performance issue.

## Delete

```railroad
Diagram(
  Span("Read data", {href: "tidb-read-query"}),
  OneOrMore(
    Span("Delete from membuffer"),
    Comment("Loop delete keys"),
  )
)
```

Similar with insert, delete are fast for small dataset.
With large dataset, delete is little faster than insert statement.

## Update

```railroad
Diagram(
  Span("Read data", {href: "tidb-read-query"}),
  OneOrMore(
    Sequence(
      Span("Check key exist", {href: "tidb-snapshot-read#get"}),
      Span("Insert into membuffer")
    ),
    Comment("Loop update rows")
  )
)
```

Update combines delete and insert.

## Cursor Read

Cursor read(`select for update`) is a special type of read statement, it's processed the same way like non-cursor read statements in optimistic and auto-commit transactions. Only inside pessimistic transactions, cursor read have an extra pessimistic lock phase.
Cursor read with coprocessor executors add pessimisitc locks in the same way of write executors, so we analyze point get and batch point get here.

### Cursor Point Get

```railroad
Diagram(
  Choice(
    0,
    Sequence(
      Span("Read handle key by index key"),
      Span("Lock index key", {href: "tidb-kv-client#txn-kv-lock-keys"})
    ),
    Comment("Clustered index")
  ),
  Span("Lock handle key", {href: "tidb-kv-client#txn-kv-lock-keys"}),
  Span("Raed value from pessimistic lock cache")
)
```

### Cursor Batch Point Get

```railroad
Diagram(
  Choice(
    0,
    Sequence(
      Span("Read handle keys by index keys"),
    ),
    Comment("Clustered index")
  ),
  Span("Lock index and handle keys", {href: "tidb-kv-client#txn-kv-lock-keys"}),
  Span("Raed values from pessimistic lock cache")
)
```

Cursor point get and batch point get read data from pessimistic lock cache which means pessimistic lock is responsed with the locked value of that key.
