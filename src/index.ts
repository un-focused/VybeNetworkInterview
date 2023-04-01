import { Connection, GetVersionedTransactionConfig, PublicKey } from '@solana/web3.js';
import { BorshCoder, EventParser, Idl, SystemCoder } from '@coral-xyz/anchor';
import idlJSON from './idl.json';

/**
 * REFERENCES:
 *  - https://www.quicknode.com/guides/solana-development/transactions/how-to-get-transaction-logs-on-solana/
 */

export interface ParsedEvent {
    data: Data;
    name: string;
}

export interface Data {
    mangoGroup: string;
    marketIndex: number;
    longFunding: string;
    shortFunding: string;
    price: string;
    stablePrice: string;
    feesAccrued: string;
    openInterest: string;
    instantaneousFundingRate: string;
}

async function main() {
    const address = '4MangoMjqJ2firMokCjjGgoK8d4MXcrgL7XJaL3w6fVg';
    const pubKey = new PublicKey(address);
    // https://solana-labs.github.io/solana-web3.js/classes/Connection.html#constructor
    // Write some code to establish a connection to Solana mainnet via an RPC endpoint, you can use this for
    // free: https://docs.solana.com/cluster /rpc-endpoints#mainnet-beta
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'finalized');

    console.log(`connecting to ${ connection.rpcEndpoint }`);
    const signatures = await connection.getSignaturesForAddress(pubKey, { limit: 10 });
    // required as per documentation, the default config is deprecated
    const config: GetVersionedTransactionConfig = {
        maxSupportedTransactionVersion: 0
    };

    const transactions = await connection.getTransactions(
        signatures.map(
            item => item.signature
        ),
        config
    );

    const idl: Idl = idlJSON as Idl;
    const parser = new EventParser(pubKey, new BorshCoder(idl));

    for (const transaction of transactions) {
        // console.log(transaction)
        if (!transaction) {
            console.log('[INFO], NULL');
            continue;
        }

        // const logs = transaction.meta?.logMessages?.filter(
        //     (log) => log.includes('Instruction')
        // );
        const logs = transaction.meta?.logMessages;
        if (!logs) {
            console.log('no logs');
            continue;
        }
        console.log(logs);
        // console.log('[INFO]', transaction.meta?.logMessages)
        const gen = parser.parseLogs(logs, false);
        for (const next of gen) {
            const { name, data } = next as ParsedEvent;
            // console.log('[INFO] LOG', JSON.stringify(next));
            console.log(`ITEM: ${ name }: ${ data.feesAccrued }, ${ data.instantaneousFundingRate }, ${ data.longFunding }, ${ data.shortFunding }, ${ data.mangoGroup }, ${ data.openInterest }, ${ data.marketIndex }, ${ data.price }, ${ data.stablePrice }`);

            }
    }

    // connection.onLogs(
    //     pubKey,
    //     (logs, ctx) => {
    //         const { logs: innerLogs } = logs;
    //         const instructions = innerLogs.filter(
    //             (log) => log.includes('Instruction')
    //         );
    //
    //         console.log('[INFO]', instructions);
    //     }
    // );

// connection.getTransactions()
}

void main();