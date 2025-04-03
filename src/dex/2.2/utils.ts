import { stonFiDexCodesV2 } from "@ston-fi/blueprint-utils";
import { Address, Cell, beginCell } from "@ton/core";

/**
 * STON.fi DEX v2.2 error codes
 */
export const dexV2ErrorCodes = {
    noLiquidity: 80,
    zeroOutput: 81,
    invalidCaller: 82,
    insufficientGas: 83,
    wrongWorkchain: 85,
    wrongAddress: 86,
    lowLiquidity: 88,
    mathError: 90,
    invalidAmount: 92,
    invalidCall: 93,
    feeOutRange: 94,
    invalidToken: 95,
    emptyNotAllowed: 96,
    maxInRatio: 97,
    emptyCell: 99,
    wrongOp: 65535
}

/**
 * STON.fi DEX v2.2 transfer exit codes
 */
export const dexV2ExitCodes = {
    swapRefundNoLiq: 0x5ffe1295,
    swapRefundTxExpired: 0x1ec28412,
    swapRefundReserveErr: 0x38976e9b,
    swapRefund0Out: 0x5f954434,
    swapRefundSlippage: 0x39603190,
    swapPoolLocked: 0x365c484d,
    swapFeeOutOfBounds: 0xa768c0d1,
    swapOk: 0xc64370e5,
    burnOk: 0xdda48b6a,
    refundOk: 0xde7dbbc2,
    transferBounceLocked: 0x0a0dbdcb,
    transferBounceInvalidPool: 0x09a8afbf,
    transferBounceWrongWc: 0x720f5b17,
    transferBounceLowGas: 0x8368a711,
    transferBounceInvalidRequest: 0x19727ea8,
    transferBounceTxExpired: 0x0f5681d3,
    provideRefundWrongWorkchain: 0x4e7405a8,
    provideRefundTxExpired: 0xd6a53fd8,
}

/**
 * STON.fi DEX v2.2 provide lp jetton transfer payload
 * 
 * @param opts.otherTokenAddress - Address of other jetton's Router wallet
 * @param opts.minLpOut - Minimum amount of tokens received 
 * @param opts.customPayload - Custom payload that can be sent in `transfer_notification` upon lp tokens mint 
 * @param opts.fwdGas - Amount of TON used to forward `customPayload`
 * @param opts.toAddress - Receiver of the lp tokens
 * @param opts.refundAddress - Receiver of the refund if it occurs
 * @param opts.excessesAddress - Receiver of TON excesses
 * @param opts.bothPositive - If liquidity provision is initiated only if both amounts are non-zero on lp account
 * @param opts.deadline - Unix timestamp until this tx is valid
 * @returns lp provide Cell payload
 */
export function provideLpPayloadV2(opts: {
    otherTokenAddress: Address,
    minLpOut?: bigint | number,
    customPayload?: Cell,
    fwdGas?: bigint,
    toAddress: Address,
    refundAddress: Address,
    excessesAddress?: Address,
    bothPositive?: boolean,
    deadline: number
}) {
    return beginCell()
        .storeUint(stonFiDexCodesV2.provideLpDexV2, 32)
        .storeAddress(opts.otherTokenAddress)
        .storeAddress(opts.refundAddress)
        .storeAddress(opts.excessesAddress ? opts.excessesAddress : opts.refundAddress)
        .storeUint(opts.deadline, 64)
        .storeRef(beginCell()
            .storeCoins(opts.minLpOut ?? 1n)
            .storeAddress(opts.toAddress)
            // is used for old liquidity provision, requires that both token amounts on 
            // lp account are positive before sending a call to pool to mint liquidity
            .storeUint(opts.bothPositive ? 1 : 0, 1)
            .storeCoins(opts.fwdGas ?? 0n)
            .storeMaybeRef(opts.customPayload)
            .endCell())
        .endCell()
}

/**
 * STON.fi DEX v2.2 swap jetton transfer payload
 * 
 * @param opts.otherTokenAddress - Address of other jetton's Router wallet
 * @param opts.toAddress - Receiver of the lp tokens
 * @param opts.minOut - Minimum amount of tokens received 
 * @param opts.fwdGas - Amount of TON used to forward `customPayload`
 * @param opts.customPayload - Custom payload that can be sent in `transfer_notification` upon swap completion
 * @param opts.refundAddress - Receiver of the refund if it occurs
 * @param opts.refundFwdGas - Amount of TON used to forward `refundPayload` on refund
 * @param opts.refundPayload - Custom payload that can be sent in `transfer_notification` upon refund
 * @param opts.excessesAddress - Receiver of TON excesses
 * @param opts.refAddress - Referral address
 * @param opts.refFee - Referral fee in BPS
 * @param opts.deadline - Unix timestamp until this tx is valid
 * @returns lp provide Cell payload
 * 
 * @remarks
 * - `customPayload` can also be used with `cross_swap` payload to chain swaps on the same Router
 * - `fwdGas` is ignored if `cross_swap` payload
 * - max allowed `refFee` is 100 (1%)
 */
export function swapPayloadV2(opts: {
    otherTokenWallet: Address,
    toAddress: Address,
    minOut?: bigint,
    fwdGas?: bigint,
    customPayload?: Cell,
    refundAddress: Address,
    refundFwdGas?: bigint,
    refundPayload?: Cell,
    excessesAddress?: Address,
    refAddress?: Address,
    refFee?: bigint
    deadline: number,
}) {
    return beginCell()
        .storeUint(stonFiDexCodesV2.swapDexV2, 32)
        .storeAddress(opts.otherTokenWallet)
        .storeAddress(opts.refundAddress)
        .storeAddress(opts.excessesAddress ? opts.excessesAddress : opts.refundAddress)
        .storeUint(opts.deadline, 64)
        .storeRef(beginCell()
            .storeCoins(opts.minOut || 1n)
            .storeAddress(opts.toAddress)
            .storeCoins(opts.fwdGas || 0n) // unused if cross-swap payload
            .storeMaybeRef(opts.customPayload)
            .storeCoins(opts.refundFwdGas || 0n) // used if refund occurs
            .storeMaybeRef(opts.refundPayload)  // used if refund occurs
            .storeUint(opts.refFee ?? 10, 16)   // max is 100 (1%)
            .storeAddress(opts.refAddress || null)
            .endCell())
        .endCell()
}

/**
 * STON.fi DEX v2.2 cross-swap jetton transfer payload
 * 
 * @param opts.otherTokenAddress - Address of other jetton's Router wallet
 * @param opts.toAddress - Receiver of the lp tokens
 * @param opts.minOut - Minimum amount of tokens received 
 * @param opts.fwdGas - Amount of TON used to forward `customPayload`
 * @param opts.customPayload - Custom payload that can be sent in `transfer_notification` upon swap completion
 * @param opts.refundAddress - Receiver of the refund if it occurs
 * @param opts.refundFwdGas - Amount of TON used to forward `refundPayload` on refund
 * @param opts.refundPayload - Custom payload that can be sent in `transfer_notification` upon refund
 * @param opts.excessesAddress - Receiver of TON excesses
 * @param opts.refAddress - Referral address
 * @param opts.refFee - Referral fee in BPS
 * @param opts.deadline - Unix timestamp until this tx is valid
 * @returns lp provide Cell payload
 * 
 * @remarks
 * - `customPayload` can also be used with `cross_swap` payload to chain swaps on the same Router
 * - `fwdGas` is ignored if `cross_swap` payload
 * - max allowed `refFee` is 100 (1%)
 */
export function crossSwapPayloadV2(opts: {
    otherTokenWallet: Address,
    toAddress: Address,
    fwdGas?: bigint,
    minOut?: bigint,
    refAddress?: Address,
    refundAddress: Address,
    excessesAddress?: Address,
    customPayload?: Cell,
    refundFwdGas?: bigint,
    deadline: number,
    refFee?: bigint,
    refundPayload?: Cell
}) {
    // use this payload in swapPayload() to chain swaps on the same router
    return beginCell()
        .storeUint(stonFiDexCodesV2.crossSwapDexV2, 32)
        .storeAddress(opts.otherTokenWallet)
        .storeAddress(opts.refundAddress)
        .storeAddress(opts.excessesAddress ? opts.excessesAddress : opts.refundAddress)
        .storeUint(opts.deadline, 64)
        .storeRef(beginCell()
            .storeCoins(opts.minOut || 1n)
            .storeAddress(opts.toAddress)
            .storeCoins(opts.fwdGas || 0n)
            .storeMaybeRef(opts.customPayload)
            .storeCoins(opts.refundFwdGas || 0n)
            .storeMaybeRef(opts.refundPayload)
            .storeUint(opts.refFee ?? 10, 16)
            .storeAddress(opts.refAddress || null)
            .endCell())
        .endCell()
}