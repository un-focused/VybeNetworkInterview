// is it a type of IdlTypeDefined
import {
    IdlTypeArray,
    IdlTypeCOption,
    IdlTypeDefined,
    IdlTypeOption,
    IdlTypeVec
} from '@coral-xyz/anchor/dist/cjs/idl';

// u32, i8, & i16 are omitted as it is not in the events type
// 'bool' | 'f32' | 'f64' | 'i128' | 'i64' | 'publicKey' | 'u128' | 'u16' | 'u64' | 'u8';
export type IdlPrimitiveType = "bool" | "u8" | "i8" | "u16" | "i16" | "u32" | "i32" | "f32" | "u64" | "i64" | "f64" | "u128" | "i128" | "u256" | "i256" | "bytes" | "string" | "publicKey";
export type IdlNonPrimitiveType = IdlTypeDefined | IdlTypeOption | IdlTypeCOption | IdlTypeVec | IdlTypeArray;

export function isIdlTypeDefined(type: IdlNonPrimitiveType) {
    return
}

// is it a type of IdlTypeOption
export function isIdlTypeOption(type: IdlNonPrimitiveType) {
    return 'option' in type;
}

// is it a type of IdlTypeCOption
export function isIdlTypeCOption(type: IdlNonPrimitiveType) {
    return 'coption' in type;
}

// is it a type of IdlTypeVec
export function isIdlTypeVec(type: IdlNonPrimitiveType) {
    return 'vec' in type;
}

// is it a type of IdlTypeArray
export function isIdlTypeArray(type: IdlNonPrimitiveType) {
    return 'array' in type;
}