/**
 * Checks the Game Genie codec against published codes.
 *
 * Run with:  node --experimental-strip-types scripts/verify-gamegenie.mjs
 *
 * The bit scramble is easy to get subtly wrong in a way that still produces
 * plausible-looking output, so this pins the decoder to known values and
 * round-trips the encoder back through it.
 */

import { decodeGameGenie, encodeGameGenie, isValidGameGenieCode, parseRawCheat } from '../src/utils/gameGenie.ts';

let failures = 0;

function check(label, actual, expected) {
    const ok = actual === expected;
    if (!ok) failures++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `  (got ${actual}, want ${expected})`}`);
}

const hex = (n, d) => (n === undefined ? 'undefined' : `$${n.toString(16).toUpperCase().padStart(d, '0')}`);

/* --- Decoding: 6-letter codes ------------------------------------------- */

// SXIOPO is the canonical anchor: the Super Mario Bros. infinite-lives code,
// published everywhere as $91D9 = $AD. If the bit scramble is wrong anywhere,
// this is the check that catches it.
const six = [
    // code,      address, value
    ['SXIOPO', 0x91d9, 0xad],
    ['IATOZA', 0x906a, 0x05],
];

for (const [code, address, value] of six) {
    const decoded = decodeGameGenie(code);
    check(`decode ${code} address`, hex(decoded?.address, 4), hex(address, 4));
    check(`decode ${code} value`, hex(decoded?.value, 2), hex(value, 2));
    check(`decode ${code} has no compare`, String(decoded?.compare), 'undefined');
}

/* --- Round-trip: encode(decode(x)) === x -------------------------------- */

// Every 8-letter entry here has the length flag set (third letter drawn from
// EOXUKSVN), which is what makes it well formed.
const roundTrip = ['SXIOPO', 'IATOZA', 'SLXPLOVS', 'GXXZOZLE', 'YEUZUGAA'];
for (const code of roundTrip) {
    const d = decodeGameGenie(code);
    if (!d) { console.log(`FAIL  ${code} did not decode`); failures++; continue; }
    check(`round-trip ${code}`, encodeGameGenie(d.address, d.value, d.compare), code);
}

/* --- 8-letter codes carry a compare byte -------------------------------- */

const eight = decodeGameGenie('SLXPLOVS');
check('SLXPLOVS decodes a compare byte', eight?.compare !== undefined ? 'yes' : 'no', 'yes');
check('SLXPLOVS address is in PRG space', String((eight?.address ?? 0) >= 0x8000), 'true');

// The length flag is bit 3 of the third nibble; dropping it shifts one letter.
check('encoder sets the 8-letter length flag', encodeGameGenie(0x9123, 0xbd, 0xde).length === 8 ? '8' : 'bad', '8');
check(
    'encoder emits the published SLXPLOVS form',
    encodeGameGenie(eight.address, eight.value, eight.compare),
    'SLXPLOVS'
);

// A malformed 8-letter code (length flag clear) still decodes — the decoder
// never reads that bit — but re-encoding normalises it to the canonical form.
const malformed = decodeGameGenie('AEZLGITY');
check('malformed 8-letter code still decodes', malformed ? 'yes' : 'no', 'yes');
check(
    're-encoding normalises the length flag',
    encodeGameGenie(malformed.address, malformed.value, malformed.compare),
    'AEXLGITY'
);

/* --- Validation --------------------------------------------------------- */

check('rejects a 7-letter code', String(isValidGameGenieCode('SXIOPOA')), 'false');
// Only APZLGITYEOXUKSVN are Game Genie letters — B, C, D, F, H, ... are not.
check('rejects letters outside the alphabet', String(isValidGameGenieCode('AEBLTG')), 'false');
check('decoder returns null for those too', String(decodeGameGenie('AEBLTG')), 'null');
check('accepts a hyphenated code', String(isValidGameGenieCode('SXIO-PO')), 'true');
check('accepts lowercase', String(isValidGameGenieCode('sxiopo')), 'true');

/* --- Raw cheats --------------------------------------------------------- */

check('parses AAAA:VV', hex(parseRawCheat('91D9:AD')?.address, 4), '$91D9');
check('parses AAAA:VV value', hex(parseRawCheat('91D9:AD')?.value, 2), '$AD');
check('parses AAAA?CC:VV compare', hex(parseRawCheat('9123?DE:BD')?.compare, 2), '$DE');
check('rejects nonsense', String(parseRawCheat('hello')), 'null');

console.log(failures === 0 ? '\nAll Game Genie checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
