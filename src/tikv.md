# TiKV


## TODOs
- [ ] Add grpc entry path details.
- [ ] Add async-io execution path details.
- [ ] Add new request tracker related information.
- [ ] Add raft-engine execution details.
- [ ] Add kv engine details to the important stages such as `append_log`.
- [ ] The coprocessor task latency and worker model relations.
- [ ] Build a detailed model describing the relationship between the user perceivable durations and the information recorded in the tracker. Then
it would be straightforward to tell the duration combinations of `cop scheduler`, `task wait`, `io operations like scan`.

## Grpc Entry
TODO

## TxnKV Read

### Point/Batch Point Get

```railroad
Diagram(
  Span("Grpc Receive"),
  Span("Snapshot Fetch", {href: "#snapshot-fetch"}),
  OneOrMore(
    Sequence(
      Span("Seek For The Target Key", {color: "green", tooltip: "tikv_engine_seek_micro_seconds{type=\"seek_max\"}"}),
      Choice(
        0,
        Span("Load Key Value from the Key", {color: "green"}),
      ),
      Choice(
        0,
        Span("Load Row Value from default cf", {color: "green"}),
        Comment("Already Load From Write CF(short value)"),
      )
    ),
    Comment("loop keys in batch point get")
  ),
  Span("Grpc Response"),
)
```

- The write seek may seek kv db iterator to the target first, there could be some next operations to skip `rollback` and `lock` records.
- The kv db write seek duration is observed as `tikv_engine_seek_micro_seconds{type="seek_max"}`.
- When loading value from the key, there are several several paths, short values only need to seek read once, while long value need to read twice after seeking.
- Some read requests will hit block cache, which benefit from avoiding loading from disk.
  - There are 3 types of TiKV commands.
  - Read from disk duration `sum(rate(tikv_storage_rocksdb_perf{metric="block_read_time",req="get/batch_get_command/batch_get"})) / sum(rate(tikv_storage_rocksdb_perf{metric="block_read_count",req="get/batch_get_command/batch_get"}))`.
  - Read from block cache count `tikv_storage_rocksdb_perf{metric="get_from_memtable_count",req="get/batch_get_command/batch_get"}` (it's fast so we do not collect the time metric).

### Coprocessor Read

```railroad
Diagram(
  Span("Grpc Receive"),
  Span("Snapshot Fetch", {color: "green", href: "#snapshot-fetch", tooltip: "tikv_coprocessor_request_wait_seconds_bucket{type=\"snapshot\"}"}),
  Span("Cop Task Wait Schedule", {color: "green", tooltip: "tikv_coprocessor_request_wait_seconds_bucket{type=\"schedule\"}"}),
  Span("Cop Handler Build", {color: "green", tooltip: "tikv_coprocessor_request_handler_build_seconds_bucket{type=\"req\"}"}),
  Span("Cop Task Execution", {color: "green", tooltip: "tikv_coprocessor_request_handle_seconds_bucket{type=\"req\"}"}),
  Choice(
    0,
    Span("ResultSet To Chunk Format"),
  ),
  Span("Grpc Response"),
)
```

- Get snapshot duration is recorded as `tikv_coprocessor_request_wait_seconds_bucket{type="snapshot"}` for coprocessor commands. Also this duration is recorded in the request tracker as `snapshot_wait_time`.
- The cop task has to wait for worker resources and snapshot fetch:
  - The cop task wait schedule duration is observed as `tikv_coprocessor_request_wait_seconds_bucket{type="schedule"}`. Also this duration is
    recorded in the request tracker as `schedule_wait_time`.
  - The cop handler build time is observed as `tikv_coprocessor_request_handler_build_seconds_bucket{type="req"}`. Also it's recorded in the request
    tracker as `handler_build_time`.
  - The total wait time is observed as `tikv_coprocessor_request_wait_seconds{type="all"}`
- The cop task execution time is observed as `tikv_coprocessor_request_handle_seconds_bucket{type="req"}`. Also is recorded in the request tracker as
  `req_lifetime`.

### Snapshot Fetch

```railroad
Diagram(
  Choice(
    0,
    Comment("Local Read", {tooltip: "tikv_raftstore_local_read_executed_requests"}),
    Sequence(
      Span("Propose Wait", {color: "green", tooltip: "tikv_raftstore_request_wait_time_duration_secs"}),
      Span("Read index Read Wait", {color: "green", tooltip: "tikv_raftstore_commit_log_duration_seconds"})
    ),
  ),
  Span("Fetch A Snapshot From KV Engine")
)
```

- The total snapshot get duration is observed as `tikv_storage_engine_async_request_duration_seconds_bucket{type="snapshot"}`.
- The number of local read requests is observed as `tikv_raftstore_local_read_executed_requests`.
- The number of local read requests rejected is observed as `tikv_raftstore_local_read_reject_total`.
  It supports `by (reason)` query.
  If most of the requests are rejected by local reader the performance would be bad.
- The duration of the read index wait could be regarded as `tikv_raftstore_commit_log_duration_seconds`.


## TxnKV Write

```railroad
Diagram(
  Span("Grpc Receive"),
  Span("Acquire Latch For Keys"),
  Span("Snapshot Fetch", {href: "#snapshot-fetch"}),
  Choice(
    0,
    Span("Process Write Requests"),
  ),
  Choice(
    0,
    Span("Async Write"),
  ),
  Span("Grpc Response"),
)
```

- The latch acquisition is observed as `TiKV_scheduler_latch_wait_duration_seconds{type=xxx}`.
- The write command processing may needs to read related from engine first.
- The async write stage includes both transaction log consistency and state machine apply, it's observed as `tikv_storage_engine_async_request_duration_seconds{type=write}`.

### TxnKV Async Write

``` railroad
Diagram(
  Span("Propose Wait"),
  Choice(
    0,
    Span("Append Log"),
    Span("Commit Log Wait"),
  ),
  Choice(
    0,
    Span("Apply Wait"),
  ),
  Span("Apply Log"),
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
