import {
    Connection,
    GetVersionedTransactionConfig,
    PublicKey,
    VersionedTransactionResponse
} from '@solana/web3.js';

import { SolanaParser } from '@debridge-finance/solana-transaction-parser';

import {
    BorshCoder,
    EventData,
    EventParser,
    Idl
} from '@coral-xyz/anchor';
import idlJSON from './idl.json';
import { IdlEventField } from '@coral-xyz/anchor/dist/cjs/idl';
import BN from 'bn.js';

/**
 * REFERENCES:
 *  - https://www.quicknode.com/guides/solana-development/transactions/how-to-get-transaction-logs-on-solana/
 *  - https://app.mango.markets/stats
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

// type IDLEvent = {
//     name: string;
//     fields: {
//         name: string;
//         type: {
//             defined: string;
//         } | {
//             vec: {
//                 defined: string;
//             }
//         } | string;
//         index: boolean;
//     }[];
// }

export interface IDLEvent {
    name: string;
    fields: Field[];
}

export interface Field {
    name: string;
    type: TypeClass | TypeEnum;
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
export type TypeEnum = 'bool' | 'f32' | 'f64' | 'i128' | 'i64' | 'publicKey' | 'u128' | 'u16' | 'u64' | 'u8';

function anchorToTypes(type: TypeEnum, data: EventData<IdlEventField, Record<string, never>>, name: string) {
    const value = data[name];
    switch (type) {
        case 'publicKey':
            return (value as PublicKey).toBase58();
        // boolean
        case 'bool':
            console.log('casted to boolean');
            return value as boolean;
        // big number
        case 'u64':
        case 'u128':
        case 'i64': {
            const newValue = value as BN;
            console.log('new value', newValue.toString(10));
            const n = BigInt(newValue.toString(10));
            console.log('n', n);
            console.log(newValue.toString(10));
            // assuming USD
            const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

            return formatter.format(n);
        }
        case 'i128':
            // console.log('casted to BN')
            // console.log('IS THIS A BN', BN.isBN(value));
            // Note: decimals are not supported in this library.
            const newValue = value as BN;
            let str = newValue.toString(10, 128);
            // https://www.anchor-lang.com/docs/javascript-anchor-types
            // I80F48
            const parts = str.split('');

            parts.splice(80, 0, '.');

            str = parts.join('');
            let startIndex = 0;
            for (;str[startIndex] === '-' || str[startIndex] === '0' && startIndex < 79; ++startIndex) {}

            return str.substring(startIndex);

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

// MangoAccountData
// PerpBalanceLog
// TokenBalanceLog
// FlashLoanLog
// WithdrawLog
// DepositLog
// FillLog
// FillLogV2
// PerpUpdateFundingLog
// UpdateIndexLog
// UpdateRateLog
// TokenLiqWithTokenLog
// Serum3OpenOrdersBalanceLog
// Serum3OpenOrdersBalanceLogV2
// WithdrawLoanOriginationFeeLog
// TokenLiqBankruptcyLog
// DeactivateTokenPositionLog
// DeactivatePerpPositionLog
// TokenMetaDataLog
// PerpMarketMetaDataLog
// Serum3RegisterMarketLog
// PerpLiqBaseOrPositivePnlLog
// PerpLiqBankruptcyLog
// PerpLiqNegativePnlOrBankruptcyLog
// PerpSettlePnlLog
// PerpSettleFeesLog
// AccountBuybackFeesWithMngoLog
async function main() {
    const events = idlJSON.events as IDLEvent[];
    const eventMap = new Map<string, IDLEvent>();
    for (const event of events) {
        eventMap.set(event.name, event);
        // console.log(event.name);
    }
    const address = '4MangoMjqJ2firMokCjjGgoK8d4MXcrgL7XJaL3w6fVg';
    const pubKey = new PublicKey(address);
    // https://solana-labs.github.io/solana-web3.js/classes/Connection.html#constructor
    // Write some code to establish a connection to Solana mainnet via an RPC endpoint, you can use this for
    // free: https://docs.solana.com/cluster /rpc-endpoints#mainnet-beta
    const connection = new Connection('https://api.mainnet-beta.solana.com');

    console.log(`connecting to ${ connection.rpcEndpoint }`);
    const signatures = await connection.getSignaturesForAddress(pubKey, { limit: 5 });
    // required as per documentation, the default config is deprecated
    const config: GetVersionedTransactionConfig = {
        maxSupportedTransactionVersion: 0
    };

    const transactions: (VersionedTransactionResponse | null)[] = await connection.getTransactions(
        signatures.map(
            item => item.signature
        ),
        config
    );

    const idl: Idl = idlJSON as Idl;
    const coder = new BorshCoder(idl);
    const parser = new EventParser(pubKey, coder);

    const txParser = new SolanaParser([
        { 'idl': idlJSON as any, programId: address }
    ]);

    for (let i = 0; i < transactions.length; ++i) {
        const transaction = transactions[i];
        // TODO: convert to date time
        const { blockTime, signature } = signatures[i];
        if (!transaction) {
            console.log('[INFO], NULL');
            continue;
        }

        const parsedArray = txParser.parseTransactionData(
            transaction.transaction.message, transaction.meta?.loadedAddresses);
        const logs = transaction.meta?.logMessages;
        if (!logs) {
            console.log('no logs');
            continue;
        }
        const gen = parser.parseLogs(logs, false);
        console.log(`TRANSACTION INFO:`);
        // Apr 2, 2023 at 08:56:26 UTC
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
        console.log('LOADED: ', transaction.meta?.loadedAddresses);
        for (const next of gen) {
            const { name, data } = next;
            console.log('DATA', data);
            const event = eventMap.get(name);
            if (!event) {
                console.log('[INFO]', 'MISSING FOR NAME: ' + name);
                continue;
            }
            console.log('event found', name);
            console.log('TX SIGS', transaction.transaction.signatures);

            for (const field of event.fields) {
                const { name } = field;
                // console.log(`BEFORE CAST: ${ name }: `, data[name]);
                if (typeof field.type !== 'string') {
                    console.log('[INFO]: MUST BE A CLASS TYPE');
                    continue;
                }

                const { type } = field;
                const value = anchorToTypes(type, data, name);
                console.log('[INFO] CASTED: ', field.name, value);
            }
        }
        // PerpPlaceOrder
        // want: H4xgvHhm7NU
        // have: Ft2gm2vJxhU
        // want: Ft2gm2vJxhU
        // have: Bz9KX2mGFbq4fctQ7wgBr7
        // const versionedMessage = transaction.transaction.message;
        for (const log of logs) {
            console.log('***************');
            if (log.includes('Instruction')) {
                for (const parsedInstruction of parsedArray) {
                    // we only want mango program, this assumes all instructions are the same
                    // program in the transaction
                    if (parsedInstruction.programId.toBase58() !== address) {
                        continue;
                    }

                    const searchStr = 'Instruction: ';
                    const rawInstructionName = log.substring(log.indexOf(searchStr) + searchStr.length);
                    const parts = rawInstructionName.split('');
                    parts[0] = parts[0].toLowerCase();

                    const formattedInstructionName = parts.join('');
                    const foundInstruction = idl.instructions.find(
                        (instruction) => instruction.name === formattedInstructionName
                    );

                    // console.log('formatted name', formattedInstructionName);
                    // console.log('formatted name', JSON.stringify({name: formattedInstructionName}));
                    // console.log('found instruction', foundInstruction);
                    // if (!foundInstruction || foundInstruction.name !== 'tokenWithdraw' && foundInstruction.name !== 'tokenDeposit') {
                    //     continue;
                    // }
                    console.log('parsedInstruction:');
                    console.log('\tname: ', parsedInstruction.name);
                    console.log('\targs: ', parsedInstruction.args);
                    for (const [key, value] of Object.entries(parsedInstruction.args as any)) {
                        if (BN.isBN(value)) {
                            console.log('key', key, 'value', (value as BN).toString(10));
                        }
                    }
                }
            }
        }
    }
}

void main();