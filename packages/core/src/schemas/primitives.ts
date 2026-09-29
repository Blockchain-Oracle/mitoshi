/** zod validators for the core primitives (the types and guards stay zod-free in `types/primitives.ts`, §3.1). */
import { z } from "zod";
import { isAddress, isBytes32, isHex, type Address, type Bytes32, type Hex } from "../types/primitives";

export const hexSchema = z.custom<Hex>(isHex, "expected 0x-prefixed hex");
export const addressSchema = z.custom<Address>(isAddress, "expected a 20-byte address");
export const bytes32Schema = z.custom<Bytes32>(isBytes32, "expected a 32-byte hex value");
