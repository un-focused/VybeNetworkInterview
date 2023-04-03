import {
    Connection,
    GetVersionedTransactionConfig,
    PublicKey,
    ConfirmedSignatureInfo
} from '@solana/web3.js';

// import { SolanaParser } from '@debridge-finance/solana-transaction-parser';

import {
    BorshCoder,
    EventData,
    EventParser
} from '@coral-xyz/anchor';
// import idlJSON from './idl.json';
import {
    IdlEvent,
    IdlEventField,
    IdlType, IdlTypeArray,
    IdlTypeCOption,
    IdlTypeDefined,
    IdlTypeOption, IdlTypeVec
} from '@coral-xyz/anchor/dist/cjs/idl';
import BN from 'bn.js';
import {
    DEV_NET_SOLANA_RPC_ENDPOINT,
    MAIN_NET_SOLANA_RPC_ENDPOINT, MAIN_NET_SOLANA_RPC_POLL_MS,
    MAIN_NET_SOLANA_RPC_RATE_LIMIT,
    MANGO_V4_IDL,
    MANGO_V4_PUBLIC_KEY
} from './constants';
import { isIdlTypeArray, isIdlTypeCOption, isIdlTypeDefined, isIdlTypeOption, isIdlTypeVec } from './utils/idl';

// import { bigInt } from '@solana/buffer-layout-utils';

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
/**
 * splits a camel case string into its constituent parts
 * @param str: str that is to be broken up
 */
function splitCamelCaseString(str: string): string[] {
    // use a regular expression to match the camel case pattern
    const regex = /([a-z])([A-Z])/g;

    // replace the pattern with a space and the matched characters
    const result = str.replace(regex, '$1 $2');

    // split the string into an array of words
    return result.split(' ');
}

function uppercaseWords(words: string[]) {
    // use the map method to uppercase the first letter of each word
    return words.map(word => word.charAt(0).toUpperCase() + word.slice(1));
}

type ParsedEvent = {
    properties: EventProperty[];
}

type EventProperty = {
    name: string;
    value: string | number | boolean | BN | EventProperty[] | EventProperty;
    type: 'string' | 'number' | 'bn' | 'boolean' | 'object' | 'array';
}

// u32, i8, & i16 are omitted as it is not in the events type
// 'bool' | 'f32' | 'f64' | 'i128' | 'i64' | 'publicKey' | 'u128' | 'u16' | 'u64' | 'u8';
type IdlPrimitiveType = "bool" | "u8" | "i8" | "u16" | "i16" | "u32" | "i32" | "f32" | "u64" | "i64" | "f64" | "u128" | "i128" | "u256" | "i256" | "bytes" | "string" | "publicKey";
type IdlNonPrimitiveType = IdlTypeDefined | IdlTypeOption | IdlTypeCOption | IdlTypeVec | IdlTypeArray;

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

function convertAnchorPrimitiveToEventProperty(name: string, type: IdlPrimitiveType, value: unknown): EventProperty {
    const bnArray = ['u64', 'u128', 'i64', 'i128'];
    const numberArray = ['u8', 'u16', 'u32', 'i8', 'i16', 'i32', 'f32', 'f64'];
    if (type === 'bool') {
        return {
            name,
            type: 'boolean',
            value: value as boolean
        };
    } else if (type === 'string') {
        return {
            name,
            type: 'string',
            value: value as string
        }
    } else if (type === 'publicKey') {
        return {
            name,
            type: 'string',
            value: (value as PublicKey).toBase58()
        }
    } else if (bnArray.includes(type)) {
        return {
            name,
            type: 'bn',
            // value: value as BN
            value: (value as BN).toString(10)
        }
    } else if (numberArray.includes((type))) {
        return {
            name,
            type: 'number',
            value: value as number
        }
    }

    throw new Error('no known type: ' + type);
}

// IdlTypeOption | IdlTypeCOption | IdlTypeVec | IdlTypeArray;
function convertAnchorNonPrimitiveToEventProperty(name: string, type: IdlNonPrimitiveType, value: unknown): EventProperty {
    if (isIdlTypeDefined(type)) {
        const { } = type;
    } else if (isIdlTypeOption(type)) {}
    else if (isIdlTypeCOption(type)) {}
    else if (isIdlTypeVec(type)) {}
    else if (isIdlTypeArray(type)) {}

    throw new Error('no known type: ' + type);
}

function parseEvent(data: EventData<IdlEventField, Record<string, never>>, fields: IdlEventField[]): ParsedEvent {
    const properties: EventProperty[] = []
    // we ignore index as it is unused in our program
    for (const { name: fieldName, type: fieldType } of fields) {
        const value = data[fieldName];
        // check if it is a primitive value!
        if (typeof fieldType === 'string') {
            const castedFieldType = fieldType as IdlPrimitiveType;
            const property = convertAnchorPrimitiveToEventProperty(fieldName, castedFieldType, value);
            console.log('PROPERTY: ', property);

            properties.push(property)
        } else {
            console.log('FIELD IS: ', fieldName, fieldType);
        }
    }

    return {
        properties
    };
}

async function mainBody(connection: Connection, eventMap: Map<string, IdlEvent>) {
    // const signatures = await connection.getSignaturesForAddress(MANGO_V4_PUBLIC_KEY,
    //     {
    //         limit: MAIN_NET_SOLANA_RPC_RATE_LIMIT
    //     }
    // );
    const signatures: ConfirmedSignatureInfo[] = [
        {
            confirmationStatus: 'finalized',
            blockTime: new Date().getTime() / 1000,
            slot: 1,
            err: null,
            memo: null,
            signature: '4WEPK9aRByW4NvDJDpL8Uk716URjdPgD2mT8oXDGswmnZkzPx1UU2McyVeJzdrq7ofR8Nth7rY7hzyTCrJiBiH73'
        }
    ];

    const transactions = await getTransactionsForSignatures(connection, signatures);
    const coder = new BorshCoder(MANGO_V4_IDL);
    const parser = new EventParser(MANGO_V4_PUBLIC_KEY, coder);

    for (let i = 0; i < transactions.length; ++i) {
        const transaction = transactions[i];
        // TODO: convert to date time
        const { blockTime, signature, confirmationStatus } = signatures[i];
        if (!transaction) {
            console.log('[INFO], NULL');
            continue;
        }

        const logs = transaction.meta?.logMessages;
        if (!logs) {
            console.log('no logs');
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
        // console.log(`BLOCK TIME: ${ dateString }`);
        // console.log(`SIGNATURE: ${ signature }`);
        // console.log(`CONFIRMATION STATUS: ${ confirmationStatus }`);
        for (const next of gen) {
            const { name, data } = next;
            const event = eventMap.get(name);
            if (!event) {
                console.log('[INFO]', 'MISSING FOR NAME: ' + name);
                continue;
            }

            // TODO: parse event found
            console.log('event found', name);
            const pEvent = parseEvent(data, event.fields);
        }
    }
}

async function runner(connection: Connection, eventMap: Map<string, IdlEvent>) {
    console.log('EXECUTING RUNNER');
    await mainBody(connection, eventMap);
    console.log('FINISHED RUNNER');

    // sleep for 1 second
    // await sleep(1000);
    setTimeout(
        () => runner(connection, eventMap),
        MAIN_NET_SOLANA_RPC_POLL_MS
    );
}

async function main() {
    // we know events must be defined
    const events = MANGO_V4_IDL.events!;
    const eventMap = new Map<string, IdlEvent>();
    for (const event of events) {
        eventMap.set(event.name, event);
    }
    // https://solana-labs.github.io/solana-web3.js/classes/Connection.html#constructor
    // Write some code to establish a connection to Solana mainnet via an RPC endpoint, you can use this for
    // free: https://docs.solana.com/cluster/rpc-endpoints#mainnet-beta
    const connection = new Connection(MAIN_NET_SOLANA_RPC_ENDPOINT);

    console.log(`connecting to ${ connection.rpcEndpoint }`);
    // await runner(connection, eventMap);
    await mainBody(connection, eventMap);
}

void main();