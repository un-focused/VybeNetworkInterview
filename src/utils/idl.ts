import {
    IdlEvent,
    IdlTypeArray,
    IdlTypeCOption, IdlTypeDef,
    IdlTypeDefined, IdlTypeDefTy,
    IdlTypeOption,
    IdlTypeVec
} from '@coral-xyz/anchor/dist/cjs/idl';
import { BorshCoder, EventParser, Idl } from '@coral-xyz/anchor';
import { EventProperty } from '../types/eventProperty';
import { anchorNonPrimitiveToEventProperty, anchorPrimitiveToEventProperty } from './anchor';
import { PublicKey } from '@solana/web3.js';

export type IdlPrimitiveType = "bool" | "u8" | "i8" | "u16" | "i16" | "u32" | "i32" | "f32" | "u64" | "i64" | "f64" | "u128" | "i128" | "u256" | "i256" | "bytes" | "string" | "publicKey";
export type IdlNonPrimitiveType = IdlTypeDefined | IdlTypeOption | IdlTypeCOption | IdlTypeVec | IdlTypeArray;

/**
 * setups up the tools for the IDL & program
 * @param key of the program
 * @param idl to parse the program
 */
export function setupIdlTools(key: PublicKey, idl: Idl) {
    // we know events must be defined (if not a crash makes sense as we do not want to continue)
    const events = idl.events!;
    const eventMap = new Map<string, IdlEvent>();
    const coder = new BorshCoder(idl);
    const parser = new EventParser(key, coder);
    // construct event mapp
    for (const event of events) {
        eventMap.set(event.name, event);
    }

    return { coder, parser, eventMap };
}

/**
 * find type def in IDL
 * @param idl to search in
 * @param name to find
 */
export function findTypeDefInIDL(idl: Idl, name: string): IdlTypeDef | undefined {
    return idl.types?.find(
        (type) => type.name == name
    );
}

/**
 * converts the IDLTypeDef to an EventProperty type
 * @param idlTypeDefTy to be parse
 * @param idl used to convert
 * @param value of what we are trying to parse into an EventProperty
 */
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

        // parse the enum
        const { variants } = idlTypeDefTy;
        // go through each key
        for (const key of Object.keys(castedValue)) {
            // iterate through each variant (enum value)
            for (const variant of variants) {
                // if name matches
                if (variant.name.toLowerCase() === key.toLowerCase()) {
                    // push enum to array
                    properties.push(
                        {
                            name: key,
                            type: 'string',
                            value: variant.name
                        }
                    );
                    // only one variant can match one key
                    break;
                }
            }
        }

        return properties;
    }
    // struct typedef, if struct
    else if (idlTypeDefTy.kind === 'struct') {
        const castedValue = value as {
            [key: string]: unknown;
        };
        const properties: EventProperty[] = [];
        const { fields } = idlTypeDefTy;
        for (const { name, type } of fields) {
            // if string then primitive type
            if (typeof type === 'string') {
                const p = anchorPrimitiveToEventProperty(name, type as IdlPrimitiveType, castedValue[name]);
                properties.push(p);
                continue;
            }

            const eventProperty = anchorNonPrimitiveToEventProperty(name, type as IdlNonPrimitiveType, idl, castedValue[name]);
            // may return an array so take appropriate action to handle this case
            if (Array.isArray(eventProperty)) {
                properties.push(...eventProperty);
            } else {
                properties.push(eventProperty);
            }
        }

        return properties;
    }

    return [];
}