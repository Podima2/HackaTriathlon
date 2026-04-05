// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @notice MVP contract focused on binary threshold markets over live telemetry signals.
/// Numeric markets should remain offchain until a discrete payout model is chosen.
contract PredictionMarket {
    enum ThresholdDirection {
        Over,
        Under
    }

    enum MarketStatus {
        Open,
        Closed,
        SettlementRequested,
        Settled,
        Cancelled
    }

    struct Market {
        uint256 id;
        bytes32 sessionIdHash;
        address creator;
        uint64 t;
        uint64 tradingClosesAtElapsedMs;
        uint64 thresholdValue;
        ThresholdDirection thresholdDirection;
        uint8 signalType;
        uint64 createdAt;
        MarketStatus status;
        bool settledBooleanOutcome;
        int256 observedValue;
        uint64 settledSampleElapsedMs;
        uint32 settledSampleSeq;
        uint256 yesPool;
        uint256 noPool;
        uint256 totalLiquidity;
    }

    struct Position {
        uint256 yesShares;
        uint256 noShares;
        bool claimed;
    }

    error InvalidMarketTimes();
    error InvalidMarketParameters();
    error MarketNotOpen();
    error MarketNotClosable();
    error MarketNotSettlementReady();
    error MarketAlreadySettled();
    error InvalidSettlementPayload();
    error NothingToClaim();
    error InsufficientLiquidity();
    error Unauthorized();
    error TransferFailed();

    event MarketCreated(
        uint256 indexed marketId,
        bytes32 indexed sessionIdHash,
        address indexed creator,
        uint64 t,
        uint64 tradingClosesAtElapsedMs,
        uint64 thresholdValue,
        ThresholdDirection thresholdDirection,
        uint8 signalType,
        uint256 seedLiquidity
    );
    event LiquidityAdded(uint256 indexed marketId, address indexed provider, uint256 amount, uint256 yesPool, uint256 noPool);
    event PositionTaken(
        uint256 indexed marketId,
        address indexed account,
        bool isYes,
        uint256 collateralIn,
        uint256 sharesOut,
        uint256 yesPriceE18,
        uint256 noPriceE18
    );
    event MarketClosed(uint256 indexed marketId);
    event SettlementRequested(uint256 indexed marketId);
    event MarketSettled(
        uint256 indexed marketId,
        bool booleanOutcome,
        int256 observedValue,
        uint8 signalType,
        uint32 sampleSeq,
        uint64 sampleElapsedMs
    );
    event Claimed(uint256 indexed marketId, address indexed account, uint256 payoutAmount);

    uint256 public nextMarketId = 1;
    address public owner;
    address public settlementOperator;
    IERC20 public immutable collateralToken;
    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => Position)) public positions;
    mapping(uint256 => uint256) public totalYesShares;
    mapping(uint256 => uint256) public totalNoShares;

    constructor(address collateralToken_, address settlementOperator_) {
        if (collateralToken_ == address(0) || settlementOperator_ == address(0)) revert InvalidMarketParameters();
        owner = msg.sender;
        collateralToken = IERC20(collateralToken_);
        settlementOperator = settlementOperator_;
    }

    function createThresholdMarket(
        bytes32 sessionIdHash,
        uint64 t,
        uint64 tradingClosesAtElapsedMs,
        uint64 thresholdValue,
        ThresholdDirection thresholdDirection,
        uint8 signalType,
        uint256 seedLiquidity
    ) external returns (uint256 marketId) {
        if (t == 0 || tradingClosesAtElapsedMs > t) revert InvalidMarketTimes();
        if (thresholdValue == 0 || seedLiquidity == 0) revert InvalidMarketParameters();
        _pullCollateral(msg.sender, seedLiquidity);

        marketId = nextMarketId++;
        uint256 balancedPool = seedLiquidity / 2;
        if (balancedPool == 0) revert InvalidMarketParameters();

        markets[marketId] = Market({
            id: marketId,
            sessionIdHash: sessionIdHash,
            creator: msg.sender,
            t: t,
            tradingClosesAtElapsedMs: tradingClosesAtElapsedMs,
            thresholdValue: thresholdValue,
            thresholdDirection: thresholdDirection,
            signalType: signalType,
            createdAt: uint64(block.timestamp),
            status: MarketStatus.Open,
            settledBooleanOutcome: false,
            observedValue: 0,
            settledSampleElapsedMs: 0,
            settledSampleSeq: 0,
            yesPool: balancedPool,
            noPool: seedLiquidity - balancedPool,
            totalLiquidity: seedLiquidity
        });

        emit MarketCreated(
            marketId,
            sessionIdHash,
            msg.sender,
            t,
            tradingClosesAtElapsedMs,
            thresholdValue,
            thresholdDirection,
            signalType,
            seedLiquidity
        );
    }

    function addLiquidity(uint256 marketId, uint256 amount) external {
        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Open) revert MarketNotOpen();
        if (amount == 0) revert InvalidMarketParameters();
        _pullCollateral(msg.sender, amount);

        uint256 yesAdd = (amount * market.yesPool) / market.totalLiquidity;
        uint256 noAdd = amount - yesAdd;
        market.yesPool += yesAdd;
        market.noPool += noAdd;
        market.totalLiquidity += amount;

        emit LiquidityAdded(marketId, msg.sender, amount, market.yesPool, market.noPool);
    }

    /// @notice Buy YES or NO shares using a simple dynamic-price AMM approximation.
    /// @dev `collateralIn` is treated as abstract testnet collateral units for the MVP.
    function takePosition(uint256 marketId, bool isYes, uint256 collateralIn) external returns (uint256 sharesOut) {
        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Open) revert MarketNotOpen();
        if (collateralIn == 0) revert InvalidMarketParameters();
        if (market.yesPool == 0 || market.noPool == 0) revert InsufficientLiquidity();
        _pullCollateral(msg.sender, collateralIn);

        uint256 invariant = market.yesPool * market.noPool;
        if (isYes) {
            uint256 newNoPool = market.noPool + collateralIn;
            uint256 newYesPool = invariant / newNoPool;
            sharesOut = market.yesPool - newYesPool;
            market.noPool = newNoPool;
            market.yesPool = newYesPool;
            positions[marketId][msg.sender].yesShares += sharesOut;
            totalYesShares[marketId] += sharesOut;
        } else {
            uint256 newYesPool = market.yesPool + collateralIn;
            uint256 newNoPool = invariant / newYesPool;
            sharesOut = market.noPool - newNoPool;
            market.yesPool = newYesPool;
            market.noPool = newNoPool;
            positions[marketId][msg.sender].noShares += sharesOut;
            totalNoShares[marketId] += sharesOut;
        }

        emit PositionTaken(
            marketId,
            msg.sender,
            isYes,
            collateralIn,
            sharesOut,
            yesPriceE18(marketId),
            noPriceE18(marketId)
        );
    }

    function closeMarket(uint256 marketId) external {
        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Open) revert MarketNotClosable();
        market.status = MarketStatus.Closed;
        emit MarketClosed(marketId);
    }

    function requestSettlement(uint256 marketId) external {
        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Closed) revert MarketNotSettlementReady();
        market.status = MarketStatus.SettlementRequested;
        emit SettlementRequested(marketId);
    }

    /// @notice Intended to be called by the oracle/CRE settlement path.
    function fulfillSettlement(
        uint256 marketId,
        bool booleanOutcome,
        int256 observedValue,
        uint32 sampleSeq,
        uint64 sampleElapsedMs
    ) external {
        if (msg.sender != settlementOperator) revert Unauthorized();
        Market storage market = markets[marketId];
        if (market.status == MarketStatus.Settled) revert MarketAlreadySettled();
        if (market.status != MarketStatus.SettlementRequested) revert MarketNotSettlementReady();
        if (observedValue <= 0) revert InvalidSettlementPayload();

        market.status = MarketStatus.Settled;
        market.settledBooleanOutcome = booleanOutcome;
        market.observedValue = observedValue;
        market.settledSampleSeq = sampleSeq;
        market.settledSampleElapsedMs = sampleElapsedMs;

        emit MarketSettled(marketId, booleanOutcome, observedValue, market.signalType, sampleSeq, sampleElapsedMs);
    }

    function claim(uint256 marketId) external returns (uint256 payoutAmount) {
        Market storage market = markets[marketId];
        if (market.status != MarketStatus.Settled) revert MarketNotSettlementReady();

        Position storage position = positions[marketId][msg.sender];
        if (position.claimed) revert NothingToClaim();

        uint256 winningShares = market.settledBooleanOutcome ? position.yesShares : position.noShares;
        if (winningShares == 0) revert NothingToClaim();

        uint256 totalWinningShares = market.settledBooleanOutcome ? totalYesShares[marketId] : totalNoShares[marketId];
        if (totalWinningShares == 0) revert InvalidSettlementPayload();

        uint256 totalCollateral = market.yesPool + market.noPool;
        payoutAmount = (totalCollateral * winningShares) / totalWinningShares;
        position.claimed = true;
        _pushCollateral(msg.sender, payoutAmount);

        emit Claimed(marketId, msg.sender, payoutAmount);
    }

    function setSettlementOperator(address nextOperator) external {
        if (msg.sender != owner) revert Unauthorized();
        if (nextOperator == address(0)) revert InvalidMarketParameters();
        settlementOperator = nextOperator;
    }

    function settlementSpec(uint256 marketId)
        external
        view
        returns (
            bytes32 sessionIdHash,
            uint64 t,
            uint64 thresholdValue,
            ThresholdDirection thresholdDirection,
            uint8 signalType
        )
    {
        Market storage market = markets[marketId];
        return (
            market.sessionIdHash,
            market.t,
            market.thresholdValue,
            market.thresholdDirection,
            market.signalType
        );
    }

    function yesPriceE18(uint256 marketId) public view returns (uint256) {
        Market storage market = markets[marketId];
        uint256 totalPool = market.yesPool + market.noPool;
        if (totalPool == 0) return 0.5e18;
        return (market.noPool * 1e18) / totalPool;
    }

    function noPriceE18(uint256 marketId) public view returns (uint256) {
        Market storage market = markets[marketId];
        uint256 totalPool = market.yesPool + market.noPool;
        if (totalPool == 0) return 0.5e18;
        return (market.yesPool * 1e18) / totalPool;
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
