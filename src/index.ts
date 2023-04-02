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
    EventParser,
    Idl
} from '@coral-xyz/anchor';
import idlJSON from './idl.json';
import { IdlEventField } from '@coral-xyz/anchor/dist/cjs/idl';
import BN from 'bn.js';
import {
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

export interface IDLEvent {
    name: string;
    fields: Field[];
}

export interface Field {
    name: string;
    type: TypeClass | TypePrimitive;
    index: boolean;
}

export interface TypeClass {
    defined?: string;
    vec?: Vec;
}

export interface Vec {
    defined: string;
}

// u32, i8, & i16 are omitted as it is not in the events type
export type TypePrimitive = 'bool' | 'f32' | 'f64' | 'i128' | 'i64' | 'publicKey' | 'u128' | 'u16' | 'u64' | 'u8';

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
            const n = BigInt(newValue.toString(10))
            const formatter = new Intl.NumberFormat('en-US');

            return formatter.format(n)
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
            const n = BigInt(newValue.toString(10))
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

async function mainBody(connection: Connection, eventMap: Map<string, IDLEvent>) {
    const signatures = await connection.getSignaturesForAddress(MANGO_V4_PUBLIC_KEY,
        {
            limit: MAIN_NET_SOLANA_RPC_RATE_LIMIT
        }
    );

    const transactions = await getTransactionsForSignatures(connection, signatures);
    const coder = new BorshCoder(MANGO_V4_IDL);
    const parser = new EventParser(MANGO_V4_PUBLIC_KEY, coder);

    for (let i = 0; i < transactions.length; ++i) {
        const transaction = transactions[i];
        // TODO: convert to date time
        const { blockTime, signature } = signatures[i];
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
        console.log(`TRANSACTION INFO:`);
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
        // console.log('LOADED: ', transaction.meta?.loadedAddresses);
        for (const next of gen) {
            const { name, data } = next;
            const event = eventMap.get(name);
            if (!event) {
                console.log('[INFO]', 'MISSING FOR NAME: ' + name);
                continue;
            }
            for (const { name, type } of event.fields) {
                const parts = splitCamelCaseString(name);
                const displayName = uppercaseWords(parts).join(' ');
                if (typeof(type) === 'string') {
                    const primitiveType = type as TypePrimitive;
                    // must be a type enum
                    console.log(`[${ displayName }]`, getFormattedField(primitiveType, data, name));
                } else {
                    // must be a type class
                    console.log('CLASS TIME DING DING DING: ', type);
                    console.log('DATA: ', data);
                }
            }
            console.log('event found', name);
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

function sleep(timeMS: number) {
    return new Promise<void>(
        (resolve) => {
            setTimeout(
                () => resolve(),
                timeMS
            )
        }
    );
}

async function runner(connection: Connection, eventMap: Map<string, IDLEvent>) {
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
    const events = idlJSON.events as IDLEvent[];
    const eventMap = new Map<string, IDLEvent>();
    for (const event of events) {
        eventMap.set(event.name, event);
    }
    // https://solana-labs.github.io/solana-web3.js/classes/Connection.html#constructor
    // Write some code to establish a connection to Solana mainnet via an RPC endpoint, you can use this for
    // free: https://docs.solana.com/cluster/rpc-endpoints#mainnet-beta
    const connection = new Connection(MAIN_NET_SOLANA_RPC_ENDPOINT);

    console.log(`connecting to ${ connection.rpcEndpoint }`);
    await runner(connection, eventMap);
}

void main();