import { Address, beginCell, Cell, ContractProvider, Sender, SendMode } from "@ton/core";
import { beginMessage, CommonContractBase, emptyCell, HOLE_ADDRESS, JettonMinterContractBase, jMinterOpcodes, stonFiDexCodesV2 } from "@ston-fi/blueprint-utils";


/**
 * CPI Router DEX v2.2 storage config
 */
export type ConfigCPIRouterV2 = {
    id?: number;
    isLocked: boolean;
    adminAddress: Address;
    lpWalletCode: Cell;
    poolCode: Cell;
    lpAccountCode: Cell;
    vaultCode: Cell;
    upgradePoolCode?: Cell;
};

export function configToCellCPIRouterV2(config: ConfigCPIRouterV2): Cell {
    return beginCell()
        .storeUint(config.isLocked ? 1 : 0, 1)
        .storeAddress(config.adminAddress)
        .storeRef(beginCell()
            .storeUint(0n, 64)
            .storeUint(0n, 64)
            .storeUint(0n, 64)
            .storeAddress(null)
            .storeRef(emptyCell())
            .storeRef(emptyCell())
            .endCell())
        .storeRef(beginCell()
            .storeUint(config.id ?? 0, 64)
            .storeRef(config.lpWalletCode)
            .storeRef(config.poolCode)
            .storeRef(config.lpAccountCode)
            .storeRef(config.vaultCode)
            .endCell())
        .storeRef(config.upgradePoolCode ?? emptyCell())
        .endCell();
}

export class CPIRouterV2 extends CommonContractBase {
    static createFromConfig(config: ConfigCPIRouterV2, code: Cell, workchain = 0) {
        return this.createFromConfigBase(config, configToCellCPIRouterV2, code, workchain)
    }

    async getRouterData(provider: ContractProvider) {
        const result = await provider.get('get_router_data', []);

        let res1 = {
            id: result.stack.readNumber(),
            type: result.stack.readString(),
            isLocked: result.stack.readBoolean(),
            adminAddress: result.stack.readAddress(),
            tmpUpgradeCache: result.stack.readCell(),
            poolCode: result.stack.readCell(),
            jettonLPWalletCode: result.stack.readCell(),
            lpAccountCode: result.stack.readCell()
        };

        let sc = res1.tmpUpgradeCache.beginParse()
        let res2 = {
            endCode: sc.loadUintBig(64),
            endAdmin: sc.loadUintBig(64),
            endPool: sc.loadUintBig(64),
            pendingNewAdmin: sc.loadMaybeAddress(),
            pendingCode: sc.loadRef(),
            pendingPoolCode: sc.loadRef()
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

    async getVaultAddress(provider: ContractProvider, opts: {
        userAddress: Address;
        tokenWalletAddress: Address;
    }) {
        const result = await provider.get('get_vault_address', [
            { type: 'slice', cell: beginCell().storeAddress(opts.userAddress).endCell() },
            { type: 'slice', cell: beginCell().storeAddress(opts.tokenWalletAddress).endCell() },
        ]);
        return result.stack.readAddress();
    }

    async getRouterVersion(provider: ContractProvider) {
        const result = await provider.get('get_router_version', []);
        return {
            major: result.stack.readNumber(),
            minor: result.stack.readNumber(),
            dev: result.stack.readString(),
        };
    }
}

export class CPIPoolV2 extends JettonMinterContractBase<typeof jMinterOpcodes> {
    constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell; }) {
        super(jMinterOpcodes, address, init)
    }

    async getLPAccountAddress(provider: ContractProvider, userAddress: Address) {
        const result = await provider.get('get_lp_account_address', [
            { type: 'slice', cell: beginCell().storeAddress(userAddress).endCell() },
        ]);
        return result.stack.readAddress();
    }

    async getPoolType(provider: ContractProvider) {
        const result = await provider.get('get_pool_type', []);
        return result.stack.readString()
    }

    /**
     * Pool data, returns default data on error (type: "undefined")
     */
    async getPoolData(provider: ContractProvider) {
        let res = {
            type: "undefined",
            isLocked: false,
            routerAddress: HOLE_ADDRESS,
            totalSupplyLP: 0n,
            leftReserve: 0n,
            rightReserve: 0n,
            leftJettonAddress: HOLE_ADDRESS,
            rightJettonAddress: HOLE_ADDRESS,
            lpFee: 0,
            protocolFee: 0,
            protocolFeeAddress: HOLE_ADDRESS as Address | null,
            collectedToken0ProtocolFee: 0n,
            collectedToken1ProtocolFee: 0n,
        }
        try {
            const result = await provider.get('get_pool_data', []);
            const poolType = await this.getPoolType(provider)

            let common = {
                type: poolType,
                isLocked: result.stack.readBoolean(),
                routerAddress: result.stack.readAddress(),
                totalSupplyLP: result.stack.readBigNumber(),
                leftReserve: result.stack.readBigNumber(),
                rightReserve: result.stack.readBigNumber(),
                leftJettonAddress: result.stack.readAddress(),
                rightJettonAddress: result.stack.readAddress(),
                lpFee: result.stack.readNumber(),
                protocolFee: result.stack.readNumber(),
                protocolFeeAddress: result.stack.readAddressOpt(),
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

export class LPAccountV2 extends CommonContractBase {
    async sendRefundMe(provider: ContractProvider, via: Sender, opts: {
        leftMaybePayload?: Cell;
        rightMaybePayload?: Cell;
    }, value: bigint) {
        await provider.internal(via, {
            value: value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginMessage(stonFiDexCodesV2.refundMeDexV2)
                .storeMaybeRef(opts.leftMaybePayload)
                .storeMaybeRef(opts.rightMaybePayload)
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

export class VaultV2 extends CommonContractBase {

    async sendWithdrawFee(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value: value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginMessage(stonFiDexCodesV2.withdrawFeeDexV2)
                .endCell(),
        });
    }

    /**
     * Vault data, returns default data on error (all addresses are `HOLE`) 
     */
    async getVaultData(provider: ContractProvider) {
        try {
            const result = await provider.get('get_vault_data', []);
            return {
                ownerAddress: result.stack.readAddress(),
                tokenAddress: result.stack.readAddress(),
                routerAddress: result.stack.readAddress(),
                depositedAmount: result.stack.readBigNumber(),
            };
        } catch {
            return {
                ownerAddress: HOLE_ADDRESS,
                tokenAddress: HOLE_ADDRESS,
                routerAddress: HOLE_ADDRESS,
                depositedAmount: 0n,
            };
        }
    }
}