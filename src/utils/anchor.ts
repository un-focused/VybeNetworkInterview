import { findTypeDefInIDL, IdlNonPrimitiveType, IdlPrimitiveType, idlTypeDefTyToEventProperty } from './idl';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';
import { EventProperty } from '../types/eventProperty';
import { Idl } from '@coral-xyz/anchor';
import { IdlType } from '@coral-xyz/anchor/dist/cjs/idl';

/**
 * convert the anchor property to an event property
 * @param name of the property
 * @param type of the property
 * @param value to be converted
 */
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

function anchorListTypeToEventProperties(idl: Idl, name: string, type: IdlType, castedValue: []): EventProperty {
    const properties: EventProperty[] = [];
    for (const val of castedValue) {
        let property: EventProperty | EventProperty[];
        if (typeof type === 'string') {
            property = anchorPrimitiveToEventProperty(name, type as IdlPrimitiveType, val);
        } else {
            property = anchorNonPrimitiveToEventProperty(name, type as IdlNonPrimitiveType, idl, val);
        }

        if (Array.isArray(property)) {
            properties.push(...property);
        } else {
            properties.push(property);
        }
    }

    return {
        name,
        type: 'array',
        value: properties
    };
}

/**
 * handles the following: IdlTypeOption | IdlTypeCOption | IdlTypeVec | IdlTypeArray;
 * parses the abovce to an event property (similar to primitive version, see above)
 * @param name of the property
 * @param type of the property
 * @param idl helpful in parsing the property (inner types)
 * @param value to be converted
 */
export function anchorNonPrimitiveToEventProperty(name: string, type: IdlNonPrimitiveType, idl: Idl, value: unknown): EventProperty | EventProperty[] {
    // assumption: defined type is never a primitive
    if ('defined' in type) {
        const { defined } = type;
        // find the type def
        const idlTypeDef = findTypeDefInIDL(idl, defined);
        // if not found, huge issue
        if (!idlTypeDef) {
            throw new Error('COULD NOT FIND: ' + defined);
        }

        // get the type
        const idlTypeDefTy = idlTypeDef.type;
        // extract the properties from the type
        const properties = idlTypeDefTyToEventProperty(idlTypeDefTy, idl, value);
        // return parsed data
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
        // array as list type
        const { vec } = type;
        // convert to array as we know it is a list type
        const castedValue = value as [];

        return anchorListTypeToEventProperties(idl, name, vec, castedValue)
    } else if ('array' in type) {
        // extract array property
        const { array } = type;
        // size is unused
        const [innerType] = array;

        // convert to array as we know it is a list type
        const castedValue = value as [];

        return anchorListTypeToEventProperties(idl, name, innerType, castedValue);
    }

    throw new Error('no known type: ' + JSON.stringify(type));
}