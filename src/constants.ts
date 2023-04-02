import { Idl } from '@coral-xyz/anchor';

import idlJSON from './idl.json';
import { PublicKey } from '@solana/web3.js';

export const MANGO_V4_IDL: Idl = idlJSON as Idl;
export const MANGO_V4_PROGRAM_ID = '4MangoMjqJ2firMokCjjGgoK8d4MXcrgL7XJaL3w6fVg';
export const MANGO_V4_PUBLIC_KEY = new PublicKey(MANGO_V4_PROGRAM_ID);
export const MAIN_NET_SOLANA_RPC_ENDPOINT = 'https://api.mainnet-beta.solana.com';
// DOCS: Maximum number of requests per 10 seconds per IP for a single RPC: 40
// SEE: https://docs.solana.com/cluster/rpc-endpoints#mainnet-beta
export const MAIN_NET_SOLANA_RPC_RATE_LIMIT = 40;
// 5 seconds in MS
export const MAIN_NET_SOLANA_RPC_POLL_MS = 5000;