// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/ChainlinkTelemetryFeed.sol";

contract ChainlinkTelemetryFeedTest is Test {
    ChainlinkTelemetryFeed internal feed;

    address internal owner = address(this);
    address internal reporter = address(0xBEEF);
    bytes32 internal sessionIdHash = keccak256("session-1");

    function setUp() external {
        feed = new ChainlinkTelemetryFeed(reporter);
        assertEq(feed.owner(), owner);
        assertEq(feed.reporter(), reporter);
    }

    function testReporterCanWriteSnapshotAndIntervalClose() external {
        vm.prank(reporter);
        feed.reportSnapshot(sessionIdHash, 300_000, 304_200, 42, 171, 1_710_000_000);

        (
            bool exists,
            uint64 bucketStartMs,
            uint64 sampleElapsedMs,
            uint64 reportedAt,
            uint32 sampleSeq,
            uint32 bpm
        ) = feed.latestSnapshots(sessionIdHash);

        assertTrue(exists);
        assertEq(bucketStartMs, 300_000);
        assertEq(sampleElapsedMs, 304_200);
        assertEq(reportedAt, 1_710_000_000);
        assertEq(sampleSeq, 42);
        assertEq(bpm, 171);

        vm.prank(reporter);
        feed.reportIntervalClose(sessionIdHash, 300_000, 600_000, 599_500, 77, 168, 1_710_000_100);

        (
            bool closeExists,
            uint64 intervalStartMs,
            uint64 intervalEndMs,
            uint64 closeSampleElapsedMs,
            uint64 closeReportedAt,
            uint32 closeSampleSeq,
            uint32 closeBpm
        ) = feed.intervalCloses(sessionIdHash, 300_000);

        assertTrue(closeExists);
        assertEq(intervalStartMs, 300_000);
        assertEq(intervalEndMs, 600_000);
        assertEq(closeSampleElapsedMs, 599_500);
        assertEq(closeReportedAt, 1_710_000_100);
        assertEq(closeSampleSeq, 77);
        assertEq(closeBpm, 168);
        assertEq(feed.getSessionBuckets(sessionIdHash).length, 1);
        assertEq(feed.getSessionIntervals(sessionIdHash).length, 1);
    }

    function testUnauthorizedWriteReverts() external {
        vm.expectRevert(ChainlinkTelemetryFeed.Unauthorized.selector);
        feed.reportSnapshot(sessionIdHash, 0, 0, 1, 80, 1);
    }
}
