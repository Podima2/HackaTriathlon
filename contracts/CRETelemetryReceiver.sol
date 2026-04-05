// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

/// @notice Minimal CRE-compatible consumer interface for onchain report delivery.
/// @dev Chainlink's forwarder calls `onReport(metadata, report)` on consumer contracts.
interface IReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external returns (bytes memory);
}

/// @notice Stores official telemetry snapshots delivered through CRE-style reports.
/// @dev `metadata` is accepted for compatibility with CRE and emitted for audit, but the
///      workflow payload lives entirely in `report` for this MVP.
contract CRETelemetryReceiver is IReceiver {
    struct SnapshotPoint {
        bool exists;
        uint64 bucketStartMs;
        uint64 sampleElapsedMs;
        uint64 reportedAt;
        uint32 sampleSeq;
        uint32 bpm;
        uint32 rrLatestMs;
        uint32 rrCount;
        uint32 rmssdCentis;
        uint32 sdnnCentis;
    }

    error Unauthorized();
    error InvalidInput();
    error StaleSnapshot();

    event OwnerUpdated(address indexed owner);
    event ForwarderUpdated(address indexed forwarder);
    event ReportAccepted(
        bytes32 indexed sessionIdHash,
        uint64 indexed bucketStartMs,
        uint32 bpm,
        uint32 sampleSeq,
        uint32 rrLatestMs,
        uint32 rrCount,
        uint32 rmssdCentis,
        uint32 sdnnCentis
    );
    event ReportMetadata(bytes metadata);

    address public owner;
    address public forwarder;

    mapping(bytes32 => SnapshotPoint) public latestSnapshots;
    mapping(bytes32 => mapping(uint64 => SnapshotPoint)) public snapshotsByBucket;
    mapping(bytes32 => uint64[]) private sessionBuckets;
    mapping(bytes32 => mapping(uint64 => bool)) private knownBuckets;

    constructor(address owner_, address forwarder_) {
        if (owner_ == address(0)) revert InvalidInput();
        owner = owner_;
        forwarder = forwarder_;

        emit OwnerUpdated(owner_);
        emit ForwarderUpdated(forwarder_);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    /// @notice Update the forwarder allowed to deliver CRE reports.
    /// @dev Set to zero to disable sender-gating during local simulation.
    function setForwarder(address nextForwarder) external onlyOwner {
        forwarder = nextForwarder;
        emit ForwarderUpdated(nextForwarder);
    }

    function setOwner(address nextOwner) external onlyOwner {
        if (nextOwner == address(0)) revert InvalidInput();
        owner = nextOwner;
        emit OwnerUpdated(nextOwner);
    }

    /// @inheritdoc IReceiver
    function onReport(bytes calldata metadata, bytes calldata report) external returns (bytes memory) {
        if (forwarder != address(0) && msg.sender != forwarder) revert Unauthorized();

        (
            bytes32 sessionIdHash,
            uint64 bucketStartMs,
            uint64 sampleElapsedMs,
            uint32 sampleSeq,
            uint32 bpm,
            uint32 rrLatestMs,
            uint64 reportedAt,
            uint32 rrCount,
            uint32 rmssdCentis,
            uint32 sdnnCentis
        ) = abi.decode(report, (bytes32, uint64, uint64, uint32, uint32, uint32, uint64, uint32, uint32, uint32));

        if (sessionIdHash == bytes32(0) || bpm == 0) revert InvalidInput();
        if (sampleElapsedMs < bucketStartMs) revert InvalidInput();

        SnapshotPoint memory currentLatest = latestSnapshots[sessionIdHash];
        if (
            currentLatest.exists &&
            sampleElapsedMs < currentLatest.sampleElapsedMs
        ) revert StaleSnapshot();

        SnapshotPoint memory point = SnapshotPoint({
            exists: true,
            bucketStartMs: bucketStartMs,
            sampleElapsedMs: sampleElapsedMs,
            reportedAt: reportedAt,
            sampleSeq: sampleSeq,
            bpm: bpm,
            rrLatestMs: rrLatestMs,
            rrCount: rrCount,
            rmssdCentis: rmssdCentis,
            sdnnCentis: sdnnCentis
        });

        latestSnapshots[sessionIdHash] = point;
        snapshotsByBucket[sessionIdHash][bucketStartMs] = point;
        if (!knownBuckets[sessionIdHash][bucketStartMs]) {
            knownBuckets[sessionIdHash][bucketStartMs] = true;
            sessionBuckets[sessionIdHash].push(bucketStartMs);
        }

        emit ReportMetadata(metadata);
        emit ReportAccepted(sessionIdHash, bucketStartMs, bpm, sampleSeq, rrLatestMs, rrCount, rmssdCentis, sdnnCentis);
        return abi.encode(true);
    }

    function getSessionBuckets(bytes32 sessionIdHash) external view returns (uint64[] memory) {
        return sessionBuckets[sessionIdHash];
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
