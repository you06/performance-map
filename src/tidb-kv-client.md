# TiDB KV Client

## TODOs

- [ ] Data Source Executors
- [ ] DistSQL: ...
- [ ] Cop Client: ...
- [ ] Txn KV: Snapshot Read
  - [ ] Get
  - [ ] BatchGet
  - [ ] Iter
  - [ ] IterReverse

## Txn KV: Start Transaction

```railroad
Diagram(
  Span("Wait start-ts ready", {color: "green", tooltip: "tidb_tikvclient_ts_future_wait_seconds"}),
)
```

- *start-ts* of a transaction is fetched asynchronously (typically requested on *optimize*). The duration is observed as `tidb_tikvclient_ts_future_wait_seconds`.

## Txn KV: Lock Keys

```railroad
Diagram(
  Span("Filter and deduplicate keys"),
  Choice(
    0,
    Sequence(
      Span("Apply pessimistic-lock on mutations", {href: "#do-action-on-mutations"}),
      Choice(
        0,
        Sequence(
          Comment("ok"),
          Span("Update key flags in membuf"),
        ),
        Sequence(
          Comment("err"),
          Choice(
            0,
            Comment("failed to lock 1 key"),
            Sequence(Comment("deadlock"), Span("Pessimistic rollback")),
            Span("Async pessimistic rollback"),
          ),
        ),
      ),
    ),
    Comment("no key need to be locked"),
  ),

)
```

- The duration is observed as `tidb_tikvclient_txn_cmd_duration_seconds{type="lock_keys"}`.
- Each key will be locked once within a transaction.


## Txn KV: Commit

```railroad
Diagram(
  Span("Init keys and mutations"),
  Choice(
    1,
    Sequence(
      Comment("err"),
      Span("Async pessimistic rollback"),
    ),
    Comment("no mutation"),
    Sequence(
      Optional(Span("Local latch wait", {color: "green", tooltip: "tidb_tikvclient_local_latch_wait_seconds"}), "skip"),
      Span("Execute commit protocol", {href: "#commit-protocol"}),
    ),
  ),
)
```

- The duration is observed as `tidb_tikvclient_txn_cmd_duration_seconds{type="commit"}`.
- There is a local-latch-wait duration if the transaction is optimisitc and local-latches are enabled, which is observed as `tidb_tikvclient_local_latch_wait_seconds`.

### Commit protocol

```railroad
Diagram(
  Stack(
    Sequence(
      Choice(
        0,
        Comment("use 2pc or causal consistency"),
        Span("Get min-commit-ts"),
      ),
      Optional("Async prewrite binlog", "skip"),
      Span("Prewrite mutations", {href: "#do-action-on-mutations"}),
      Optional("Wait prewrite binlog result", "skip"),
    ),
    Sequence(
      Choice(
        1,
        Comment("1pc"),
        Sequence(
          Comment("2pc"),
          Span("Get commit-ts"),
          Span("Check schema (try to amend if needed)"),
          Span("Commit mutations", {href: "#do-action-on-mutations"}),
        ),
        Sequence(
          Comment("async-commit"),
          Span("Commit mutations asynchronously", {href: "#do-action-on-mutations"}),
        ),
      ),
      Choice(
        0,
        Comment("committed"),
        Span("Async cleanup"),
      ),
      Optional("Commit binlog", "skip"),
    ),
  ),
)
```

- Spans are recorded in `CommitDetails` which can be extracted from slow log.

## Txn KV: Rollback

```railroad
Diagram(
  Choice(
    0,
    Span("Rollback pessimistic locks"),
    Comment("optimisitc or no key locked"),
  )
)
```

- The duration is observed as `tidb_tikvclient_txn_cmd_duration_seconds{type="rollback"}`.

## Two Phase Committer

### Do Action on Mutations

```railroad
Diagram(
  Stack(
    Sequence(
      Span("Group mutations by region"),
      Optional(Span("Pre-split and re-group"), "skip"),
      Span("Group mutations by batch"),
    ),
    Sequence(
      Optional(Span("Apply action on primary batch"), "skip"),
      Choice(
        0,
        Span("Apply action on rest batches", {href: "#batch-executor"}),
        Span("Commit secondary batches asynchronously", {href: "#batch-executor"}),
      ),
    ),
  ),
)
```

- The time of grouping mutations is mainly spent on locating keys. If mutation size on a single region is too large, pre-split that region and re-group mutations.
- Apply action on primary firstly if primary is in mutations and action is pessimistic-lock, commit(non-async) or cleanup.

### Batch Executor

```railroad
Diagram(
  OneOrMore(
    Sequence(
      Span("Wait for next rate-limit token"),
      Span("Fork a goroutine to apply single batch action concurrently"),
    ),
    Comment("for each batch"),
  ),
)
```

### Action: Pessimistic Lock

TODO

### Action: Pessimistic Rollback

TODO

### Action: Prewrite

TODO
### Action: Commit

TODO

### Action: Cleanup

TODO

## RPC Client

### Send Request

```railroad
Diagram(
  Span("Get conn pool to the target store"),
  Choice(
    0,
    Sequence(
      Comment("Batch enabled"),
      Span("Push request to channel", {href: "#batch-send-loop", color: "green", tooltip: "tidb_tikvclient_batch_wait_duration"}),
      Span("Wait response", {href: "#batch-recv-loop"}),
    ),
    Sequence(
      Span("Get conn from pool"),
      Span("Call RPC"),
      Choice(
        0,
        Comment("Unary call"),
        Span("Recv first"),
      ),
    ),
  ),
)
```

- The overall duration of sending a request is observed as `tidb_tikvclient_request_seconds`.
- RPC client maintains connection pools (named *ConnArray*) to each store, and each pool has a *BatchConn* with a [batch request(send) channal](#rpc-client-batch-request-loop).
- Batch is enabled when the store is tikv and batch size is positive, which is true in most cases.
- The size of batch request channel is `tikv-client.max-batch-size` (default: 128), the duration of enqueue is observed as `tidb_tikvclient_batch_wait_duration`.
- There are three kinds of stream request: CmdBatchCop, CmdCopStream, CmdMPPConn, which involve an additional recv call to fetch the first response from the stream.

### Batch Send Loop

```railroad
Diagram(
  OneOrMore(
    Sequence(
      Span("Fetch pending requests"),
      Choice(
        0,
        Comment("tikv is not overload"),
        Span("Fetch more requests"),
      ),
      Span("Select a connection"),
      Span("Build a batch request and put it to the sending buffer"),
    ),
    Comment("async send by grpc and process next pending requests"),
  ),
)
```

- Duraion of each iteration is observed as `tidb_tikvclient_batch_send_latency` (exclude waiting for the first request).
- If the target TiKV is overload, more requests may be collected for sending. The event is only counted by `tidb_tikvclient_batch_wait_overload` (without waiting duration).
- The connection (*batchCommandsClient*) is chosen round-robinly, we try to acquire a lock before using the connection. *no available connections* might be reported if we cannot find such a connection, such an event is counted by `tidb_tikvclient_batch_client_no_available_connection_total`.
- GRPC itself maintains control buffers for stream clients and requests are actually sended asynchronously. This kind of duration is hard to observed.

### Batch Recv Loop

```railroad
Diagram(
  OneOrMore(
    Sequence(
      Span("Recv batch response from stream client", {color: "green", tooltip: "tidb_tikvclient_batch_recv_latency"}),
      Span("Deliver batched responses to corresponding request entries"),
    ),
  ),
)
```

- There are `tikv-client.grpc-connection-count` (default: 4) connections established to each store, each with its own run loop for receiving responses from the corresponding stream client.
- Recv duration is observed by `tidb_tikvclient_batch_recv_latency`, which may include a duration of waiting for more requests (call `recv` before actually sending any requests).
- Responses are identified by request-id, the duration for delivering them can be omitted.

## Resolve TSO

```railroad
Diagram(
  Choice(
    0,
    Sequence(
        Comment("Async TSO is not ready"),
        NonTerminal("Wait the response of TSO request"),
    ),
    Comment("Async TSO is ready"),
  ),
)
```

## Region cache

### Load region cache

```railroad
Diagram(
  Choice(
    0,
    Comment("cache valid"),
    OneOrMore(
      Span("Load region cache from PD"),
      Comment("retry")
    )
  )
)
```
