# STON.fi Sandbox Utils
[![TON](https://img.shields.io/badge/based%20on-TON-blue)](https://ton.org/) [![License](https://img.shields.io/badge/license-MIT-brightgreen)](https://opensource.org/licenses/MIT)

A collection of helpers to work with DEX contracts in sandbox

## Installation

To install this package use

```bash
npm install -D @ston-fi/sandbox-utils
```

or via yarn

```bash
yarn add @ston-fi/sandbox-utils
```
## Usage

Check tests in the repository for a more in-depth example

### DEX v1

```ts
import { CELLS_DEX_V1, dexV1ErrorCodes, dexV1ExitCodes, LPAccountV1, PoolV1, provideLpPayloadV1, RouterV1, swapPayloadV1 } from "@ston-fi/sandbox-utils";

// setup graph for mapping transactions
const graph = new SandboxGraph({
    folder: "graph/dexV1/",
    opMap: toGraphMap({
        ...stdFtOpCodes,
        ...stdNftOpCodes,
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
});

// dex source code
const code = CELLS_DEX_V1;

// sandbox
bc = await Blockchain.create();

// router instance
let router = bc.openContract(RouterV1.createFromConfig({
    isLocked: false,
    adminAddress: deployer.address,
    lpAccountCode: code.lpAccount,
    lpWalletCode: code.lpWallet,
    poolCode: code.pool,
}, code.router));
let msgResult = await router.sendDeploy(deployer.getSender(), toNano('5'));

...

// lp provide
let msgResult = await userTokenWalletIn.sendTransfer(sender.getSender(), {
    jettonAmount: toNano(123),
    toAddress: router.address,
    responseAddress: sender.address,
    fwdAmount: toNano(1),
    fwdPayload: provideLpPayloadV1({
        otherTokenAddress: routerTokenWalletOut.address,
        minLpOut: 1n,
    })
}, toNano(2));

...

// swap
msgResult = await userTokenWalletIn.sendTransfer(sender.getSender(), {
    value: toNano(2),
    jettonAmount: amountIn,
    toAddress: router.address,
    responseAddress: sender.address,
    fwdAmount: toNano("1"),
    fwdPayload: swapPayloadV1({
        otherTokenWallet: routerTokenWalletOut.address,
        toAddress: sender.address,
        minOut: 1n,
    }),
});
// graph swap tx
graph.render(msgResult, "swap", {
    addressMap: addressMap,
    bracketMap: bracketMap,
});
...
```

### DEX v2

The difference from DEX v1 is in the usage of libraries in masterchain, so to accurately simulate correct TON fee amounts the same libraries should be used in Sandbox

```ts
...
const code = buildLibsFromCells(CELLS_DEX_V2_2);
const myLibs = buildLibs(CELLS_DEX_V2_2);
bc = await Blockchain.create();
bc.libs = myLibs;
...
```