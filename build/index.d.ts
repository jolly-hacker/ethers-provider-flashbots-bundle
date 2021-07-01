import { BlockTag, TransactionReceipt, TransactionRequest } from '@ethersproject/abstract-provider';
import { Networkish } from '@ethersproject/networks';
import { BaseProvider } from '@ethersproject/providers';
import { ConnectionInfo } from '@ethersproject/web';
import { BigNumber, providers, Signer } from 'ethers';
export declare const DEFAULT_FLASHBOTS_RELAY = "https://relay.flashbots.net";
export declare enum FlashbotsBundleResolution {
    BundleIncluded = 0,
    BlockPassedWithoutInclusion = 1,
    AccountNonceTooHigh = 2
}
export interface FlashbotsBundleRawTransaction {
    signedTransaction: string;
}
export interface FlashbotsBundleTransaction {
    transaction: TransactionRequest;
    signer: Signer;
}
export interface FlashbotsOptions {
    minTimestamp?: number;
    maxTimestamp?: number;
    revertingTxHashes?: Array<string>;
}
export interface TransactionAccountNonce {
    hash: string;
    signedTransaction: string;
    account: string;
    nonce: number;
}
export interface FlashbotsTransactionResponse {
    bundleTransactions: Array<TransactionAccountNonce>;
    wait: () => Promise<FlashbotsBundleResolution>;
    simulate: () => Promise<SimulationResponse>;
    simulateOld: () => Promise<SimulationResponse>;
    receipts: () => Promise<Array<TransactionReceipt>>;
}
export interface TransactionSimulationBase {
    txHash: string;
    gasUsed: number;
}
export interface TransactionSimulationSuccess extends TransactionSimulationBase {
    value: string;
}
export interface TransactionSimulationRevert extends TransactionSimulationBase {
    error: string;
    revert: string;
}
export declare type TransactionSimulation = TransactionSimulationSuccess | TransactionSimulationRevert;
export interface RelayResponseError {
    error: {
        message: string;
        code: number;
    };
}
export interface SimulationResponseSuccess {
    bundleHash: string;
    coinbaseDiff: BigNumber;
    results: Array<TransactionSimulation>;
    totalGasUsed: number;
    firstRevert?: TransactionSimulation;
}
export declare type SimulationResponse = SimulationResponseSuccess | RelayResponseError;
export declare type FlashbotsTransaction = FlashbotsTransactionResponse | RelayResponseError;
export interface GetUserStatsResponseSuccess {
    signing_address: string;
    blocks_won_total: number;
    bundles_submitted_total: number;
    bundles_error_total: number;
    avg_gas_price_gwei: number;
    blocks_won_last_7d: number;
    bundles_submitted_last_7d: number;
    bundles_error_7d: number;
    avg_gas_price_gwei_last_7d: number;
    blocks_won_last_numberd: number;
    bundles_submitted_last_numberd: number;
    bundles_error_numberd: number;
    avg_gas_price_gwei_last_numberd: number;
    blocks_won_last_numberh: number;
    bundles_submitted_last_numberh: number;
    bundles_error_numberh: number;
    avg_gas_price_gwei_last_numberh: number;
    blocks_won_last_5m: number;
    bundles_submitted_last_5m: number;
    bundles_error_5m: number;
    avg_gas_price_gwei_last_5m: number;
}
export declare type GetUserStatsResponse = GetUserStatsResponseSuccess | RelayResponseError;
export declare class FlashbotsBundleProvider extends providers.JsonRpcProvider {
    private genericProvider;
    private authSigner;
    private connectionInfo;
    constructor(genericProvider: BaseProvider, authSigner: Signer, connectionInfoOrUrl: ConnectionInfo, network: Networkish);
    static throttleCallback(): Promise<boolean>;
    static create(genericProvider: BaseProvider, authSigner: Signer, connectionInfoOrUrl?: ConnectionInfo | string, network?: Networkish): Promise<FlashbotsBundleProvider>;
    sendRawBundle(signedBundledTransactions: Array<string>, targetBlockNumber: number, opts?: FlashbotsOptions): Promise<FlashbotsTransaction>;
    sendBundle(bundledTransactions: Array<FlashbotsBundleTransaction | FlashbotsBundleRawTransaction>, targetBlockNumber: number, opts?: FlashbotsOptions): Promise<FlashbotsTransaction>;
    signBundle(bundledTransactions: Array<FlashbotsBundleTransaction | FlashbotsBundleRawTransaction>): Promise<Array<string>>;
    private wait;
    getUserStats(): Promise<GetUserStatsResponse>;
    simulate(signedBundledTransactions: Array<string>, blockTag: BlockTag, stateBlockTag?: BlockTag, blockTimestamp?: number): Promise<SimulationResponse>;
    simulateOld(signedBundledTransactions: Array<string>, blockTag: BlockTag, stateBlockTag?: BlockTag, blockTimestamp?: number): Promise<SimulationResponse>;
    private request;
    private fetchReceipts;
    private prepareBundleRequest;
}
