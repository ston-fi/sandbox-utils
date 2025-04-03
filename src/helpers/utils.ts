import { buildLibFromCell, codeFromString, jMinterOpcodes, jWalletOpcodes, nftMinterOpcodes, nftOpcodes, SandboxGraph, stdFtOpCodes, stdNftOpCodes, stonFiDexCodesV1, stonFiDexCodesV2, toGraphMap, tvmErrorCodes } from "@ston-fi/blueprint-utils";
import { Address, Cell } from "@ton/core";
import { dexV2ErrorCodes } from "../dex/2.2/utils";

export type CellRecord<T extends Record<string, string>> = { [K in keyof T]: Cell }

export function fromBase64Cells<T extends Record<string, string>>(src: T) {
    let res: Record<string, Cell> = {}
    for (const item in src) {
        res[item] = Cell.fromBase64(src[item])
    }
    return res as CellRecord<T>
}
export function fromHexCells<T extends Record<string, string>>(src: T) {
    let res: Record<string, Cell> = {}
    for (const item in src) {
        res[item] = codeFromString(src[item])
    }
    return res as CellRecord<T>
}

export function buildLibsFromCells<T extends Record<string, Cell>>(src: T) {
    let res: Record<string, Cell> = {}
    for (const item in src) {
        res[item] = buildLibFromCell(src[item])
    }
    return res as T
}
