import { findTypeDefInIDL, IdlNonPrimitiveType, IdlPrimitiveType, idlTypeDefTyToEventProperty } from './idl';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { EventProperty } from '../types/eventProperty';
import { Idl } from '@coral-xyz/anchor';

export function anchorPrimitiveToEventProperty(name: string, type: IdlPrimitiveType, value: unknown): EventProperty {
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

// IdlTypeOption | IdlTypeCOption | IdlTypeVec | IdlTypeArray;
export function anchorNonPrimitiveToEventProperty(name: string, type: IdlNonPrimitiveType, idl: Idl, value: unknown): EventProperty | EventProperty[] {
    // assumption: defined type is never a primitive
    if ('defined' in type) {
        const { defined } = type;
        const idlTypeDef = findTypeDefInIDL(idl, defined);
        if (!idlTypeDef) {
            throw 'COULD NOT FIND: ' + defined;
        }

        const idlTypeDefTy = idlTypeDef.type;
        const properties = idlTypeDefTyToEventProperty(idlTypeDefTy, idl, value);
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
                property = anchorPrimitiveToEventProperty(name, vec as IdlPrimitiveType, val);
            } else {
                property = anchorNonPrimitiveToEventProperty(name, vec as IdlNonPrimitiveType, idl, val);
            }

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
                property = anchorPrimitiveToEventProperty(name, innerType as IdlPrimitiveType, val);
            } else {
                property = anchorNonPrimitiveToEventProperty(name, innerType as IdlNonPrimitiveType, idl, val);
            }

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