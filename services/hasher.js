// fallback version
import pkg from "js-sha3";
const keccak256 = pkg.keccak256 || pkg.keccak_256 || pkg.default?.keccak256;

export function createHash(text, label) {
  const raw = `${text}|${label}`;
  if (typeof keccak256 !== "function") {
    throw new Error("keccak256 is not a function. Check js-sha3 import.");
  }
  const hash = keccak256(raw);
  return { raw, hash };
}
