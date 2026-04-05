// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/CRETelemetryReceiver.sol";

contract CRETelemetryReceiverTest is Test {
    CRETelemetryReceiver internal receiver;

    address internal owner = address(this);
    address internal forwarder = address(0xF0);
    bytes32 internal sessionIdHash = keccak256("session-cre-1");

    function setUp() external {
        receiver = new CRETelemetryReceiver(owner, forwarder);
        assertEq(receiver.owner(), owner);
        assertEq(receiver.forwarder(), forwarder);
    }

    function testForwarderCanWriteSnapshotThroughOnReport() external {
        bytes memory metadata = abi.encode(bytes32("workflow-id"), bytes10("snapshot"), owner);
        bytes memory report = abi.encode(
            sessionIdHash,
            uint64(300_000),
            uint64(304_200),
            uint32(42),
            uint32(171),
            uint32(812),
            uint64(1_710_000_000),
            uint32(3),
            uint32(4215),
            uint32(3875)
        );

        vm.prank(forwarder);
        bytes memory response = receiver.onReport(metadata, report);
        assertEq(abi.decode(response, (bool)), true);

        (
            bool exists,
            uint64 bucketStartMs,
            uint64 sampleElapsedMs,
            uint64 reportedAt,
            uint32 sampleSeq,
            uint32 bpm,
            uint32 rrLatestMs,
            uint32 rrCount,
            uint32 rmssdCentis,
            uint32 sdnnCentis
        ) = receiver.latestSnapshots(sessionIdHash);

        assertTrue(exists);
        assertEq(bucketStartMs, 300_000);
        assertEq(sampleElapsedMs, 304_200);
        assertEq(reportedAt, 1_710_000_000);
        assertEq(sampleSeq, 42);
        assertEq(bpm, 171);
        assertEq(rrLatestMs, 812);
        assertEq(rrCount, 3);
        assertEq(rmssdCentis, 4215);
        assertEq(sdnnCentis, 3875);

        uint64[] memory buckets = receiver.getSessionBuckets(sessionIdHash);
        assertEq(buckets.length, 1);
        assertEq(buckets[0], 300_000);
    }

    function testZeroForwarderAllowsDirectSimulationWrites() external {
        receiver.setForwarder(address(0));
        bytes memory report = abi.encode(sessionIdHash, uint64(0), uint64(500), uint32(1), uint32(80), uint32(750), uint64(10), uint32(0), uint32(0), uint32(0));

        bytes memory response = receiver.onReport("", report);
        assertEq(abi.decode(response, (bool)), true);
    }

    function testUnauthorizedCallerReverts() external {
        bytes memory report = abi.encode(sessionIdHash, uint64(0), uint64(500), uint32(1), uint32(80), uint32(750), uint64(10), uint32(0), uint32(0), uint32(0));

        vm.expectRevert(CRETelemetryReceiver.Unauthorized.selector);
        receiver.onReport("", report);
    }

    function testStaleSnapshotReverts() external {
        receiver.setForwarder(address(0));
        receiver.onReport("", abi.encode(sessionIdHash, uint64(300_000), uint64(304_200), uint32(42), uint32(171), uint32(812), uint64(100), uint32(2), uint32(3100), uint32(2800)));

        vm.expectRevert(CRETelemetryReceiver.StaleSnapshot.selector);
        receiver.onReport("", abi.encode(sessionIdHash, uint64(300_000), uint64(304_100), uint32(41), uint32(170), uint32(808), uint64(99), uint32(2), uint32(3000), uint32(2700)));
    }

    function testSupportsInterfaces() external view {
        assertTrue(receiver.supportsInterface(type(IReceiver).interfaceId));
        assertTrue(receiver.supportsInterface(type(IERC165).interfaceId));
    }
}
