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
import { IdlEvent, IdlEventField, IdlType, IdlTypeDefined } from '@coral-xyz/anchor/dist/cjs/idl';
import BN from 'bn.js';
import {
    DEV_NET_SOLANA_RPC_ENDPOINT,
    MAIN_NET_SOLANA_RPC_ENDPOINT, MAIN_NET_SOLANA_RPC_POLL_MS,
    MAIN_NET_SOLANA_RPC_RATE_LIMIT,
    MANGO_V4_IDL,
    MANGO_V4_PUBLIC_KEY
} from './constants';

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

// export interface IDLEvent {
//     name: string;
//     fields: Field[];
// }
//
// export interface Field {
//     name: string;
//     type: TypeClass | TypePrimitive;
//     index: boolean;
// }
//
// export interface TypeClass {
//     defined?: string;
//     vec?: Vec;
// }
//
// export interface Vec {
//     defined: string;
// }

// u32, i8, & i16 are omitted as it is not in the events type
// 'bool' | 'f32' | 'f64' | 'i128' | 'i64' | 'publicKey' | 'u128' | 'u16' | 'u64' | 'u8';
export type TypePrimitive = "bool" | "u8" | "i8" | "u16" | "i16" | "u32" | "i32" | "f32" | "u64" | "i64" | "f64" | "u128" | "i128" | "u256" | "i256" | "bytes" | "string" | "publicKey";

// TODO: parse primitives
function getFormattedField(type: TypePrimitive, data: EventData<IdlEventField, Record<string, never>>, name: string) {
    const value = data[name];
    switch (type) {
        case 'publicKey':
            return (value as PublicKey).toBase58();
        // boolean
        case 'bool':
            return (value as boolean) ? 'true' : 'false';
        // big number
        case 'u64': {
            // return I80F48.fromU64(value as BN).toString();
            const newValue = value as BN;
            const n = BigInt(newValue.toString(10));
            const formatter = new Intl.NumberFormat('en-US');

            return formatter.format(n);
        }
        case 'u128':
        case 'i64': {
            const newValue = value as BN;
            const n = BigInt(newValue.toString(10));
            // const str = I80F48.fromString(newValue.toString(10)).toString();
            // assuming USD
            const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

            return formatter.format(n);
        }
        case 'i128': {
            const newValue = value as BN;
            const n = BigInt(newValue.toString(10));
            const formatter = new Intl.NumberFormat('en-US');

            return formatter.format(n);
            // return I80F48.fromString(newValue.toString(10)).toString();
        }
        // number
        case 'u8':
        case 'u16':
        case 'f32':
        case 'f64':
            return value as number;
        default:
            console.warn('UNKNOWN TYPE: ', data[type], type);
            return value;
    }
}

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

function parseEvent(data: EventData<IdlEventField, Record<string, never>>, fields: IdlEventField[]) {
    for (const { name, type } of fields) {
        const parts = splitCamelCaseString(name);
        const displayName = uppercaseWords(parts).join(' ');
        // u64" | "i64" | "f64" | "u128" | "i128" | "u256" | "i256" | "bytes" | "string" | "publicKey" |
        //  | IdlTypeOption | IdlTypeCOption | IdlTypeVec | IdlTypeArray;
        if (typeof (type) === 'string') {
            const primitiveType = type as TypePrimitive;
            // must be a type enum
            console.log(`[${ displayName }]`, getFormattedField(primitiveType, data, name));
            // IdlTypeDefined
        } else if ('defined' in type) {
            console.log('[TYPE DEFINED]', type.defined);
            const { defined } = type;
            if (!MANGO_V4_IDL.types) {
                continue;
            }

            const idlTypeDef = MANGO_V4_IDL.types.find(
                (type) => type.name === defined
            );

            if (!idlTypeDef) {
                console.log('WHAT IS NOT FOUND: ', defined, type);
                continue;
            }

            console.log('name', name);
            console.log('IDLTypeDef', idlTypeDef);
            console.log('[DATA INSIDE]', data[name]);
            const innerData = data[name] as EventData<IdlEventField, Record<string, never>>;
            const { type: innerType } = idlTypeDef;
            if (innerType.kind === 'enum') {
                if (!innerType.variants) {
                    throw 'enum must have variants';
                }

                for (const key of Object.keys(innerData as any)) {
                    for (const variant of innerType.variants) {
                        if (variant.name.toLowerCase() === key.toLowerCase()) {
                            console.log('NAME: ' + key + ' FOUND');
                            break;
                        }
                    }
                }
            } else if (innerType.kind === 'struct') {
                const eventFields = innerType.fields.map(
                    ({ type, name }): IdlEventField => {
                        return {
                            type,
                            name,
                            index: false
                        }
                    }
                )
                // IdlEventField
                parseEvent(innerData, eventFields);
            }
        } else if ('option' in type) { // IdlTypeOption
            // in our IDL, the only option is u32
            const option = type.option;
            if (typeof option !== 'string') {
                throw 'IDL should not have options without strings: ' + type
            }

            // recursive
            console.log(`[${ displayName }]`, getFormattedField(option as TypePrimitive, data, name));
        } else if ('coption' in type) { // IdlTypeCOption
        } else if ('vec' in type) { // IdlTypeVec
        } else if ('array' in type) { // IdlTypeArray
        }
    }
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
        // console.log(`TRANSACTION INFO:`);
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
        console.log(`CONFIRMATION STATUS: ${ confirmationStatus }`);
        // console.log('LOADED: ', transaction.meta?.loadedAddresses);
        for (const next of gen) {
            const { name, data } = next;
            const event = eventMap.get(name);
            if (!event) {
                console.log('[INFO]', 'MISSING FOR NAME: ' + name);
                continue;
            }

            if (event.name === 'MangoAccountData' || event.name === 'FlashLoanLog' || event.name === 'WithdrawLoanOriginationFeeLog') {
                console.log('SUPER BIG IMPORTANT LOG HERE!!!');
                console.log(`BLOCK TIME: ${ dateString }`);
                console.log(`SIGNATURE: ${ signature }`);
                console.log(`CONFIRMATION STATUS: ${ confirmationStatus }`);
                console.log('DATA', data);
            }
            // } else {
            //     // console.log('DOES NOT MATTER FOR NOW: ', name);
            //     continue;
            // }

            // TODO: parse event found
            console.log('event found', name);
            parseEvent(data, event.fields);
            // console.log('TX SIGS', transaction.transaction.signatures);

            // for (const field of event.fields) {
            //     const { name } = field;
            //     // console.log(`BEFORE CAST: ${ name }: `, data[name]);
            //     if (typeof field.type !== 'string') {
            //         console.log('[INFO]: MUST BE A CLASS TYPE');
            //         continue;
            //     }
            //
            //     const { type } = field;
            //     const value = anchorToTypes(type, data, name);
            //     console.log('[INFO] CASTED: ', field.name, value);
            // }
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

// const signatures = [
//     {
//         signature: '4YvAKJ1tzsMTVKLqzLfqJSEZ8S5fC6nmRCE6532ZgSLiR7vgs27eN1v8zGTzedXHR2EtrUSvei4abRN5U3MxJSuZ'
//     }
// ];
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
    // const connection = new Connection(DEV_NET_SOLANA_RPC_ENDPOINT);

    console.log(`connecting to ${ connection.rpcEndpoint }`);
    // await runner(connection, eventMap);
    await mainBody(connection, eventMap);
}

void main();