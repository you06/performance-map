# TiKV


## TODOs
- [ ] grpc entry
- [ ] async-io execution path
- [ ] raft-engine execution details

## Grpc Entry
TODO

## TxnKV Read

### Point/Batch Point Get

```railroad
Diagram(
  Sequence(
      NonTerminal("Grpc Receive"),
  ),
  Choice(
    0,
    Sequence(
      NonTerminal("Get Snapshot From KV Engine Local Read"),
    ),
    Sequence(
      NonTerminal("Get Snapshot From KV Engine Leader Confirm"),
    ),
  ),
  Sequence(
    NonTerminal("Write Seek For The Target Key"),
  ),
  Choice(
    0,
    NonTerminal("Load Key Value from the Key"),
  ),
  Choice(
    0,
    Comment("Load Row Value from default cf"),
  ),
  Sequence(
      NonTerminal("Grpc Response"),
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
      NonTerminal("Grpc Receive"),
  ),
  Choice(
    0,
    Sequence(
      NonTerminal("Get Snapshot From KV Engine Local Read"),
    ),
    Sequence(
      NonTerminal("Get Snapshot From KV Engine Leader Confirm"),
    ),
  ),
  Sequence(
    NonTerminal("Cop Task Wait Schedule"),
  ),
  Sequence(
    NonTerminal("Cop Handler Build"),
  ),
  Sequence(
    NonTerminal("Cop Task Execution"),
  ),
  Choice(
    0,
    NonTerminal("ResultSet To Chunk Format"),
  ),
  Sequence(
      NonTerminal("Grpc Response"),
  ),
)
```

- The snapshot get duration is observed as `tikv_storage_engine_async_request_duration_seconds_bucket{type="snapshot"}` and 
  `tikv_coprocessor_request_wait_seconds{type="snapshot"}`. Also this duration is recorded in the request tracker as `snapshot_wait_time`.
- The cop task has to wait for worker resources and snapshot fetch:
  - The cop task wait schedule duration is observed as `tikv_coprocessor_request_wait_seconds{type="schedule"}`. Also this duration is
    recorded in the request tracker as `schedule_wait_time`.
  - The The cop handler build time is observed as `tikv_coprocessor_request_handler_build_seconds{type="req"}. Also it's recorded in the request 
    tracker as `handler_build_time`.
  - The total wait time is observed as `tikv_coprocessor_request_wait_seconds{type="all"}`
- The cop task execution time is observed as `tikv_coprocessor_request_handle_seconds{type="req"}`. Also is's recorded in the request tracker as 
  `req_lifetime`
  
TODO: Build a detailed model describing the relationship bettween the user perceivable durations and the information recorded in the tracker. Then
it would be straightforward to tell the duration combinations of `cop scheduler`, `task wait`, `io operations like scan`.
  

### Snapshot Fetch

```railroad
Diagram(
  Choice(
    0,
    Sequence(
      NonTerminal("Local Read"),
    ),
    Sequence(
      NonTerminal("Propose Wati"),
       Sequence(
         NonTerminal("Read index Read Wait"),
      ),
    ),
  ),
  Sequence(
      NonTerminal("Fetch A Snapshot From KV Engine"),
  ),
)
```

- The 

## TxnKV Write



