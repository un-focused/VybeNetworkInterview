import bs58 from 'bs58';
import { snakeCase } from 'snake-case';
import { sha256 } from 'js-sha256';

function arrayToString(arr: Uint8Array) {
    return new TextDecoder().decode(arr);
}

// Not technically sighash, since we don't include the arguments, as Rust
// doesn't allow function overloading.
function sighashF(nameSpace: string, ixName: string): Buffer {
    const name = snakeCase(ixName);
    const preimage = `${nameSpace}:${name}`;
    const digested = sha256.digest(preimage);

    return Buffer.from(digested).slice(0, 8);
}

export function main() {
    const have = 'Bz9KX2mGFbqKtS6faTZXCB';
    const want = 'YjzsFQ6RT1F';
    // what i get: Ft2gm2vJxhU
    // what i want: YjzsFQ6RT1F
    // Buffer.from(sha256.digest(preimage)).slice(0, 8);

    // step 1: decode
    const ix = bs58.decode(have);
    // step 2: slice 8
    const part = ix.slice(0, 8);

    console.log(bs58.encode(part));
    // console.log(ix);
    // console.log(arrayToString(ix));
    // console.log(arrayToString(ix.slice(0, 8)));
    // console.log(arrayToString(bs58.decode(want)))
    // console.log(bs58.encode(ix.slice(0, 8)));

    /*
        HOW TO PRODUCE THE SH NAME IN THE MAP
     */
    const sh = sighashF('global', 'PerpPlaceOrder');
    console.log(bs58.encode(sh)); // => YjzsFQ6RT1F
}