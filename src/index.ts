import {
    Connection, PublicKey, TransactionConfirmationStatus
} from '@solana/web3.js';

// NOTE: VN Prefix is used to indicate VybeNetworks

import {
    Idl
} from '@coral-xyz/anchor';
import { Collection, Document, MongoClient } from 'mongodb';
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
import { EventProperty } from './types/eventProperty';
import { config } from 'dotenv';

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

/**
 * runs the program (gets transactions from the program & parses them)
 * logs the transactions along the way with their events in a pretty format
 * @param connection to the solana endpoint
 * @param publicKey of the program
 * @param idl to parse the data
 * @param signatureMap to prevent duplicate calls
 */
async function runner(connection: Connection, publicKey: PublicKey, idl: Idl, collection: Collection<Document>, signatureMap: Map<string, boolean>) {
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
    const { parser: eventParser, eventMap } = setupIdlTools(publicKey, idl);

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

        // used to create the transaction
        const vnEvents: VNEvent[] = [];
        // iterate through each event
        for (const next of gen) {
            // extract necessary properties
            const { name, data } = next;
            // get event from IDL
            const event = eventMap.get(name);
            console.log(data);
            if (!event) {
                console.warn('[INFO]', 'MISSING FOR NAME: ' + name);
                continue;
            }

            // parse the event using the IDL
            const vnEvent = parseEvent(name, data, event.fields, idl);

            // push parsed event to array
            vnEvents.push(vnEvent);
        }

        // if no events are found, skip it
        if (!vnEvents || vnEvents.length === 0) {
            continue;
        }

        // add parsed transaction to array
        vnTransactions.push(
            {
                events: vnEvents,
                signature,
                blockTime,
                confirmationStatus
            }
        );

        try {
            await collection.insertMany(vnTransactions);
        } catch (error: any) {
            // REFERENCE: https://stackoverflow.com/questions/30593882/how-to-catch-the-error-when-inserting-a-mongodb-document-which-violates-an-uniqu
            if (error.name === 'MongoBulkWriteError' && error.code === 11000) {
                // already exists in our system
                signatureMap.set(signature, true)
                continue;
            }

            console.log('ERROR: ' + error);
        }

        // add signature to map to prevent asking for same data twice
        signatureMap.set(signature, true);
    }

    // log each transaction
    vnTransactions.forEach((tx) => logTransaction(tx));

    // vnTransactions TODO: put into database
}

/**
 * logs an event (pretty print)
 * @param item to be logged
 * @param indent for pretty print (tabs)
 */
function logEvent(item: VNEvent | EventProperty[], indent = 2) {
    const tabs = '\t'.repeat(indent);
    let properties: EventProperty[];
    // if array then no need to adjust
    if (Array.isArray(item)) {
        properties = item;
    } else {
        // log name if event
        const { name } = item;
        properties = item.properties;
        console.log(`${ tabs }name: ${ name }`);
    }
    for (const { name, type, value } of properties) {
        if (type === 'object') {
            logEvent(value as EventProperty[], indent + 1);
            continue;
        } else if (type == 'enum') {
            const enumProperties = value as EventProperty[];
            console.log(`${ tabs }\t ${ name }: ${ enumProperties.map((p) => p.value).join(' ') } `);
            continue;
        } else if (type == 'array') {
            // console.log('ARRAY IS NEEDED', array);
            const arrayProperties = value as EventProperty[];
            console.log(`${ tabs }\t ${ name }:`);
            // log each object in array
            arrayProperties.forEach(
                ({ name, value }, index) => {
                    console.log(`${ tabs }\t\t [${ index }]:`);
                    if (Array.isArray((value))) {
                        // console.log(JSON.stringify(value, null, 4));
                        logEvent(value as EventProperty[], indent + 2);
                    } else {
                        // assuming not a singular event property, therefore must be a primitive
                        console.log(`${ tabs }\t\t\t${ name }: ${ value }`);
                    }
                }
            );
            continue;
        }

        console.log(`${ tabs }\t ${ name }: ${ value }`);
    }
}

/**
 * logs the transaction to the console (pretty print)
 * @param transaction
 */
function logTransaction(transaction: Transaction) {
    const { events, signature, blockTime, confirmationStatus } = transaction;
    console.log('Transaction:');
    console.log('\tsignature: ', signature);
    // * 1000 as JS date requires milliseconds
    console.log('\tblock datetime: ', formatDate(new Date(blockTime * 1000)));
    console.log('\tstatus: ', confirmationStatus);
    console.log('\tevents: ');

    events.forEach(event => logEvent(event));
}

/**
 * loops the runner for the program
 * @param connection to the solana endpoint
 * @param publicKey of the program
 * @param idl to parse the data
 * @param signatureMap to prevent duplicate calls
 */
async function loopRunner(connection: Connection, publicKey: PublicKey, idl: Idl, collection: Collection<Document>, signatureMap: Map<string, boolean>) {
    await runner(connection, publicKey, idl, collection, signatureMap);

    setTimeout(
        () => loopRunner(connection, publicKey, idl, collection, signatureMap),
        MAIN_NET_SOLANA_RPC_POLL_MS
    );
}

/**
 * entry point of the program
 */
async function main() {
    if (process.env.NODE_ENV !== 'production') {
        config();
    }
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        throw new Error('No URI provided');
    }

    const signatureMap = new Map<string, boolean>();
    const mongoClient = new MongoClient(uri);

    await mongoClient.connect();

    const vybeDatabase = mongoClient.db('vybe');
    const transactionsCollection = vybeDatabase.collection('transactions');
    await transactionsCollection.createIndex(
        {
            'signature': 1
        },
        {
            unique: true
        }
    );

    // https://solana-labs.github.io/solana-web3.js/classes/Connection.html#constructor
    // Write some code to establish a connection to Solana mainnet via an RPC endpoint, you can use this for
    // free: https://docs.solana.com/cluster/rpc-endpoints#mainnet-beta
    const connection = new Connection(MAIN_NET_SOLANA_RPC_ENDPOINT);

    console.log(`connected to ${ connection.rpcEndpoint }`);

    // start runner for the Mango Program
    await loopRunner(connection, MANGO_V4_PUBLIC_KEY, MANGO_V4_IDL, transactionsCollection, signatureMap);
}

// run main
void main();