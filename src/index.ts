import { Connection, GetVersionedTransactionConfig, PublicKey, VersionedTransactionResponse } from '@solana/web3.js';
import { BorshCoder, BorshInstructionCoder, EventData, EventParser, Idl } from '@coral-xyz/anchor';
import idlJSON from './idl.json';
import { IdlEventField } from '@coral-xyz/anchor/dist/cjs/idl';
import BN from 'bn.js';
import bs58 from 'bs58';
import { snakeCase } from "snake-case";
import { sha256 } from "js-sha256";

import { main as sandboxMain } from './sandbox';

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

// Not technically sighash, since we don't include the arguments, as Rust
// doesn't allow function overloading.
function sighashF(nameSpace: string, ixName: string): Buffer {
    let name = snakeCase(ixName);
    let preimage = `${nameSpace}:${name}`;
    return Buffer.from(sha256.digest(preimage)).slice(0, 8);
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

    const transactions: (VersionedTransactionResponse | null)[] = await connection.getTransactions(
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
        for (const next of gen) {
            const { name, data } = next;
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
        }
        // PerpPlaceOrder
        // want: H4xgvHhm7NU
        // have: Ft2gm2vJxhU
        // want: Ft2gm2vJxhU
        // have: Bz9KX2mGFbq4fctQ7wgBr7
        const versionedMessage = transaction.transaction.message;
        for (const log of logs) {
            if (log.includes('Instruction')) {
                console.log(versionedMessage.compiledInstructions);
                const startIndex = log.indexOf('Instruction');
                // console.log('MAYBE THIS', message.instructions)
                if (message.instructions && message.instructions.length > 0) {
                    const firstInstruction = message.instructions[0];
                    // may not contain any data, no args in IDL, only accounts
                    const { data } = firstInstruction;
                    console.log('data', data);
                    const ix = bs58.decode(data);

                    console.log('ix', ix);
                    console.log('before sighash', ix.slice(0, 8), log);
                    const sighash = bs58.encode(ix.slice(0, 8));
                    console.log('sighash', sighash)
                    const dataPart = ix.slice(8);
                    // hack to access the private variable3
                    const layouts = (coder.instruction as any).sighashLayouts;
                    console.log('layouts', layouts);
                    const decoder = layouts.get(sighash);
                    console.log('DECODER', decoder);
                    console.log(log)
                    const searchStr = "Instruction: ";
                    const rawInstructionName = log.substring(log.indexOf(searchStr) + searchStr.length);
                    const parts = rawInstructionName.split('');
                    parts[0] = parts[0].toLowerCase();

                    const formattedInstructionName = parts.join('');
                    const foundInstruction = idl.instructions.find(
                        (instruction) => instruction.name === formattedInstructionName
                    );

                    console.log('formatted name', formattedInstructionName);
                    console.log('formatted name', JSON.stringify({name: formattedInstructionName}));
                    console.log('found instruction', foundInstruction);

                    if (!foundInstruction) {
                        console.log('NOT FOUND!!');
                        continue;
                    }
                    console.log('INSTRUCTION', foundInstruction);

                    const sh = sighashF('global', foundInstruction.name);
                    console.log('[INFO] SH', bs58.encode(sh));
                    // sighashLayouts.set(bs58.encode(sh), {
                    //     layout: this.ixLayout.get(ix.name),
                    //     name: ix.name,
                    // });
                    // if (!decoder) {
                    //     return null;
                    // }
                    // return {
                    //     data: decoder.layout.decode(data),
                    //     name: decoder.name,
                    // };
                    // console.log('DATA: ', data)
                    // console.log('DECODED DATA: ', result)
                    // console.log(
                    //     'WHAT IS THIS 1',
                    //     coder.instruction.decode(message.instructions[0].data, 'hex')
                    // );
                }
                // console.log('RAW FORMATTED INSTRUCTION:', log.substring(startIndex));
                // const rawInstruction = log.substring(startIndex);
                // console.log('WHAT IS THIS', coder.instruction.decode(rawInstruction));
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
// void sandboxMain();