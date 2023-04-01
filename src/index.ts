import { Connection, PublicKey } from '@solana/web3.js';

/**
 * REFERENCES:
 *  - https://www.quicknode.com/guides/solana-development/transactions/how-to-get-transaction-logs-on-solana/
 */

async function main() {
    const address = '4MangoMjqJ2firMokCjjGgoK8d4MXcrgL7XJaL3w6fVg';
    const pubKey = new PublicKey(address);
    // https://solana-labs.github.io/solana-web3.js/classes/Connection.html#constructor
    // Write some code to establish a connection to Solana mainnet via an RPC endpoint, you can use this for
    // free: https://docs.solana.com/cluster /rpc-endpoints#mainnet-beta
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'finalized');

    console.log(`connecting to ${ connection.rpcEndpoint }`);
    const transactions = await connection.getSignaturesForAddress(pubKey, { limit: 10 });
    const firstTransaction = transactions[0];
    // connection.getTransaction()

    connection.onLogs(
        pubKey,
        (logs, ctx) => {
            const { logs: innerLogs } = logs;
            const instructions = innerLogs.filter(
                (log) => log.includes('Instruction')
            );

            console.log('[INFO]', instructions);
        }
    );

// connection.getTransactions()
}

void main();