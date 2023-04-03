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
    EventParser, Idl
} from '@coral-xyz/anchor';
// import idlJSON from './idl.json';
import {
    IdlEvent,
    IdlEventField,
    IdlType, IdlTypeArray,
    IdlTypeCOption, IdlTypeDef,
    IdlTypeDefined, IdlTypeDefTy,
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
import {
    IdlNonPrimitiveType, IdlPrimitiveType
} from './utils/idl';

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
    type: 'string' | 'number' | 'bn' | 'boolean' | 'object' | 'array' | 'enum';
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
        };
    } else if (type === 'publicKey') {
        return {
            name,
            type: 'string',
            value: (value as PublicKey).toBase58()
        };
    } else if (bnArray.includes(type)) {
        console.log('VALUE IS', value, 'TYPE IS', type);
        return {
            name,
            type: 'bn',
            // value: value as BN
            value: (value as BN).toString(10)
        };
    } else if (numberArray.includes((type))) {
        return {
            name,
            type: 'number',
            value: value as number
        };
    }

    throw new Error('no known type: ' + type);
}

function findTypeDefInIDL(idl: Idl, name: string): IdlTypeDef | undefined {
    return idl.types?.find(
        (type) => type.name == name
    );
}

function convertIdlTypeDefTyToEventProperty(idlTypeDefTy: IdlTypeDefTy, idl: Idl, value: unknown): EventProperty[] {
    // enum typedef
    /**
     * FORMAT: { variantName: {} }
     * SEE: https://www.anchor-lang.com/docs/javascript-anchor-types
     */
    if (idlTypeDefTy.kind === 'enum') {
        const properties: EventProperty[] = [];
        const castedValue = value as {
            [key: string]: {}
        };

        const { variants } = idlTypeDefTy;
        for (const key of Object.keys(castedValue)) {
            for (const variant of variants) {
                if (variant.name.toLowerCase() === key.toLowerCase()) {
                    properties.push(
                        {
                            name: key,
                            type: 'string',
                            value: variant.name
                        }
                    );
                    break;
                }
            }
        }

        return properties;
    }
    // struct typedef
    else if (idlTypeDefTy.kind === 'struct') {
        const castedValue = value as {
            [key: string]: unknown;
        };
        const properties: EventProperty[] = [];
        const { fields } = idlTypeDefTy;
        for (const { name, type } of fields) {
            if (typeof type === 'string') {
                const p = convertAnchorPrimitiveToEventProperty(name, type as IdlPrimitiveType, castedValue[name]);
                console.log('TYPE: ', type, 'P: ', p);
                properties.push(p);
                continue;
            }

            const p = convertAnchorNonPrimitiveToEventProperty(name, type as IdlNonPrimitiveType, idl, castedValue[name]);
            if ('length' in p) {
                properties.push(...p);
            } else {
                properties.push(p);
            }
        }

        return properties;
    }

    return [];
}

// IdlTypeOption | IdlTypeCOption | IdlTypeVec | IdlTypeArray;
function convertAnchorNonPrimitiveToEventProperty(name: string, type: IdlNonPrimitiveType, idl: Idl, value: unknown): EventProperty | EventProperty[] {
    // assumption: defined type is never a primitive
    if ('defined' in type) {
        const { defined } = type;
        const idlTypeDef = findTypeDefInIDL(idl, defined);
        if (!idlTypeDef) {
            throw 'COULD NOT FIND: ' + defined;
        }

        const idlTypeDefTy = idlTypeDef.type;
        // console.log('DEFINED', defined);
        // console.log('FOUND TYPE', JSON.stringify(idlTypeDefTy));
        // console.log('FOUND VALUE', value);
        const properties = convertIdlTypeDefTyToEventProperty(idlTypeDefTy, idl, value);
        // TODO: consider enum as array
        if (idlTypeDefTy.kind == 'enum') {
            return {
                name,
                type: 'enum',
                value: properties
            };
        } else {
            return {
                name,
                type: 'object',
                value: properties
            };
        }
    } else if ('option' in type) { // unused in program
        const { option } = type;
    } else if ('coption' in type) { // unused in program
        const { coption } = type;
    } else if ('vec' in type) {
        const properties: EventProperty[] = [];
        const { vec } = type;
        const castedValue = value as [];
        for (const val of castedValue) {
            let property: EventProperty | EventProperty[];
            if (typeof vec === 'string') {
                property = convertAnchorPrimitiveToEventProperty(name, vec as IdlPrimitiveType, val);
            } else {
                property = convertAnchorNonPrimitiveToEventProperty(name, vec as IdlNonPrimitiveType, idl, val);
            }

            console.log('name', name, 'property', property);

            if ('length' in property) {
                properties.push(...property);
            } else {
                properties.push(property);
            }
        }

        return properties;
    } else if ('array' in type) {
        const properties: EventProperty[] = [];
        const { array } = type;
        // size is unused
        const [innerType] = array;

        const castedValue = value as [];
        for (const val of castedValue) {
            let property: EventProperty | EventProperty[];
            if (typeof innerType === 'string') {
                property = convertAnchorPrimitiveToEventProperty(name, innerType as IdlPrimitiveType, val);
            } else {
                property = convertAnchorNonPrimitiveToEventProperty(name, innerType as IdlNonPrimitiveType, idl, val);
            }

            console.log('name', name, 'property', property);

            if ('length' in property) {
                properties.push(...property);
            } else {
                properties.push(property);
            }
        }

        return properties;
    }

    return {
        name: '',
        value: '',
        type: 'string'
    };
    // throw new Error('no known type: ' + JSON.stringify(type));
}

function parseEvent(data: EventData<IdlEventField, Record<string, never>>, fields: IdlEventField[], idl: Idl): ParsedEvent {
    const properties: EventProperty[] = [];
    // we ignore index as it is unused in our program
    for (const { name: fieldName, type: fieldType } of fields) {
        const value = data[fieldName];
        // check if it is a primitive value!
        if (typeof fieldType === 'string') {
            const castedFieldType = fieldType as IdlPrimitiveType;
            const property = convertAnchorPrimitiveToEventProperty(fieldName, castedFieldType, value);
            console.log('PROPERTY: ', property);

            properties.push(property);
        } else {
            const castedFieldType = fieldType as IdlNonPrimitiveType;
            const property = convertAnchorNonPrimitiveToEventProperty(fieldName, castedFieldType, idl, value);
            console.log('FIELD IS: ', fieldName, fieldType);
            // console.log('NOT REAL PROPERTY: ', property);
        }
    }

    return {
        properties
    };
}

async function mainBody(connection: Connection, eventMap: Map<string, IdlEvent>, idl: Idl) {
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
    const coder = new BorshCoder(idl);
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
            const pEvent = parseEvent(data, event.fields, idl);
        }
    }
}

async function runner(connection: Connection, eventMap: Map<string, IdlEvent>, idl: Idl) {
    console.log('EXECUTING RUNNER');
    await mainBody(connection, eventMap, idl);
    console.log('FINISHED RUNNER');

    // sleep for 1 second
    // await sleep(1000);
    setTimeout(
        () => runner(connection, eventMap, idl),
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
    await mainBody(connection, eventMap, MANGO_V4_IDL);
}

void main();