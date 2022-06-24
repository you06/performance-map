# TiKV


## TODOs
- [ ] Add grpc entry path details.
- [ ] Add async-io execution path details.
- [ ] Add new request tracker related information.
- [ ] Add raft-engine execution details.
- [ ] Add kv engine details to the important stages such as `append_log`.
- [ ] The coprocessor task latency and worker model relations.
- [ ] Build a detailed model describing the relationship bettween the user perceivable durations and the information recorded in the tracker. Then
it would be straightforward to tell the duration combinations of `cop scheduler`, `task wait`, `io operations like scan`.

## Grpc Entry
TODO

## TxnKV Read

### Point/Batch Point Get

```railroad
Diagram(
  Sequence(
      Span("Grpc Receive"),
  ),
  Sequence(
      Span("Snapshot Fetch"),
  ),
  Sequence(
    Span("Write Seek For The Target Key"),
  ),
  Choice(
    0,
    Span("Load Key Value from the Key"),
  ),
  Choice(
    0,
    Span("Load Row Value from default cf"),
    Comment("Already Load From Write CF"),
  ),
  Sequence(
      Span("Grpc Response"),
  ),
)
```

- The snapshot get duration is observed as `tikv_storage_engine_async_request_duration_seconds_bucket{type="snapshot"}`.
- The write seek may seek kv db iterator to the target first, there could be some next operations to skip `rollback` and `lock` records.
- The kv db write seek duration is observed as `tikv_engine_seek_micro_seconds{type="seek_max"}`.

### Coprocessor Read


```railroad
Diagram(
  Sequence(
      Span("Grpc Receive"),
  ),
  Sequence(
      Span("Snapshot Fetch"),
  ),
  Sequence(
    Span("Cop Task Wait Schedule"),
  ),
  Sequence(
    Span("Cop Handler Build"),
  ),
  Sequence(
    Span("Cop Task Execution"),
  ),
  Choice(
    0,
    Span("ResultSet To Chunk Format"),
  ),
  Sequence(
      Span("Grpc Response"),
  ),
)
```

- The snapshot get duration is observed as `tikv_storage_engine_async_request_duration_seconds_bucket{type="snapshot"}` and
  `tikv_coprocessor_request_wait_seconds{type="snapshot"}`. Also this duration is recorded in the request tracker as `snapshot_wait_time`.
- The cop task has to wait for worker resources and snapshot fetch:
  - The cop task wait schedule duration is observed as `tikv_coprocessor_request_wait_seconds{type="schedule"}`. Also this duration is
    recorded in the request tracker as `schedule_wait_time`.
  - The cop handler build time is observed as `tikv_coprocessor_request_handler_build_seconds{type="req"}`. Also it's recorded in the request
    tracker as `handler_build_time`.
  - The total wait time is observed as `tikv_coprocessor_request_wait_seconds{type="all"}`
- The cop task execution time is observed as `tikv_coprocessor_request_handle_seconds{type="req"}`. Also is recorded in the request tracker as
  `req_lifetime`



### Snapshot Fetch

```railroad
Diagram(
  Choice(
    0,
    Sequence(
      Span("Local Read"),
    ),
    Sequence(
      Span("Propose Wait"),
       Sequence(
         Span("Read index Read Wait"),
      ),
    ),
  ),
  Sequence(
      Span("Fetch A Snapshot From KV Engine"),
  ),
)
```

- The number of local read requests rejected is observed as `tikv_raftstore_local_read_reject_total`. If most of the requests are rejected by local reader the
  performance would be bad.
- The duration of the read index wait could be regarded as `tikv_raftstore_commit_log_duration_seconds_bucket`.


## TxnKV Write

```railroad
Diagram(
  Sequence(
      Span("Grpc Receive"),
  ),
  Sequence(
    Span("Acquire Latch For Keys"),
  ),
  Sequence(
      Span("Snapshot Fetch"),
  ),
  Choice(
    0,
    Span("Process Write Requests"),
  ),
  Choice(
    0,
    Span("Async Write"),
  ),
  Sequence(
      Span("Grpc Response"),
  ),
)
```

- The latch acquisition is observed as `TiKV_scheduler_latch_wait_duration_seconds{type=xxx}`.
- The write command processing may needs to read related from engine first.
- The async write stage includes both transaction log consistency and state machine apply, it's observed as `tikv_storage_engine_async_request_duration_seconds{type=write}`.



### TxnKV Async Write

``` railroad
Diagram(
  Sequence(
      Span("Propose Wait"),
  ),
  Choice(
    0,
    Sequence(
      Span("Append Log"),
    ),
    Sequence(
      Span("Commit Log Wait"),
    ),
  ),

  Choice(
    0,
    Span("Apply Wait"),
  ),
  Sequence(
      Span("Apply Log"),
  ),
)
```

- The propose wait is observed as `tikv_raftstore_request_wait_time_duration_secs_bucket`.
- The commit log wait is observed as `tikv_raftstore_store_wf_commit_log_duration_seconds_bucket`.
- The append log is observed as `tikv_raftstore_append_log_duration_seconds_bucket`.
- The apply wait is observed as `tikv_raftstore_apply_wait_time_duration_secs_bucket`.
- The apply log is observed as `tikv_raftstore_apply_log_duration_seconds_bucket`.

#### Log Engine Write

TODO

#### KV Engine Write

TODO
