// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Parimutuel {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice Zero-seed binary interval markets for live telemetry signals.
/// Participants stake directly into Above/Below pools and winners split the total pool pro-rata.
contract ParimutuelIntervalMarket {
    enum MarketStatus {
        Open,
        Settled,
        Cancelled
    }

    struct Market {
        uint256 id;
        bytes32 sessionIdHash;
        address creator;
        uint64 intervalStartElapsedMs;
        uint64 intervalEndElapsedMs;
        uint64 tradingClosesAtTimestamp;
        uint64 referenceValue;
        uint8 signalType;
        uint64 createdAt;
        MarketStatus status;
        bool settledOutcomeAbove;
        int256 observedValue;
        uint64 settledAt;
        uint64 settledSampleElapsedMs;
        uint32 settledSampleSeq;
        uint256 totalAboveStake;
        uint256 totalBelowStake;
    }

    struct Position {
        uint256 aboveStake;
        uint256 belowStake;
        bool claimed;
    }

    error InvalidMarketParameters();
    error MarketNotOpen();
    error MarketNotSettled();
    error MarketCreationClosed();
    error MarketStillLive();
    error Unauthorized();
    error NothingToClaim();
    error InvalidSettlementPayload();
    error TransferFailed();

    event IntervalMarketCreated(
        uint256 indexed marketId,
        bytes32 indexed sessionIdHash,
        uint8 indexed signalType,
        uint64 intervalStartElapsedMs,
        uint64 intervalEndElapsedMs,
        uint64 tradingClosesAtTimestamp,
        uint64 referenceValue
    );
    event IntervalPositionTaken(
        uint256 indexed marketId,
        address indexed account,
        bool isAbove,
        uint256 collateralIn,
        uint256 totalAboveStake,
        uint256 totalBelowStake
    );
    event IntervalMarketSettled(
        uint256 indexed marketId,
        bool outcomeAbove,
        int256 observedValue,
        uint8 signalType,
        uint32 sampleSeq,
        uint64 sampleElapsedMs
    );
    event Claimed(uint256 indexed marketId, address indexed account, uint256 payoutAmount);

    uint256 public nextMarketId = 1;
    address public owner;
    address public marketOperator;
    address public settlementOperator;
    IERC20Parimutuel public immutable collateralToken;

    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => Position)) public positions;

    constructor(address collateralToken_, address marketOperator_, address settlementOperator_) {
        if (collateralToken_ == address(0) || marketOperator_ == address(0) || settlementOperator_ == address(0)) {
            revert InvalidMarketParameters();
        }
        owner = msg.sender;
        collateralToken = IERC20Parimutuel(collateralToken_);
        marketOperator = marketOperator_;
        settlementOperator = settlementOperator_;
    }

    function createIntervalMarket(
        bytes32 sessionIdHash,
        uint64 intervalStartElapsedMs,
        uint64 intervalEndElapsedMs,
        uint64 tradingClosesAtTimestamp,
        uint64 referenceValue,
        uint8 signalType
    ) external returns (uint256 marketId) {
        if (msg.sender != marketOperator && msg.sender != owner) revert Unauthorized();
        if (
            sessionIdHash == bytes32(0) ||
            intervalEndElapsedMs <= intervalStartElapsedMs ||
            tradingClosesAtTimestamp <= block.timestamp ||
            referenceValue == 0
        ) revert InvalidMarketParameters();

        marketId = nextMarketId++;
        markets[marketId] = Market({
            id: marketId,
            sessionIdHash: sessionIdHash,
            creator: msg.sender,
            intervalStartElapsedMs: intervalStartElapsedMs,
            intervalEndElapsedMs: intervalEndElapsedMs,
            tradingClosesAtTimestamp: tradingClosesAtTimestamp,
            referenceValue: referenceValue,
            signalType: signalType,
            createdAt: uint64(block.timestamp),
            status: MarketStatus.Open,
            settledOutcomeAbove: false,
            observedValue: 0,
            settledAt: 0,
            settledSampleElapsedMs: 0,
            settledSampleSeq: 0,
            totalAboveStake: 0,
            totalBelowStake: 0
        });

        emit IntervalMarketCreated(
            marketId,
            sessionIdHash,
            signalType,
            intervalStartElapsedMs,
            intervalEndElapsedMs,
            tradingClosesAtTimestamp,
            referenceValue
        );
    }

    function takePosition(uint256 marketId, bool isAbove, uint256 collateralIn) external {
        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Open) revert MarketNotOpen();
        if (block.timestamp >= market.tradingClosesAtTimestamp) revert MarketCreationClosed();
        if (collateralIn == 0) revert InvalidMarketParameters();

        _pullCollateral(msg.sender, collateralIn);
        Position storage position = positions[marketId][msg.sender];
        if (isAbove) {
            position.aboveStake += collateralIn;
            market.totalAboveStake += collateralIn;
        } else {
            position.belowStake += collateralIn;
            market.totalBelowStake += collateralIn;
        }

        emit IntervalPositionTaken(
            marketId,
            msg.sender,
            isAbove,
            collateralIn,
            market.totalAboveStake,
            market.totalBelowStake
        );
    }

    function settleIntervalMarket(
        uint256 marketId,
        int256 observedValue,
        uint32 sampleSeq,
        uint64 sampleElapsedMs
    ) external {
        if (msg.sender != settlementOperator) revert Unauthorized();
        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Open) revert MarketNotOpen();
        if (block.timestamp < market.tradingClosesAtTimestamp) revert MarketStillLive();
        if (observedValue < 0) revert InvalidSettlementPayload();

        market.status = MarketStatus.Settled;
        market.observedValue = observedValue;
        market.settledOutcomeAbove = uint256(observedValue) > market.referenceValue;
        market.settledSampleSeq = sampleSeq;
        market.settledSampleElapsedMs = sampleElapsedMs;
        market.settledAt = uint64(block.timestamp);

        emit IntervalMarketSettled(
            marketId,
            market.settledOutcomeAbove,
            observedValue,
            market.signalType,
            sampleSeq,
            sampleElapsedMs
        );
    }

    function claim(uint256 marketId) external returns (uint256 payoutAmount) {
        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Settled) revert MarketNotSettled();

        Position storage position = positions[marketId][msg.sender];
        if (position.claimed) revert NothingToClaim();

        uint256 totalPool = market.totalAboveStake + market.totalBelowStake;
        uint256 winningStake = market.settledOutcomeAbove ? position.aboveStake : position.belowStake;
        uint256 totalWinningStake = market.settledOutcomeAbove ? market.totalAboveStake : market.totalBelowStake;

        if (totalWinningStake == 0) {
            payoutAmount = position.aboveStake + position.belowStake;
            if (payoutAmount == 0) revert NothingToClaim();
        } else {
            if (winningStake == 0) revert NothingToClaim();
            payoutAmount = (totalPool * winningStake) / totalWinningStake;
        }

        position.claimed = true;
        _pushCollateral(msg.sender, payoutAmount);
        emit Claimed(marketId, msg.sender, payoutAmount);
    }

    function totalPool(uint256 marketId) external view returns (uint256) {
        Market storage market = markets[marketId];
        return market.totalAboveStake + market.totalBelowStake;
    }

    function setMarketOperator(address nextOperator) external {
        if (msg.sender != owner) revert Unauthorized();
        if (nextOperator == address(0)) revert InvalidMarketParameters();
        marketOperator = nextOperator;
    }

    function setSettlementOperator(address nextOperator) external {
        if (msg.sender != owner) revert Unauthorized();
        if (nextOperator == address(0)) revert InvalidMarketParameters();
        settlementOperator = nextOperator;
    }

    function _pullCollateral(address from, uint256 amount) internal {
        bool ok = collateralToken.transferFrom(from, address(this), amount);
        if (!ok) revert TransferFailed();
    }

    function _pushCollateral(address to, uint256 amount) internal {
        bool ok = collateralToken.transfer(to, amount);
        if (!ok) revert TransferFailed();
    }
}
