import { AddressMap, BracketKeysType, DEFAULT_JETTON_MINTER_CODE, DEFAULT_JETTON_WALLET_CODE, getWalletBalance, HOLE_ADDRESS, JettonContent, JettonMinterContract, JettonWalletContract, jMinterOpcodes, jWalletOpcodes, maxBigint, metadataCell, nftMinterOpcodes, nftOpcodes, nowSec, onchainMetadata, PTonMinterV1, PTonWalletV1, SandboxGraph, stdFtOpCodes, stdNftOpCodes, stonFiDexCodesV1, toGraphMap, tvmErrorCodes } from '@ston-fi/blueprint-utils';
import { expectBounced, expectEqAddress, expectNotBounced, getWalletContract } from '@ston-fi/blueprint-utils/dist/src/test-helpers';
import { Address, toNano } from '@ton/core';
import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import '@ton/test-utils';
import 'dotenv/config';
import { CELLS_DEX_V1, dexV1ErrorCodes, dexV1ExitCodes, LPAccountV1, PoolV1, provideLpPayloadV1, RouterV1, swapPayloadV1 } from "../src/dex/1.0";

const details = true;
const graph = new SandboxGraph({
    folder: "graph/dexV1/",
    opMap: toGraphMap({
        ...nftMinterOpcodes,
        ...stdFtOpCodes,
        ...stdNftOpCodes,
        ...nftOpcodes,
        ...jWalletOpcodes,
        ...jMinterOpcodes,
        ...stonFiDexCodesV1,
        ...dexV1ExitCodes,
    }),
    errMap: toGraphMap({
        ...tvmErrorCodes,
        ...stonFiDexCodesV1,
        ...dexV1ErrorCodes
    }),
    hideOkValues: true,
    displayValue: details,
    displayDetails: details,
    displayExitCode: details,
    displayFees: details,
    displayActionResult: details,
    displayAborted: details,
    displayDeploy: true,
    displayDestroyed: true,
    directionType: "bidirectional",
    chartType: "LR",
});


// @ts-ignore
BigInt.prototype.toJSON = function () { return this.toString(); };

type SBCtrTreasury = SandboxContract<TreasuryContract>;
type SBCtrRouter = SandboxContract<RouterV1>;
type SBCtrPool = SandboxContract<PoolV1>;
type SBCtrLPAccount = SandboxContract<LPAccountV1>;
type SBCtrJettonMinter = SandboxContract<JettonMinterContract>;
type SBCtrJettonWallet = SandboxContract<JettonWalletContract>;

type DeployJettonParams = {
    router?: SBCtrRouter,
    name: string,
    mintAmount?: bigint;
};

type SetupParams = {
    mintAmount?: bigint,
    createPool?: {
        name1?: string,
        name2?: string,
        amount1: bigint,
        amount2: bigint,
        debugGraph?: string,
        expectBounce1?: boolean,
        expectRefund1?: boolean,
        expectBounce2?: boolean,
        expectRefund2?: boolean,
    },
};

type SetupResult = {
    router: SBCtrRouter,
    token1: SBCtrJettonMinter,
    token2: SBCtrJettonMinter,
    pool?: SBCtrPool;
};

type CreatePoolParams = {
    sender?: SBCtrTreasury,
    router: SBCtrRouter,
    token1: SBCtrJettonMinter,
    token2: SBCtrJettonMinter,
    amount1: bigint,
    amount2: bigint,
    minLpOut?: bigint,
    debugGraph?: string,
    expectBounce1?: boolean,
    expectRefund1?: boolean,
    expectBounce2?: boolean,
    expectRefund2?: boolean,
    gas?: bigint,
    fwdGas?: bigint,
};

type MintParams = {
    token: SBCtrJettonMinter,
    to: Address | SBCtrTreasury,
    mintAmount?: bigint;
};

type SwapParams = {
    sender?: SBCtrTreasury,
    router: SBCtrRouter,
    tokenIn: SBCtrJettonMinter,
    tokenOut: SBCtrJettonMinter,
    amountIn: bigint,
    debugGraph?: string,
    expectBounce?: boolean,
    expectRefund?: boolean,
    gas?: bigint,
    fwdGas?: bigint,
    referral?: SBCtrTreasury,
    minAmountOut?: bigint,
};

type SwapResult = {
    routerWalletIn: SBCtrJettonWallet,
    routerWalletOut: SBCtrJettonWallet,
    senderWalletIn: SBCtrJettonWallet,
    senderWalletOut: SBCtrJettonWallet,
};

describe('Router v1.0', () => {
    let deployJetton: (params: DeployJettonParams) => Promise<SBCtrJettonMinter>,
        createPool: (params: CreatePoolParams) => Promise<SBCtrPool>,
        mintTokens: (params: MintParams) => Promise<void>,
        swap: (params: SwapParams) => Promise<SwapResult>,
        setupDex: (params: SetupParams) => Promise<SetupResult>;

    let bc: Blockchain,
        deployer: SBCtrTreasury,
        alice: SBCtrTreasury,
        bob: SBCtrTreasury,
        initTimestamp = nowSec(),
        bracketMap: AddressMap<BracketKeysType> = new AddressMap(),
        addressMap: AddressMap<string> = new AddressMap();

    const code = CELLS_DEX_V1;

    beforeAll(async () => {

        mintTokens = async (params: MintParams) => {
            let toAddress = params.to instanceof Address ? params.to : params.to.address;
            let depositAmount = params.mintAmount ?? toNano(100000);
            let oldBalance = await getWalletBalance(await getWalletContract(bc, params.token, toAddress));
            let msgResult = await params.token.sendMint(deployer.getSender(), {
                value: toNano(2),
                toAddress: toAddress,
                fwdAmount: toNano(1),
                masterMsg: {
                    jettonAmount: depositAmount,
                    jettonMinterAddress: params.token.address,
                    responseAddress: toAddress
                }
            });
            expectNotBounced(msgResult.events);
            let balance = await getWalletBalance(await getWalletContract(bc, params.token, toAddress));
            expect(balance).toEqual(oldBalance + depositAmount);
        };

        deployJetton = async (params: DeployJettonParams) => {
            const minter = bc.openContract(JettonMinterContract.createFromConfig({
                totalSupply: 0,
                adminAddress: deployer.address,
                content: metadataCell(onchainMetadata({
                    name: params.name,
                })),
                jettonWalletCode: DEFAULT_JETTON_WALLET_CODE
            }, DEFAULT_JETTON_MINTER_CODE));

            try {
                await minter.getJettonData();
            } catch {
                let msgResult = await minter.sendDeploy(deployer.getSender(), toNano('0.05'));
                expect(msgResult.transactions).toHaveTransaction({
                    from: deployer.address,
                    to: minter.address,
                    deploy: true,
                });
            }

            if (params.mintAmount) {
                await mintTokens({
                    to: deployer,
                    token: minter,
                    mintAmount: params.mintAmount
                });
                await mintTokens({
                    to: alice,
                    token: minter,
                    mintAmount: params.mintAmount
                });
                await mintTokens({
                    to: bob,
                    token: minter,
                    mintAmount: params.mintAmount
                });
            }

            addressMap.set(minter.address, `Jetton Minter<br/>${params.name}`);
            addressMap.set((await minter.getWalletAddress(deployer.address)), `Deployer<br/>${params.name}<br/>Wallet`);
            addressMap.set((await minter.getWalletAddress(alice.address)), `Alice<br/>${params.name}<br/>Wallet`);
            addressMap.set((await minter.getWalletAddress(bob.address)), `Bob<br/>${params.name}<br/>Wallet`);
            addressMap.set((await minter.getWalletAddress(HOLE_ADDRESS)), `Hole<br/>${params.name}<br/>Wallet`);
            if (params.router) {
                const routerId = 0;
                addressMap.set((await minter.getWalletAddress(params.router.address)), `Router${routerId}<br/>${params.name}<br/>Wallet`);
            }

            return minter;
        };

        setupDex = async (params: SetupParams) => {
            params.mintAmount = typeof params.mintAmount === "undefined" ? toNano(100000) : params.mintAmount;
            if (params.createPool)
                params.mintAmount = params.mintAmount < maxBigint(params.createPool?.amount1, params.createPool?.amount2)
                    ? maxBigint(params.createPool?.amount1, params.createPool?.amount2) * 2n : params.mintAmount;

            const routerId = 0;
            let router = bc.openContract(RouterV1.createFromConfig({
                isLocked: false,
                adminAddress: deployer.address,
                lpAccountCode: code.lpAccount,
                lpWalletCode: code.lpWallet,
                poolCode: code.pool,
            }, code.router));

            let msgResult = await router.sendDeploy(deployer.getSender(), toNano('5'));
            expect(msgResult.transactions).toHaveTransaction({
                from: deployer.address,
                to: router.address,
                deploy: true,
            });
            addressMap.set(router, `Router${routerId}`);
            bracketMap.set(router, "diamond");
            let jetton1 = await deployJetton({
                name: params.createPool?.name1 ?? "Token1",
                router: router,
                mintAmount: params.mintAmount
            });
            let jetton2 = await deployJetton({
                name: params.createPool?.name2 ?? "Token2",
                router: router,
                mintAmount: params.mintAmount
            });

            let pool: SBCtrPool | undefined = undefined;
            if (params.createPool) {
                pool = await createPool({
                    router: router,
                    token1: jetton1,
                    token2: jetton2,
                    ...params.createPool,
                });
            }
            return {
                router: router,
                token1: jetton1,
                token2: jetton2,
                pool: pool
            };
        };

        createPool = async (params: CreatePoolParams) => {
            let router = params.router;
            let sender = params.sender ?? deployer;
            let routerWallet1 = await getWalletContract(bc, params.token1, router.address);
            let routerWallet2 = await getWalletContract(bc, params.token2, router.address);

            const routerId = 0;
            let pool = bc.openContract(PoolV1.createFromAddress(await router.getPoolAddress({
                jettonWallet1: routerWallet1.address,
                jettonWallet2: routerWallet2.address
            })));

            let name1 = ((await params.token1.getJettonData()).content as JettonContent).name;
            let name2 = ((await params.token2.getJettonData()).content as JettonContent).name;
            addressMap.set(pool, `Pool${routerId}<br/>${name1}-${name2}`);
            bracketMap.set(pool, "rounded");

            // first token
            let wallet1 = await getWalletContract(bc, params.token1, sender);
            let oldBalance1 = await getWalletBalance(wallet1);

            let msgResult = await wallet1.sendTransfer(sender.getSender(), {
                value: params.gas ?? toNano(2),
                jettonAmount: params.amount1,
                toAddress: router.address,
                responseAddress: sender.address,
                fwdAmount: params.fwdGas ?? toNano("1"),
                fwdPayload: provideLpPayloadV1({
                    otherTokenAddress: routerWallet2.address,
                    minLpOut: 0n,
                })
            });

            if (params.debugGraph) {
                graph.render(msgResult, params.debugGraph + "_1", {
                    addressMap: addressMap,
                    bracketMap: bracketMap,
                });
            }
            if (params.expectBounce1 || params.expectRefund1) {
                if (params.expectBounce1) {
                    expectBounced(msgResult.events);
                } else {
                    expectNotBounced(msgResult.events);
                }

                let balance = await getWalletBalance(wallet1);
                if (params.expectRefund1)
                    expect(balance).toEqual(oldBalance1);
            } else {
                expectNotBounced(msgResult.events);
                let balance = await getWalletBalance(wallet1);
                expect(balance).toEqual(oldBalance1 - params.amount1);
            }

            addressMap.set((await pool.getLPAccountAddress(deployer.address)), `Deployer<br/>${name1}-${name2}<br/>Lp Account${routerId}`);
            addressMap.set((await pool.getLPAccountAddress(alice.address)), `Alice<br/>${name1}-${name2}<br/>Lp Account${routerId}`);
            addressMap.set((await pool.getLPAccountAddress(bob.address)), `Bob<br/>${name1}-${name2}<br/>Lp Account${routerId}`);
            addressMap.set((await pool.getWalletAddress(deployer.address)), `Deployer<br/>${name1}-${name2}<br/>Lp Wallet${routerId}`);
            addressMap.set((await pool.getWalletAddress(alice.address)), `Alice<br/>${name1}-${name2}<br/>Lp Wallet${routerId}`);
            addressMap.set((await pool.getWalletAddress(bob.address)), `Bob<br/>${name1}-${name2}<br/>Lp Wallet${routerId}`);
            addressMap.set((await pool.getWalletAddress(HOLE_ADDRESS)), `Hole<br/>${name1}-${name2}<br/>Lp Wallet${routerId}`);

            bracketMap.set((await pool.getLPAccountAddress(deployer.address)), "sub");
            bracketMap.set((await pool.getLPAccountAddress(alice.address)), "sub");
            bracketMap.set((await pool.getLPAccountAddress(bob.address)), "sub");

            // second token
            let wallet2 = await getWalletContract(bc, params.token2, sender);
            let oldBalance2 = await getWalletBalance(wallet2);
            msgResult = await wallet2.sendTransfer(sender.getSender(), {
                value: BigInt(params.gas ?? toNano(2)),
                jettonAmount: params.amount2,
                toAddress: router.address,
                responseAddress: sender.address,
                fwdAmount: params.fwdGas ?? toNano("1"),
                fwdPayload: provideLpPayloadV1({
                    otherTokenAddress: routerWallet1.address,
                    minLpOut: 1n,
                })
            });

            if (params.debugGraph) {
                graph.render(msgResult, params.debugGraph + "_2", {
                    addressMap: addressMap,
                    bracketMap: bracketMap,
                });
            }

            if (params.expectBounce2 || params.expectRefund2) {
                if (params.expectBounce2) {
                    expectBounced(msgResult.events);
                } else {
                    expectNotBounced(msgResult.events);
                }

                let balance = await getWalletBalance(wallet2);
                if (params.expectRefund2)
                    expect(balance).toEqual(oldBalance2);
            } else {
                expectNotBounced(msgResult.events);
                let balance = await getWalletBalance(wallet2);
                expect(balance).toEqual(oldBalance2 - params.amount2);

                let poolData = await pool.getPoolData();
                expect(poolData.leftReserve).toEqual(poolData.leftJettonAddress.equals(routerWallet1.address) ? params.amount1 : params.amount2);
                expect(poolData.rightReserve).toEqual(poolData.rightJettonAddress.equals(routerWallet1.address) ? params.amount1 : params.amount2);
                expect((await pool.getJettonData()).totalSupply).toBeGreaterThan(0n);
            }

            return pool;
        };

        swap = async (params: SwapParams) => {
            let router = params.router;
            let sender = params.sender ?? deployer;

            let routerWalletIn = await getWalletContract(bc, params.tokenIn, router.address);
            let routerWalletOut = await getWalletContract(bc, params.tokenOut, router.address);

            let pool = bc.openContract(PoolV1.createFromAddress(await router.getPoolAddress({
                jettonWallet1: routerWalletIn.address,
                jettonWallet2: routerWalletOut.address
            })));

            let oldPoolData = await pool.getPoolData();
            let oldPoolJData = await pool.getJettonData();

            params.minAmountOut = params.minAmountOut ?? 1n;

            let walletIn = await getWalletContract(bc, params.tokenIn, sender.address);
            let walletOut = await getWalletContract(bc, params.tokenOut, sender.address);
            let oldBalanceIn = await getWalletBalance(walletIn);
            let oldBalanceOut = await getWalletBalance(walletOut);
            let msgResult = await walletIn.sendTransfer(sender.getSender(), {
                value: params.gas ?? toNano(2),
                jettonAmount: params.amountIn,
                toAddress: router.address,
                responseAddress: sender.address,
                fwdAmount: params.fwdGas ?? toNano("1"),
                fwdPayload: swapPayloadV1({
                    otherTokenWallet: routerWalletOut.address,
                    toAddress: sender.address,
                    minOut: params.minAmountOut ?? 1n,
                    refAddress: params.referral?.address,
                }),
            });
            if (params.debugGraph) {
                graph.render(msgResult, params.debugGraph, {
                    addressMap: addressMap,
                    bracketMap: bracketMap,
                });
            }

            if (params.expectBounce || params.expectRefund) {
                if (params.expectBounce) {
                    expectBounced(msgResult.events);
                } else {
                    expectNotBounced(msgResult.events);
                }
                let balance = await getWalletBalance(walletIn);
                expect(balance).toEqual(oldBalanceIn - BigInt(params.amountIn));
                balance = await getWalletBalance(walletOut);
                expect(balance).toBeGreaterThanOrEqual(oldBalanceOut + params.minAmountOut);
            } else {
                expectNotBounced(msgResult.events);
                let balance = await getWalletBalance(walletIn);
                expect(balance).toEqual(oldBalanceIn - BigInt(params.amountIn));
                balance = await getWalletBalance(walletOut);
                expect(balance).toBeGreaterThanOrEqual(oldBalanceOut + params.minAmountOut);
                expect(msgResult.transactions).toHaveTransaction({
                    from: routerWalletOut.address,
                    to: walletOut.address,
                });

            }
            return {
                routerWalletIn: routerWalletIn,
                routerWalletOut: routerWalletOut,
                senderWalletIn: walletIn,
                senderWalletOut: walletOut,
            };
        };
    });

    beforeEach(async () => {
        bc = await Blockchain.create();
        bc.recordStorage = true;

        deployer = await bc.treasury('deployer');
        alice = await bc.treasury('alice');
        bob = await bc.treasury('bob');

        addressMap.set(deployer, "Deployer");
        addressMap.set(alice, "Alice");
        addressMap.set(bob, "Bob");
        bracketMap.set(deployer, "circle");
        bracketMap.set(alice, "circle");
        bracketMap.set(bob, "circle");

    });

    describe('Basic functions', () => {
        it('should deploy dex', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(1000),
                    amount2: toNano(2000),
                    debugGraph: "lp"
                }
            });

            let data = await setup.router.getRouterData();
            expectEqAddress(data.adminAddress, deployer);
        });

        it('should swap', async () => {
            let setup = await setupDex({
                createPool: {
                    amount1: toNano(1000),
                    amount2: toNano(2000),
                }
            });

            await swap({
                router: setup.router,
                tokenIn: setup.token1,
                tokenOut: setup.token2,
                amountIn: toNano(2),
                debugGraph: "swap",
                referral: alice,
            });
        });
    });

    describe('With pTON v1', () => {
        it('should create pool and swap', async () => {
            let setup = await setupDex({});
            const routerWalletAddress = await setup.token1.getWalletAddress(setup.router.address);
            const userWalletAddress = await setup.token1.getWalletAddress(deployer.address);
            const userWallet = bc.openContract(JettonWalletContract.createFromAddress(userWalletAddress));

            // deploy pton wallet for router
            const ptonMinter = bc.openContract(PTonMinterV1.createFromConfig());
            await ptonMinter.sendDeploy(deployer.getSender(), toNano('0.05'));
            const ptonWalletAddress = await ptonMinter.getWalletAddress(setup.router.address);
            addressMap.set(ptonWalletAddress, `Router<br/>pTON v1<br/>Wallet`);
            const ptonWallet = bc.openContract(PTonWalletV1.createFromAddress(ptonWalletAddress));
            let msgResult = await ptonMinter.sendDeployWallet(deployer.getSender(), {
                ownerAddress: setup.router.address
            }, toNano(2));
            expectNotBounced(msgResult.events);

            const poolAddress = await setup.router.getPoolAddress({
                jettonWallet1: ptonWalletAddress,
                jettonWallet2: routerWalletAddress,
            });
            const pool = bc.openContract(PoolV1.createFromAddress(poolAddress));
            addressMap.set(poolAddress, `Pool<br/>Token1-pTON`);

            // ton transfer
            let amount = toNano(100);
            const gas = toNano(1);
            msgResult = await ptonWallet.sendTransfer(deployer.getSender(), {
                value: amount + gas,
                jettonAmount: 0n, // ignored by contract
                toAddress: setup.router.address, // ignored by contract
                responseAddress: deployer.address, // ignored by contract
                fwdAmount: gas,
                fwdPayload: provideLpPayloadV1({
                    otherTokenAddress: routerWalletAddress,
                    minLpOut: 0n,
                })
            });
            expectNotBounced(msgResult.events);
            graph.render(msgResult, "with_pton_create_pool_ton", {
                addressMap: addressMap,
                bracketMap: bracketMap,
            });

            // token transfer
            msgResult = await userWallet.sendTransfer(deployer.getSender(), {
                jettonAmount: toNano(200),
                toAddress: setup.router.address,
                responseAddress: deployer.address,
                fwdAmount: toNano(1),
                fwdPayload: provideLpPayloadV1({
                    otherTokenAddress: ptonWalletAddress,
                    minLpOut: 1n,
                })
            }, toNano(2));
            expectNotBounced(msgResult.events);
            graph.render(msgResult, "with_pton_create_pool_jetton", {
                addressMap: addressMap,
                bracketMap: bracketMap,
            });

            const data = await pool.getJettonData();
            expect(data.totalSupply).toBeGreaterThan(0n);

            // jetton -> ton swap
            msgResult = await userWallet.sendTransfer(deployer.getSender(), {
                jettonAmount: toNano(2),
                toAddress: setup.router.address,
                responseAddress: deployer.address,
                fwdAmount: toNano(1),
                fwdPayload: swapPayloadV1({
                    otherTokenWallet: ptonWalletAddress,
                    toAddress: deployer.address,
                    minOut: 1n,
                }),
            }, toNano(2));
            expectNotBounced(msgResult.events);
            graph.render(msgResult, "with_pton_swap_jetton", {
                addressMap: addressMap,
                bracketMap: bracketMap,
            });

            // ton -> jetton swap
            amount = toNano(2);
            msgResult = await ptonWallet.sendTransfer(deployer.getSender(), {
                value: amount + gas,
                jettonAmount: 0n, // ignored by contract
                toAddress: setup.router.address, // ignored by contract
                responseAddress: deployer.address, // ignored by contract
                fwdAmount: gas,
                fwdPayload: swapPayloadV1({
                    otherTokenWallet: routerWalletAddress,
                    toAddress: deployer.address,
                    minOut: 1n,
                }),
            });
            expectNotBounced(msgResult.events);
            graph.render(msgResult, "with_pton_swap_ton", {
                addressMap: addressMap,
                bracketMap: bracketMap,
            });
        });
    });
});