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
- [ ] Txn KV: Lock Keys
- [ ] Txn KV: Commit
- [ ] Txn KV: Rollback

## RPC Client: Send Request

```railroad
Diagram(
  NonTerminal("Get conn pool to the target store"),
  Choice(
    0,
    Sequence(
      Comment("Batch enabled"),
      NonTerminal("Push request to channel", {cls: "with-metrics"}),
      NonTerminal("Wait response", {href: "#rpc-client-batch-request-loop"}),
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

## RPC Client: Batch Request Loop

```railroad
Diagram(
  Comment("send"),
  OneOrMore(
    Sequence(
      NonTerminal("Fetch pending requests"),
      Choice(
        0,
        Comment("tikv is not overload"),
        NonTerminal("Fetch more requests"),
      ),
      NonTerminal("Select a connection"),
      NonTerminal("Build a batch request and send it"),
    ),
  ),
)
```

- Duraion of each iteration is obeserved as `tidb_tikvclient_batch_send_latency` (exclude waiting for the first request).
- If the target TiKV is overload, more requests may be collected for sending. The event is only counted by `tidb_tikvclient_batch_wait_overload` (without waiting duration).
- The connection (*batchCommandsClient*) is chosen round-robinly, we try to acquire a lock before using the connection. *no available connections* might be reported if we cannot find such a connection, such an event is counted by `tidb_tikvclient_batch_client_no_available_connection_total`.

```railroad
Diagram(
  Comment("recv"),
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
