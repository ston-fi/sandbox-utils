import { Address, beginCell, Cell, ContractProvider, Sender, SendMode } from "@ton/core";
import { beginMessage, CommonContractBase, emptyCell, HOLE_ADDRESS, JettonMinterContractBase, jMinterOpcodes, stonFiDexCodesV1 } from "@ston-fi/blueprint-utils";


/**
 * Router DEX v1 storage config
 */
export type ConfigRouterV1 = {
    isLocked: boolean;
    adminAddress: Address;
    lpWalletCode: Cell;
    poolCode: Cell;
    lpAccountCode: Cell;
};

export function configToCellRouterV1(config: ConfigRouterV1): Cell {
    return beginCell()
        .storeUint(config.isLocked ? 1 : 0, 1)
        .storeAddress(config.adminAddress)
        .storeRef(config.lpWalletCode)
        .storeRef(config.poolCode)
        .storeRef(config.lpAccountCode)
        .storeRef(beginCell()
            .storeUint(0n, 64)
            .storeUint(0n, 64)
            .storeAddress(HOLE_ADDRESS)
            .storeRef(emptyCell())
        .endCell())
        .endCell();
}

export class RouterV1 extends CommonContractBase {
    static createFromConfig(config: ConfigRouterV1, code: Cell, workchain = 0) {
        return this.createFromConfigBase(config, configToCellRouterV1, code, workchain)
    }

    async getRouterData(provider: ContractProvider) {
        const result = await provider.get('get_router_data', []);

        let res1 = {
            isLocked: result.stack.readBoolean(),
            adminAddress: result.stack.readAddress(),
            tmpUpgradeCache: result.stack.readCell(),
            poolCode: result.stack.readCell(),
            jettonLPWalletCode: result.stack.readCell(),
            lpAccountCode: result.stack.readCell(),
        }
        let sc = res1.tmpUpgradeCache.beginParse()
        let res2 = {
            endCode: sc.loadUintBig(64),
            endAdmin: sc.loadUintBig(64),
            pendingNewAdmin: sc.loadMaybeAddress(),
            pendingCode: sc.loadRef()
        }
        return {
            ...res1,
            ...res2
        }
    }

    async getPoolAddress(provider: ContractProvider, opts: {
        jettonWallet1: Address;
        jettonWallet2: Address;
    }) {
        const result = await provider.get('get_pool_address', [
            { type: 'slice', cell: beginCell().storeAddress(opts.jettonWallet1).endCell() },
            { type: 'slice', cell: beginCell().storeAddress(opts.jettonWallet2).endCell() },
        ]);
        return result.stack.readAddress();
    }
}

export class PoolV1 extends JettonMinterContractBase<typeof jMinterOpcodes> {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell; }) {
        super(jMinterOpcodes, address, init)
    }

    async getLPAccountAddress(provider: ContractProvider, userAddress: Address) {
        const result = await provider.get('get_lp_account_address', [
            { type: 'slice', cell: beginCell().storeAddress(userAddress).endCell() },
        ]);
        return result.stack.readAddress();
    }

    /**
     * Pool data, returns default data on error (all addresses are `HOLE`) 
     */
    async getPoolData(provider: ContractProvider) {
        let res = {
            leftReserve: 0n,
            rightReserve: 0n,
            leftJettonAddress: HOLE_ADDRESS,
            rightJettonAddress: HOLE_ADDRESS,
            lpFee: 0,
            protocolFee: 0,
            refFee: 0,
            protocolFeeAddress: HOLE_ADDRESS as Address | null,
            collectedToken0ProtocolFee: 0n,
            collectedToken1ProtocolFee: 0n,
        }
        try {
            const result = await provider.get('get_pool_data', []);

            let common = {
                leftReserve: result.stack.readBigNumber(),
                rightReserve: result.stack.readBigNumber(),
                leftJettonAddress: result.stack.readAddress(),
                rightJettonAddress: result.stack.readAddress(),
                lpFee: result.stack.readNumber(),
                protocolFee: result.stack.readNumber(),
                refFee: result.stack.readNumber(),
                protocolFeeAddress: result.stack.readAddress(),
                collectedToken0ProtocolFee: result.stack.readBigNumber(),
                collectedToken1ProtocolFee: result.stack.readBigNumber(),
            }
            
            res = {
                ...common,
            }
        } catch {}
        return res
    }
}

export class LPAccountV1 extends CommonContractBase {
    async sendRefundMe(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value: value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginMessage(stonFiDexCodesV1.refundMeDexV1)
                .endCell(),
        });
    }
    
    /**
     * Lp account data, returns default data on error (all addresses are `HOLE`) 
     */
    async getLPAccountData(provider: ContractProvider) {
        try {
            const result = await provider.get('get_lp_account_data', []);
            return {
                userAddress: result.stack.readAddress(),
                poolAddress: result.stack.readAddress(),
                leftAmount: result.stack.readBigNumber(),
                rightAmount: result.stack.readBigNumber(),
            };
        } catch {
            return {
                userAddress: HOLE_ADDRESS,
                poolAddress: HOLE_ADDRESS,
                leftAmount: 0n,
                rightAmount: 0n,
            }
        }
    }
}
