import { Connection, GetVersionedTransactionConfig, PublicKey } from '@solana/web3.js';
import { BorshCoder, BorshInstructionCoder, EventData, EventParser, Idl } from '@coral-xyz/anchor';
import idlJSON from './idl.json';
import { IdlEventField } from '@coral-xyz/anchor/dist/cjs/idl';
import BN from 'bn.js';

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
    name:   string;
    fields: Field[];
}

export interface Field {
    name:  string;
    type:  TypeClass | TypeEnum;
    index: boolean;
}

export interface TypeClass {
    defined?: string;
    vec?:     Vec;
}

export interface Vec {
    defined: string;
}

// u32, i8, & i16 are omitted as it is not in the events type
export type TypeEnum = 'bool' | 'f32' | 'f64' | 'i128' | 'i64' | 'publicKey' | 'u128' | 'u16' | 'u64' | 'u8';
    // Bool = "bool",
    // F32 = "f32",
    // F64 = "f64",
    // I128 = "i128",
    // I64 = "i64",
    // PublicKey = "publicKey",
    // U128 = "u128",
    // U16 = "u16",
    // U64 = "u64",
    // U8 = "u8",
// }

function anchorToTypes(type: TypeEnum, data: EventData<IdlEventField, Record<string, never>>, name: string) {
    const value = data[name];
    switch (type) {
        // boolean
        case 'bool':
            console.log('casted to boolean')
            return value as boolean;
        // big number
        case 'u64': case 'u128': case 'i64': case 'i128':
            // console.log('casted to BN')
            // console.log('IS THIS A BN', BN.isBN(value));
            // Note: decimals are not supported in this library.
            const newValue = value as BN;
            // console.log('BEFORE CAST DATA', data);
            // console.log('BEFORE CAST HERE: value', value, type);
            // console.log('AFTER CAST HERE: value', newValue);
            // console.log('AFTER CAST STRING HERE: value', newValue.toString(10));
            // return value as BN;
            return newValue.toString(10);
        // number
        case 'u8': case 'u16': case 'f32': case 'f64':
            console.log('casted to number')
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
        eventMap.set(event.name, event)
        console.log(event.name)
    }
    const address = '4MangoMjqJ2firMokCjjGgoK8d4MXcrgL7XJaL3w6fVg';
    const pubKey = new PublicKey(address);
    // https://solana-labs.github.io/solana-web3.js/classes/Connection.html#constructor
    // Write some code to establish a connection to Solana mainnet via an RPC endpoint, you can use this for
    // free: https://docs.solana.com/cluster /rpc-endpoints#mainnet-beta
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'finalized');

    console.log(`connecting to ${ connection.rpcEndpoint }`);
    const signatures = await connection.getSignaturesForAddress(pubKey, { limit: 5 });
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
    const coder = new BorshCoder(idl);
    const parser = new EventParser(pubKey, coder);
    const instructionParser = new BorshInstructionCoder(idl)

    for (let i = 0; i < transactions.length; ++i) {
        const transaction = transactions[i];
        const signature = signatures[i];
        if (!transaction) {
            console.log('[INFO], NULL');
            continue;
        }

        const logs = transaction.meta?.logMessages;
        // console.log(logs);
        if (!logs) {
            console.log('no logs');
            continue;
        }
        // console.log('DATA: ', logs);
        const gen = parser.parseLogs(logs, false);
        for (const next of gen) {
            // console.log('DATA: ', JSON.stringify(next));
            const { name, data } = next;
            // console.log(`ITEM: ${ name }`);
            const event = eventMap.get(name);
            if (!event) {
                console.log('[INFO]', 'MISSING FOR NAME: ' + name);
                continue;
            }
            console.log('event found', name);
            //
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
            // console.log('\t signature:')
            // console.log('\t\t block time:', signature.blockTime)
            // console.log('\t\t signature:', signature.signature)
        }
        // Bz9KX2mGFbq3q7WLKW4ATH
        // 2DvUoCCiuh7kj
        // 3Bxs43eF7ZuXE46B
        const message = transaction.transaction.message;
        for (const log of logs) {
            if (log.includes('Instruction')) {
                const startIndex = log.indexOf('Instruction');
                console.log('MAYBE THIS', message.instructions)
                if (message.instructions && message.instructions.length > 0) {
                    console.log('INSTRUCTION', message.instructions[0].data)
                    console.log(
                        'WHAT IS THIS 1',
                        coder.instruction.decode(message.instructions[0].data, 'hex')
                    );
                }
                console.log('RAW FORMATTED INSTRUCTION:', log.substring(startIndex));
                const rawInstruction = log.substring(startIndex);
                console.log('WHAT IS THIS', coder.instruction.decode(rawInstruction));
            }
        }
        // const parsed = instructionParser.decode(message.serialize());
        // if (message.instructions && message.instructions.length > 0) {
        //     const parsed = instructionParser.decode(message.instructions[0].data, 'base58');
        //     // const parsed = coder.instruction.decode(ogs.join(' '), 'base58');
        //     // console.log('INSTRUCTIONS', message.instructions[0].data);
        //     console.log('[INSTRUCTIONS]', parsed);
        //     console.log(logs)
        //     // if (parsed != null) {
        //     // }
        // }
        // console.log('ACCOUNT KEYS', message.accountKeys);
        // console.log('INSTRUCTIONS', message.instructions);
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