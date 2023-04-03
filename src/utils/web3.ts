import {
    Connection,
    GetVersionedTransactionConfig,
    ConfirmedSignatureInfo
} from '@solana/web3.js';

/**
 * get the transactions for the signatures
 * @param connection to the solana rpc endpoint
 * @param signatures to get transactions from the blockchain
 */
export function getTransactionsForSignatures(connection: Connection, signatures: ConfirmedSignatureInfo[]) {
    // required as per documentation, the default config is deprecated
    const config: GetVersionedTransactionConfig = {
        maxSupportedTransactionVersion: 0
    };

    return connection.getTransactions(
        signatures.map(
            item => item.signature
        ),
        config
    );
}