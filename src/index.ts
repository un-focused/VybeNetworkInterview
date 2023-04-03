import {
    Connection, PublicKey, TransactionConfirmationStatus
} from '@solana/web3.js';

// VN Prefix is used to indicate VybeNetworks

import {
    BorshCoder,
    EventParser, Idl
} from '@coral-xyz/anchor';
import {
    IdlEvent
} from '@coral-xyz/anchor/dist/cjs/idl';
import {
    MAIN_NET_SOLANA_RPC_ENDPOINT, MAIN_NET_SOLANA_RPC_POLL_MS,
    MAIN_NET_SOLANA_RPC_RATE_LIMIT,
    MANGO_V4_IDL,
    MANGO_V4_PUBLIC_KEY
} from './constants';
import { parseEvent } from './utils/event';
import { getTransactionsForSignatures } from './utils/web3';
import { formatDate } from './utils/format';
import { setupIdlTools } from './utils/idl';
import { Event as VNEvent } from './types/event';

interface Transaction {
    confirmationStatus: TransactionConfirmationStatus;
    blockTime: number;
    signature: string;
    events: VNEvent[];
}

/**
 * REFERENCES:
 *  - https://www.quicknode.com/guides/solana-development/accounts-and-data/how-to-deserialize-account-data-on-solana/
 *  - https://www.quicknode.com/guides/solana-development/transactions/how-to-get-transaction-logs-on-solana/
 *  - https://app.mango.markets/stats
 */
async function runner(connection: Connection, publicKey: PublicKey, idl: Idl, eventMap: Map<string, IdlEvent>,
                      signatureMap: Map<string, boolean>) {
    const signatures = await connection.getSignaturesForAddress(
        publicKey,
        {
            limit: MAIN_NET_SOLANA_RPC_RATE_LIMIT
        }
    );

    const vnTransactions: Transaction[] = [];

    // filter signatures as to not get the same data twice
    const newSignatures = signatures.filter(
        ({ signature }) => !signatureMap.get(signature)
    );

    // nothing to query!!, early return
    if (newSignatures.length === 0) {
        return;
    }

    // get associated transactions for signatures
    const transactions = await getTransactionsForSignatures(connection, newSignatures);
    // create the event parser for the logs
    const { parser: eventParser } = setupIdlTools(publicKey, idl);

    // iterate through each transaction
    for (let i = 0; i < transactions.length; ++i) {
        const transaction = transactions[i];
        const { blockTime, signature, confirmationStatus } = signatures[i];
        // if there is no transaction, then there is nothing to do
        if (!transaction || !blockTime || !confirmationStatus) {
            console.warn('[INFO]', 'MISSING INFORMATION FOR SIGNATURE');
            continue;
        }

        // extract the logs
        const logs = transaction.meta?.logMessages;
        // if there are no logs, there is nothing to do
        if (!logs) {
            continue;
        }

        // parse the logs (returns a generator that we can iterate through)
        const gen = eventParser.parseLogs(logs, false);
        // const date = new Date(blockTime! * 1000);
        // const dateString = formatDate(date);

        const vnEvents: VNEvent[] = [];
        for (const next of gen) {
            const { name, data } = next;
            const event = eventMap.get(name);
            if (!event) {
                console.warn('[INFO]', 'MISSING FOR NAME: ' + name);
                continue;
            }

            const vnEvent = parseEvent(name, data, event.fields, idl);

            vnEvents.push(vnEvent);
        }

        vnTransactions.push(
            {
                events: vnEvents,
                signature,
                blockTime,
                confirmationStatus
            }
        );

        // add signature to map to prevent asking for same data twice
        signatureMap.set(signature, true);
    }

    // vnTransactions TODO: put into database
}

async function loopRunner(connection: Connection, publicKey: PublicKey, idl: Idl, eventMap: Map<string, IdlEvent>, signatureMap: Map<string, boolean>) {
    await runner(connection, publicKey, idl, eventMap, signatureMap);

    setTimeout(
        () => loopRunner(connection, publicKey, idl, eventMap, signatureMap),
        MAIN_NET_SOLANA_RPC_POLL_MS
    );
}

async function main() {
    // we know events must be defined
    const events = MANGO_V4_IDL.events!;
    const eventMap = new Map<string, IdlEvent>();
    const signatureMap = new Map<string, boolean>();
    for (const event of events) {
        eventMap.set(event.name, event);
    }
    // https://solana-labs.github.io/solana-web3.js/classes/Connection.html#constructor
    // Write some code to establish a connection to Solana mainnet via an RPC endpoint, you can use this for
    // free: https://docs.solana.com/cluster/rpc-endpoints#mainnet-beta
    const connection = new Connection(MAIN_NET_SOLANA_RPC_ENDPOINT);

    console.log(`connected to ${ connection.rpcEndpoint }`);
    // start runner for the Mango Program
    await loopRunner(connection, MANGO_V4_PUBLIC_KEY, MANGO_V4_IDL, eventMap, signatureMap);
}

void main();