import {
    Connection,
    GetVersionedTransactionConfig,
    ConfirmedSignatureInfo
} from '@solana/web3.js';

// VN Prefix is used to indicate VybeNetworks

import {
    BorshCoder,
    EventData,
    EventParser, Idl
} from '@coral-xyz/anchor';
import {
    IdlEvent,
    IdlEventField,
} from '@coral-xyz/anchor/dist/cjs/idl';
import {
    MAIN_NET_SOLANA_RPC_ENDPOINT, MAIN_NET_SOLANA_RPC_POLL_MS,
    MAIN_NET_SOLANA_RPC_RATE_LIMIT,
    MANGO_V4_IDL,
    MANGO_V4_PUBLIC_KEY
} from './constants';
import { parseEvent } from './utils/event';

/**
 * REFERENCES:
 *  - https://www.quicknode.com/guides/solana-development/accounts-and-data/how-to-deserialize-account-data-on-solana/
 *  - https://www.quicknode.com/guides/solana-development/transactions/how-to-get-transaction-logs-on-solana/
 *  - https://app.mango.markets/stats
 */

// lamport
// const LAMPORT_VAL = 0.000000001;

// TODO (MAIN PROBLEMS):
// TODO: marketIndex <-- what to do with this?
// TODO: convert lamport to SOL


function getTransactionsForSignatures(connection: Connection, signatures: ConfirmedSignatureInfo[]) {
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

async function mainBody(connection: Connection, eventMap: Map<string, IdlEvent>, signatureMap: Map<string, boolean>, idl: Idl) {
    const signatures = await connection.getSignaturesForAddress(MANGO_V4_PUBLIC_KEY,
        {
            limit: MAIN_NET_SOLANA_RPC_RATE_LIMIT
        }
    );
    const newSignatures = signatures.filter(
        ({ signature }) => !signatureMap.get(signature)
    );

    // nothing to query!!
    if (newSignatures.length === 0) {
        return;
    }

    const transactions = await getTransactionsForSignatures(connection, newSignatures);
    const coder = new BorshCoder(idl);
    const parser = new EventParser(MANGO_V4_PUBLIC_KEY, coder);

    for (let i = 0; i < transactions.length; ++i) {
        const transaction = transactions[i];
        // TODO: convert to date time
        const { blockTime, signature, confirmationStatus } = signatures[i];
        if (!transaction) {
            continue;
        }

        signatureMap.set(signature, true)

        const logs = transaction.meta?.logMessages;
        if (!logs) {
            continue;
        }

        const gen = parser.parseLogs(logs, false);
        // Apr 2, 2023 at 08:56:26 UTC
        // TODO: check status before using block time
        const date = new Date(blockTime! * 1000);
        const dateString = date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            timeZone: 'UTC',
            timeZoneName: 'short'
        });
        // Apr 2, 2023 at 9:02:54 UTC
        console.log(`BLOCK TIME: ${ dateString }`);
        console.log(`SIGNATURE: ${ signature }`);
        // console.log(`CONFIRMATION STATUS: ${ confirmationStatus }`);
        for (const next of gen) {
            const { name, data } = next;
            const event = eventMap.get(name);
            if (!event) {
                console.log('[INFO]', 'MISSING FOR NAME: ' + name);
                continue;
            }

            const pEvent = parseEvent(name, data, event.fields, idl);
        }
    }
}

async function runner(connection: Connection, eventMap: Map<string, IdlEvent>, signatureMap: Map<string, boolean>, idl: Idl) {
    console.log('EXECUTING RUNNER');
    await mainBody(connection, eventMap, signatureMap, idl);
    console.log('FINISHED RUNNER');

    // sleep for 1 second
    // await sleep(1000);
    setTimeout(
        () => runner(connection, eventMap, signatureMap, idl),
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

    console.log(`connecting to ${ connection.rpcEndpoint }`);
    await runner(connection, eventMap, signatureMap, MANGO_V4_IDL);
    // await mainBody(connection, eventMap, MANGO_V4_IDL);
}

void main();