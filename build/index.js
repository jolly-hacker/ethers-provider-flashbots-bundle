"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlashbotsBundleProvider = exports.FlashbotsBundleResolution = exports.DEFAULT_FLASHBOTS_RELAY = void 0;
const web_1 = require("@ethersproject/web");
const ethers_1 = require("ethers");
const utils_1 = require("ethers/lib/utils");
exports.DEFAULT_FLASHBOTS_RELAY = 'https://relay.flashbots.net';
var FlashbotsBundleResolution;
(function (FlashbotsBundleResolution) {
    FlashbotsBundleResolution[FlashbotsBundleResolution["BundleIncluded"] = 0] = "BundleIncluded";
    FlashbotsBundleResolution[FlashbotsBundleResolution["BlockPassedWithoutInclusion"] = 1] = "BlockPassedWithoutInclusion";
    FlashbotsBundleResolution[FlashbotsBundleResolution["AccountNonceTooHigh"] = 2] = "AccountNonceTooHigh";
})(FlashbotsBundleResolution = exports.FlashbotsBundleResolution || (exports.FlashbotsBundleResolution = {}));
const TIMEOUT_MS = 5 * 60 * 1000;
class FlashbotsBundleProvider extends ethers_1.providers.JsonRpcProvider {
    constructor(genericProvider, authSigner, connectionInfoOrUrl, network) {
        super(connectionInfoOrUrl, network);
        this.genericProvider = genericProvider;
        this.authSigner = authSigner;
        this.connectionInfo = connectionInfoOrUrl;
    }
    static async throttleCallback() {
        console.warn('Rate limited');
        return false;
    }
    static async create(genericProvider, authSigner, connectionInfoOrUrl, network) {
        const connectionInfo = typeof connectionInfoOrUrl === 'string' || typeof connectionInfoOrUrl === 'undefined'
            ? {
                url: connectionInfoOrUrl || exports.DEFAULT_FLASHBOTS_RELAY
            }
            : {
                ...connectionInfoOrUrl
            };
        if (connectionInfo.headers === undefined)
            connectionInfo.headers = {};
        connectionInfo.throttleCallback = FlashbotsBundleProvider.throttleCallback;
        const networkish = {
            chainId: 0,
            name: ''
        };
        if (typeof network === 'string') {
            networkish.name = network;
        }
        else if (typeof network === 'number') {
            networkish.chainId = network;
        }
        else if (typeof network === 'object') {
            networkish.name = network.name;
            networkish.chainId = network.chainId;
        }
        if (networkish.chainId === 0) {
            networkish.chainId = (await genericProvider.getNetwork()).chainId;
        }
        return new FlashbotsBundleProvider(genericProvider, authSigner, connectionInfo, networkish);
    }
    async sendRawBundle(signedBundledTransactions, targetBlockNumber, opts) {
        const params = {
            txs: signedBundledTransactions,
            blockNumber: `0x${targetBlockNumber.toString(16)}`,
            minTimestamp: opts === null || opts === void 0 ? void 0 : opts.minTimestamp,
            maxTimestamp: opts === null || opts === void 0 ? void 0 : opts.maxTimestamp,
            revertingTxHashes: opts === null || opts === void 0 ? void 0 : opts.revertingTxHashes
        };
        const request = JSON.stringify(this.prepareBundleRequest('eth_sendBundle', [params]));
        const response = await this.request(request);
        if (response.error !== undefined && response.error !== null) {
            return {
                error: {
                    message: response.error.message,
                    code: response.error.code
                }
            };
        }
        const bundleTransactions = signedBundledTransactions.map((signedTransaction) => {
            const transactionDetails = ethers_1.ethers.utils.parseTransaction(signedTransaction);
            return {
                signedTransaction,
                hash: ethers_1.ethers.utils.keccak256(signedTransaction),
                account: transactionDetails.from || '0x0',
                nonce: transactionDetails.nonce
            };
        });
        return {
            bundleTransactions,
            wait: () => this.wait(bundleTransactions, targetBlockNumber, TIMEOUT_MS),
            simulate: () => this.simulate(bundleTransactions.map((tx) => tx.signedTransaction), targetBlockNumber, undefined, opts === null || opts === void 0 ? void 0 : opts.minTimestamp),
            simulateOld: () => this.simulateOld(bundleTransactions.map((tx) => tx.signedTransaction), targetBlockNumber, undefined, opts === null || opts === void 0 ? void 0 : opts.minTimestamp),
            receipts: () => this.fetchReceipts(bundleTransactions)
        };
    }
    async sendBundle(bundledTransactions, targetBlockNumber, opts) {
        const signedTransactions = await this.signBundle(bundledTransactions);
        return this.sendRawBundle(signedTransactions, targetBlockNumber, opts);
    }
    async signBundle(bundledTransactions) {
        const nonces = {};
        const signedTransactions = new Array();
        for (const tx of bundledTransactions) {
            if ('signedTransaction' in tx) {
                // in case someone is mixing pre-signed and signing transactions, decode to add to nonce object
                const transactionDetails = ethers_1.ethers.utils.parseTransaction(tx.signedTransaction);
                if (transactionDetails.from === undefined)
                    throw new Error('Could not decode signed transaction');
                nonces[transactionDetails.from] = ethers_1.BigNumber.from(transactionDetails.nonce + 1);
                signedTransactions.push(tx.signedTransaction);
                continue;
            }
            const transaction = { ...tx.transaction };
            const address = await tx.signer.getAddress();
            if (typeof transaction.nonce === 'string')
                throw new Error('Bad nonce');
            const nonce = transaction.nonce !== undefined
                ? ethers_1.BigNumber.from(transaction.nonce)
                : nonces[address] || ethers_1.BigNumber.from(await this.genericProvider.getTransactionCount(address, 'latest'));
            nonces[address] = nonce.add(1);
            if (transaction.nonce === undefined)
                transaction.nonce = nonce;
            if (transaction.gasPrice === undefined)
                transaction.gasPrice = ethers_1.BigNumber.from(0);
            if (transaction.gasLimit === undefined)
                transaction.gasLimit = await tx.signer.estimateGas(transaction); // TODO: Add target block number and timestamp when supported by geth
            signedTransactions.push(await tx.signer.signTransaction(transaction));
        }
        return signedTransactions;
    }
    wait(transactionAccountNonces, targetBlockNumber, timeout) {
        return new Promise((resolve, reject) => {
            let timer = null;
            let done = false;
            const minimumNonceByAccount = transactionAccountNonces.reduce((acc, accountNonce) => {
                if (accountNonce.nonce > 0 && (accountNonce.nonce || 0) < acc[accountNonce.account]) {
                    acc[accountNonce.account] = accountNonce.nonce;
                }
                acc[accountNonce.account] = accountNonce.nonce;
                return acc;
            }, {});
            const handler = async (blockNumber) => {
                if (blockNumber < targetBlockNumber) {
                    const noncesValid = await Promise.all(Object.entries(minimumNonceByAccount).map(async ([account, nonce]) => {
                        const transactionCount = await this.genericProvider.getTransactionCount(account);
                        return nonce >= transactionCount;
                    }));
                    const allNoncesValid = noncesValid.every(Boolean);
                    if (allNoncesValid)
                        return;
                    // target block not yet reached, but nonce has become invalid
                    resolve(FlashbotsBundleResolution.AccountNonceTooHigh);
                }
                else {
                    const block = await this.genericProvider.getBlock(targetBlockNumber);
                    // check bundle against block:
                    const blockTransactionsHash = {};
                    for (const bt of block.transactions) {
                        blockTransactionsHash[bt] = true;
                    }
                    const bundleIncluded = transactionAccountNonces.every((transaction) => blockTransactionsHash[transaction.hash] === true);
                    resolve(bundleIncluded ? FlashbotsBundleResolution.BundleIncluded : FlashbotsBundleResolution.BlockPassedWithoutInclusion);
                }
                if (timer) {
                    clearTimeout(timer);
                }
                if (done) {
                    return;
                }
                done = true;
                this.genericProvider.removeListener('block', handler);
            };
            this.genericProvider.on('block', handler);
            if (typeof timeout === 'number' && timeout > 0) {
                timer = setTimeout(() => {
                    if (done) {
                        return;
                    }
                    timer = null;
                    done = true;
                    this.genericProvider.removeListener('block', handler);
                    reject('Timed out');
                }, timeout);
                if (timer.unref) {
                    timer.unref();
                }
            }
        });
    }
    async getUserStats() {
        const blockDetails = await this.genericProvider.getBlock('latest');
        const evmBlockNumber = `0x${blockDetails.number.toString(16)}`;
        const params = [evmBlockNumber];
        const request = JSON.stringify(this.prepareBundleRequest('flashbots_getUserStats', params));
        const response = await this.request(request);
        if (response.error !== undefined && response.error !== null) {
            return {
                error: {
                    message: response.error.message,
                    code: response.error.code
                }
            };
        }
        return response.result;
    }
    async simulate(signedBundledTransactions, blockTag, stateBlockTag, blockTimestamp) {
        let evmBlockNumber;
        if (typeof blockTag === 'number') {
            evmBlockNumber = `0x${blockTag.toString(16)}`;
        }
        else {
            const blockTagDetails = await this.genericProvider.getBlock(blockTag);
            const blockDetails = blockTagDetails !== null ? blockTagDetails : await this.genericProvider.getBlock('latest');
            evmBlockNumber = `0x${blockDetails.number.toString(16)}`;
        }
        let evmBlockStateNumber;
        if (typeof stateBlockTag === 'number') {
            evmBlockStateNumber = `0x${stateBlockTag.toString(16)}`;
        }
        else if (!stateBlockTag) {
            evmBlockStateNumber = 'latest';
        }
        else {
            evmBlockStateNumber = stateBlockTag;
        }
        const params = [
            { txs: signedBundledTransactions, blockNumber: evmBlockNumber, stateBlockNumber: evmBlockStateNumber, timestamp: blockTimestamp }
        ];
        const request = JSON.stringify(this.prepareBundleRequest('eth_callBundle', params));
        const response = await this.request(request);
        if (response.error !== undefined && response.error !== null) {
            return {
                error: {
                    message: response.error.message,
                    code: response.error.code
                }
            };
        }
        const callResult = response.result;
        return {
            bundleHash: callResult.bundleHash,
            coinbaseDiff: ethers_1.BigNumber.from(callResult.coinbaseDiff),
            results: callResult.results,
            totalGasUsed: callResult.results.reduce((a, b) => a + b.gasUsed, 0),
            firstRevert: callResult.results.find((txSim) => 'revert' in txSim)
        };
    }
    async simulateOld(signedBundledTransactions, blockTag, stateBlockTag, blockTimestamp) {
        let evmBlockNumber;
        if (typeof blockTag === 'number') {
            evmBlockNumber = `0x${blockTag.toString(16)}`;
        }
        else {
            const blockTagDetails = await this.genericProvider.getBlock(blockTag);
            const blockDetails = blockTagDetails !== null ? blockTagDetails : await this.genericProvider.getBlock('latest');
            evmBlockNumber = `0x${blockDetails.number.toString(16)}`;
        }
        let evmBlockStateNumber;
        if (typeof stateBlockTag === 'number') {
            evmBlockStateNumber = `0x${stateBlockTag.toString(16)}`;
        }
        else if (!stateBlockTag) {
            evmBlockStateNumber = 'latest';
        }
        else {
            evmBlockStateNumber = stateBlockTag;
        }
        const params = [signedBundledTransactions, evmBlockNumber, evmBlockStateNumber, '0x8595Dd9e0438640b5E1254f9DF579aC12a86865F'];
        const request = JSON.stringify(this.prepareBundleRequest('eth_callBundle', params));
        const response = await this.request(request);
        if (response.error !== undefined && response.error !== null) {
            return {
                error: {
                    message: response.error.message,
                    code: response.error.code
                }
            };
        }
        const callResult = response.result;
        return {
            bundleHash: callResult.bundleHash,
            coinbaseDiff: ethers_1.BigNumber.from(callResult.coinbaseDiff),
            results: callResult.results,
            totalGasUsed: callResult.results.reduce((a, b) => a + b.gasUsed, 0),
            firstRevert: callResult.results.find((txSim) => 'revert' in txSim)
        };
    }
    async request(request) {
        const connectionInfo = { ...this.connectionInfo };
        connectionInfo.headers = {
            'X-Flashbots-Signature': `${await this.authSigner.getAddress()}:${await this.authSigner.signMessage(utils_1.id(request))}`,
            ...this.connectionInfo.headers
        };
        return web_1.fetchJson(connectionInfo, request);
    }
    async fetchReceipts(bundledTransactions) {
        return Promise.all(bundledTransactions.map((bundledTransaction) => this.genericProvider.getTransactionReceipt(bundledTransaction.hash)));
    }
    prepareBundleRequest(method, params) {
        return {
            method: method,
            params: params,
            id: this._nextId++,
            jsonrpc: '2.0'
        };
    }
}
exports.FlashbotsBundleProvider = FlashbotsBundleProvider;
//# sourceMappingURL=index.js.map