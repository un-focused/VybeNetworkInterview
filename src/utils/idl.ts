// is it a type of IdlTypeDefined
import {
    IdlTypeArray,
    IdlTypeCOption, IdlTypeDef,
    IdlTypeDefined, IdlTypeDefTy,
    IdlTypeOption,
    IdlTypeVec
} from '@coral-xyz/anchor/dist/cjs/idl';
import { BorshCoder, EventParser, Idl } from '@coral-xyz/anchor';
import { EventProperty } from '../types/eventProperty';
import { anchorNonPrimitiveToEventProperty, anchorPrimitiveToEventProperty } from './anchor';
import { MANGO_V4_PUBLIC_KEY } from '../constants';
import { PublicKey } from '@solana/web3.js';

// u32, i8, & i16 are omitted as it is not in the events type
// 'bool' | 'f32' | 'f64' | 'i128' | 'i64' | 'publicKey' | 'u128' | 'u16' | 'u64' | 'u8';
export type IdlPrimitiveType = "bool" | "u8" | "i8" | "u16" | "i16" | "u32" | "i32" | "f32" | "u64" | "i64" | "f64" | "u128" | "i128" | "u256" | "i256" | "bytes" | "string" | "publicKey";
export type IdlNonPrimitiveType = IdlTypeDefined | IdlTypeOption | IdlTypeCOption | IdlTypeVec | IdlTypeArray;

export function setupIdlTools(key: PublicKey, idl: Idl) {
    const coder = new BorshCoder(idl);
    const parser = new EventParser(key, coder);

    return { coder, parser };
}

export function findTypeDefInIDL(idl: Idl, name: string): IdlTypeDef | undefined {
    return idl.types?.find(
        (type) => type.name == name
    );
}

export function idlTypeDefTyToEventProperty(idlTypeDefTy: IdlTypeDefTy, idl: Idl, value: unknown): EventProperty[] {
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
                const p = anchorPrimitiveToEventProperty(name, type as IdlPrimitiveType, castedValue[name]);
                properties.push(p);
                continue;
            }

            const p = anchorNonPrimitiveToEventProperty(name, type as IdlNonPrimitiveType, idl, castedValue[name]);
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