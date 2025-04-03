import { stonFiDexCodesV1, stonFiDexCodesV2 } from "@ston-fi/blueprint-utils";
import { Address, Cell, beginCell } from "@ton/core";

/**
 * STON.fi DEX v1 error codes
 */
export const dexV1ErrorCodes = {
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
 * STON.fi DEX v1 transfer exit codes
 */
export const dexV1ExitCodes = {
    swapRefundNoLiqSlippage0Out: 0x5ffe1295,
    swapRefundReserveErr: 0x38976e9b,
    swapOk: 0xc64370e5,
    swapOkRef: 0x45078540,
    burnOk: 0xdda48b6a,
    refundOk: 0xde7dbbc2,
}

/**
 * STON.fi DEX v1 provide lp jetton transfer payload
 * 
 * @param opts.otherTokenAddress - Address of other jetton's Router wallet
 * @param opts.minLpOut - Minimum amount of tokens received 
 * @returns lp provide Cell payload
 */
export function provideLpPayloadV1(opts: {
    otherTokenAddress: Address,
    minLpOut?: bigint | number,
}) {
    return beginCell()
        .storeUint(stonFiDexCodesV1.provideLpDexV1, 32)
        .storeAddress(opts.otherTokenAddress)
        .storeCoins(opts.minLpOut ?? 1n)
        .endCell()
}

/**
 * STON.fi DEX v1 swap jetton transfer payload
 * 
 * @param opts.otherTokenAddress - Address of other jetton's Router wallet
 * @param opts.toAddress - Receiver of the swapped tokens 
 * @param opts.minOut - Minimum amount of tokens received 
 * @param opts.refAddress - Referral address
 * @returns swap Cell payload
 */
export function swapPayloadV1(opts: {
    otherTokenWallet: Address,
    toAddress: Address,
    minOut?: bigint,
    refAddress?: Address,
}) {
    let payload =  beginCell()
        .storeUint(stonFiDexCodesV1.swapDexV1, 32)
        .storeAddress(opts.otherTokenWallet)
        .storeCoins(opts.minOut ?? 1n)
        .storeAddress(opts.toAddress)

    if (opts.refAddress) {
        payload = payload.storeUint(1, 1).storeAddress(opts.refAddress)
    } else {
        payload = payload.storeUint(0, 1)
    }
    return payload.endCell()
}
