import BN from 'bn.js';

export type EventProperty = {
    name: string;
    value: string | number | boolean | BN | EventProperty[] | EventProperty;
    type: 'string' | 'number' | 'bn' | 'boolean' | 'object' | 'array' | 'enum';
}