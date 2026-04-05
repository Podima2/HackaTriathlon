// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Onchain storage contract for official telemetry written by Chainlink CRE.
/// CRE can call the write methods directly through an authorized reporter/forwarder.
contract ChainlinkTelemetryFeed {
    struct SnapshotPoint {
        bool exists;
        uint64 bucketStartMs;
        uint64 sampleElapsedMs;
        uint64 reportedAt;
        uint32 sampleSeq;
        uint32 bpm;
    }

    struct IntervalClosePoint {
        bool exists;
        uint64 intervalStartMs;
        uint64 intervalEndMs;
        uint64 sampleElapsedMs;
        uint64 reportedAt;
        uint32 sampleSeq;
        uint32 closeBpm;
    }

    error Unauthorized();
    error InvalidInput();

    event ReporterUpdated(address indexed reporter);
    event SnapshotReported(
        bytes32 indexed sessionIdHash,
        uint64 indexed bucketStartMs,
        uint32 bpm,
        uint32 sampleSeq,
        uint64 sampleElapsedMs,
        uint64 reportedAt
    );
    event IntervalCloseReported(
        bytes32 indexed sessionIdHash,
        uint64 indexed intervalStartMs,
        uint64 intervalEndMs,
        uint32 closeBpm,
        uint32 sampleSeq,
        uint64 sampleElapsedMs,
        uint64 reportedAt
    );

    address public owner;
    address public reporter;

    mapping(bytes32 => SnapshotPoint) public latestSnapshots;
    mapping(bytes32 => mapping(uint64 => SnapshotPoint)) public snapshotsByBucket;
    mapping(bytes32 => mapping(uint64 => IntervalClosePoint)) public intervalCloses;
    mapping(bytes32 => uint64[]) private sessionBuckets;
    mapping(bytes32 => uint64[]) private sessionIntervals;
    mapping(bytes32 => mapping(uint64 => bool)) private knownBuckets;
    mapping(bytes32 => mapping(uint64 => bool)) private knownIntervals;

    constructor(address reporter_) {
        if (reporter_ == address(0)) revert InvalidInput();
        owner = msg.sender;
        reporter = reporter_;
        emit ReporterUpdated(reporter_);
    }

    modifier onlyReporter() {
        if (msg.sender != reporter) revert Unauthorized();
        _;
    }

    function setReporter(address nextReporter) external {
        if (msg.sender != owner) revert Unauthorized();
        if (nextReporter == address(0)) revert InvalidInput();
        reporter = nextReporter;
        emit ReporterUpdated(nextReporter);
    }

    function reportSnapshot(
        bytes32 sessionIdHash,
        uint64 bucketStartMs,
        uint64 sampleElapsedMs,
        uint32 sampleSeq,
        uint32 bpm,
        uint64 reportedAt
    ) external onlyReporter {
        if (sessionIdHash == bytes32(0) || bpm == 0) revert InvalidInput();
        if (sampleElapsedMs < bucketStartMs) revert InvalidInput();

        SnapshotPoint memory point = SnapshotPoint({
            exists: true,
            bucketStartMs: bucketStartMs,
            sampleElapsedMs: sampleElapsedMs,
            reportedAt: reportedAt,
            sampleSeq: sampleSeq,
            bpm: bpm
        });

        snapshotsByBucket[sessionIdHash][bucketStartMs] = point;
        latestSnapshots[sessionIdHash] = point;
        if (!knownBuckets[sessionIdHash][bucketStartMs]) {
            knownBuckets[sessionIdHash][bucketStartMs] = true;
            sessionBuckets[sessionIdHash].push(bucketStartMs);
        }

        emit SnapshotReported(sessionIdHash, bucketStartMs, bpm, sampleSeq, sampleElapsedMs, reportedAt);
    }

    function reportIntervalClose(
        bytes32 sessionIdHash,
        uint64 intervalStartMs,
        uint64 intervalEndMs,
        uint64 sampleElapsedMs,
        uint32 sampleSeq,
        uint32 closeBpm,
        uint64 reportedAt
    ) external onlyReporter {
        if (sessionIdHash == bytes32(0) || closeBpm == 0) revert InvalidInput();
        if (intervalEndMs <= intervalStartMs || sampleElapsedMs > intervalEndMs) revert InvalidInput();

        IntervalClosePoint memory point = IntervalClosePoint({
            exists: true,
            intervalStartMs: intervalStartMs,
            intervalEndMs: intervalEndMs,
            sampleElapsedMs: sampleElapsedMs,
            reportedAt: reportedAt,
            sampleSeq: sampleSeq,
            closeBpm: closeBpm
        });

        intervalCloses[sessionIdHash][intervalStartMs] = point;
        if (!knownIntervals[sessionIdHash][intervalStartMs]) {
            knownIntervals[sessionIdHash][intervalStartMs] = true;
            sessionIntervals[sessionIdHash].push(intervalStartMs);
        }

        emit IntervalCloseReported(
            sessionIdHash,
            intervalStartMs,
            intervalEndMs,
            closeBpm,
            sampleSeq,
            sampleElapsedMs,
            reportedAt
        );
    }

    function getSessionBuckets(bytes32 sessionIdHash) external view returns (uint64[] memory) {
        return sessionBuckets[sessionIdHash];
    }

    function getSessionIntervals(bytes32 sessionIdHash) external view returns (uint64[] memory) {
        return sessionIntervals[sessionIdHash];
    }
}
