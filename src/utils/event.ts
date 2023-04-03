import { EventData, Idl } from '@coral-xyz/anchor';
import { IdlEventField } from '@coral-xyz/anchor/dist/cjs/idl';
import { Event as VNEvent } from '../types/event';
import { EventProperty } from '../types/eventProperty';
import { IdlNonPrimitiveType, IdlPrimitiveType } from './idl';
import { anchorNonPrimitiveToEventProperty, anchorPrimitiveToEventProperty } from './anchor';

export function parseEvent(name: string, data: EventData<IdlEventField, Record<string, never>>, fields: IdlEventField[], idl: Idl): VNEvent {
    const properties: EventProperty[] = [];
    // we ignore index as it is unused in our program
    for (const { name: fieldName, type: fieldType } of fields) {
        const value = data[fieldName];
        // check if it is a primitive value!
        if (typeof fieldType === 'string') {
            const castedFieldType = fieldType as IdlPrimitiveType;
            const property = anchorPrimitiveToEventProperty(fieldName, castedFieldType, value);

            properties.push(property);
        } else {
            const castedFieldType = fieldType as IdlNonPrimitiveType;
            const property = anchorNonPrimitiveToEventProperty(fieldName, castedFieldType, idl, value);

            if (Array.isArray(property)) {
                properties.push(...property);
            } else {
                properties.push(property);
            }
        }
    }

    return {
        name,
        properties
    };
}