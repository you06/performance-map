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
  NonTerminal("Wait start-ts ready"),
)
```

- *start-ts* of a transaction is fetched asynchronously (typically requested on *optimize*). The duration is obeserved as `tidb_tikvclient_ts_future_wait_seconds`.

## Txn KV: Lock Keys

```railroad
Diagram(
  NonTerminal("Filter and deduplicate keys"),
  Choice(
    0,
    Sequence(
      NonTerminal("Apply pessimistic-lock on mutations", {href: "#do-action-on-mutations"}),
      Choice(
        0,
        Sequence(
          Comment("ok"),
          NonTerminal("Update key flags in membuf"),
        ),
        Sequence(
          Comment("err"),
          Choice(
            0,
            Comment("failed to lock 1 key"),
            Sequence(Comment("deadlock"), NonTerminal("pessimistic rollback")),
            NonTerminal("Async pessimistic rollback"),
          ),
        ),
      ),
    ),
    Comment("no key need to be locked"),
  ),

)
```

- The duration is obeserved as `tidb_tikvclient_txn_cmd_duration_seconds{type="lock_keys"}`.
- Each key will be locked once within a transaction.


## Txn KV: Commit

```railroad
Diagram(
  NonTerminal("Init keys and mutations"),
  Choice(
    1,
    Sequence(
      Comment("err"),
      NonTerminal("Async pessimistic rollback"),
    ),
    Comment("no mutation"),
    Sequence(
      Optional(NonTerminal("Local latch wait"), "skip"),
      NonTerminal("Execute commit protocol", {href: "#commit-protocol"}),
    ),
  ),
)
```

- The duration is obeserved as `tidb_tikvclient_txn_cmd_duration_seconds{type="commit"}`.
- There is a local-latch-wait duration if the transaction is optimisitc and local-latches are enabled, which is obeserved as `tidb_tikvclient_local_latch_wait_seconds`.

### Commit protocol

```railroad
Diagram(
  Stack(
    Sequence(
      Choice(
        0,
        Comment("use 2pc or causal consistency"),
        NonTerminal("Get min-commit-ts"),
      ),
      Optional("Async prewrite binlog", "skip"),
      NonTerminal("Prewrite mutations", {href: "#do-action-on-mutations"}),
      Optional("Wait prewrite binlog result", "skip"),
    ),
    Sequence(
      Choice(
        1,
        Comment("1pc"),
        Sequence(
          Comment("2pc"),
          NonTerminal("Get commit-ts"),
          NonTerminal("Check schema (try to amend if needed)"),
          NonTerminal("Commit mutations", {href: "#do-action-on-mutations"}),
        ),
        Sequence(
          Comment("async-commit"),
          NonTerminal("Commit mutations asynchronously", {href: "#do-action-on-mutations"}),
        ),
      ),
      Choice(
        0,
        Comment("committed"),
        NonTerminal("Async cleanup"),
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
    NonTerminal("Rollback pessimistic locks"),
    Comment("optimisitc or no key locked"),
  )
)
```

- The duration is obeserved as `tidb_tikvclient_txn_cmd_duration_seconds{type="rollback"}`.

## Two Phase Committer

### Do Action on Mutations

```railroad
Diagram(
  Stack(
    Sequence(
      NonTerminal("Group mutations by region"),
      Optional(NonTerminal("Pre-split and re-group"), "skip"),
      NonTerminal("Group mutations by batch"),
    ),
    Sequence(
      Optional(NonTerminal("Apply action on primary batch"), "skip"),
      Choice(
        0,
        NonTerminal("Apply action on rest batches", {href: "#batch-executor"}),
        NonTerminal("Commit secondary batches asynchronously", {href: "#batch-executor"}),
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
      NonTerminal("Wait for next rate-limit token"),
      NonTerminal("Fork a goroutine to apply single batch action concurrently"),
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
  NonTerminal("Get conn pool to the target store"),
  Choice(
    0,
    Sequence(
      Comment("Batch enabled"),
      NonTerminal("Push request to channel", {href: "#batch-send-loop", cls: "with-metrics"}),
      NonTerminal("Wait response", {href: "#batch-recv-loop"}),
    ),
    Sequence(
      NonTerminal("Get conn from pool"),
      NonTerminal("Call RPC"),
      Choice(
        0,
        Comment("Unary call"),
        NonTerminal("Recv first"),
      ),
    ),
  ),
)
```

- The overall duration of sending a request is obeserved as `tidb_tikvclient_request_seconds`.
- RPC client maintains connection pools (named *ConnArray*) to each store, and each pool has a *BatchConn* with a [batch request(send) channal](#rpc-client-batch-request-loop).
- Batch is enabled when the store is tikv and batch size is positive, which is true in most cases.
- The size of batch request channel is `tikv-client.max-batch-size` (default: 128), the duration of enqueue is obeserved as `tidb_tikvclient_batch_wait_duration`.
- There are three kinds of stream request: CmdBatchCop, CmdCopStream, CmdMPPConn, which involve an additional recv call to fetch the first response from the stream.

### Batch Send Loop

```railroad
Diagram(
  OneOrMore(
    Sequence(
      NonTerminal("Fetch pending requests"),
      Choice(
        0,
        Comment("tikv is not overload"),
        NonTerminal("Fetch more requests"),
      ),
      NonTerminal("Select a connection"),
      NonTerminal("Build a batch request and put it to the sending buffer"),
    ),
    Comment("async send by grpc and process next pending requests"),
  ),
)
```

- Duraion of each iteration is obeserved as `tidb_tikvclient_batch_send_latency` (exclude waiting for the first request).
- If the target TiKV is overload, more requests may be collected for sending. The event is only counted by `tidb_tikvclient_batch_wait_overload` (without waiting duration).
- The connection (*batchCommandsClient*) is chosen round-robinly, we try to acquire a lock before using the connection. *no available connections* might be reported if we cannot find such a connection, such an event is counted by `tidb_tikvclient_batch_client_no_available_connection_total`.
- GRPC itself maintains control buffers for stream clients and requests are actually sended asynchronously. This kind of duration is hard to obeserved.

### Batch Recv Loop

```railroad
Diagram(
  OneOrMore(
    Sequence(
      NonTerminal("Recv batch response from stream client"),
      NonTerminal("Deliver batched responses to corresponding request entries"),
    ),
  ),
)
```

- There are `tikv-client.grpc-connection-count` (default: 4) connections established to each store, each with its own run loop for receiving responses from the corresponding stream client.
- Recv duration is obeserved by `tidb_tikvclient_batch_recv_latency`, which may include a duration of waiting for more requests (call `recv` before actually sending any requests).
- Responses are identified by request-id, the duration for delivering them can be omitted.
