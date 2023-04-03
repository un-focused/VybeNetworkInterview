// is it a type of IdlTypeDefined
import { IdlType } from '@coral-xyz/anchor/dist/cjs/idl';

export function isIdlTypeDefined(type: IdlType) {
    return typeof type !== 'string' && 'defined' in type;
}

// is it a type of IdlTypeOption
export function isIdlTypeOption(type: IdlType) {
    return typeof type !== 'string' && 'option' in type;
}

// is it a type of IdlTypeCOption
export function isIdlTypeCOption(type: IdlType) {
    return typeof type !== 'string' && 'defined' in type;
}

// is it a type of IdlTypeVec
export function isIdlTypeVec(type: IdlType) {
    return typeof type !== 'string' && 'vec' in type;
}

// is it a type of IdlTypeArray
export function isIdlTypeArray(type: IdlType) {
    return typeof type !== 'string' && 'array' in type;
}