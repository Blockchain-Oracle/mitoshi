#!/usr/bin/env python3
"""
An independent mirror of `RangeMath` and of the Moonshot strike solve, in Python's arbitrary integers,
that writes `moonshot.vectors.json` — the rows `moonshot.test.ts` (the browser's mirror) and
`contracts/test/MoonshotVectors.t.sol` (the contract's library) both assert. The CDF table is the
contract's own packed hex, not the TypeScript array, so the three implementations share no code.

    python3 packages/core/src/range/moonshot.vectors.py

The method is context/43's: the range vectors were produced the same way in that session.
"""
from __future__ import annotations

import json
from pathlib import Path

# RangeMath.CDF — Φ(z) × 1e6 for z = 0.00, 0.05 … 4.00, three bytes an entry (81 entries).
CDF_HEX = (
    "07a12007ef03083cb4088a0208d6bc0922b2096db709b79f0a003e0a476d0a8d060ad0e80b12f30b530a0b91140bccfd0c06b1"
    "0c3e210c73440ca6100cd6810d04950d304e0d59b00d80c20da58e0dc8200de8840e06cb0e23070e3d490e55a50e6c310e8101"
    "0e942b0ea5c50eb5e60ec4a30ed2130ede4c0ee9620ef36a0efc780f049e0f0bf10f12800f185c0f1d950f223a0f26590f29fe"
    "0f2d360f300b0f32870f34b50f369c0f38450f39b60f3af60f3c0b0f3cfa0f3dc80f3e780f3f100f3f910f3fff0f405d0f40ac"
    "0f40ef0f41280f41570f417f0f41a10f41bd0f41d40f41e80f41f80f42050f42100f42190f4220"
)
CDF = bytes.fromhex(CDF_HEX)
BPS = 10_000
P_ONE = 1_000_000
E8 = 100_000_000
Z_STEP_E4 = 500
Z_MAX_E4 = 40_000
TABLE_LAST = 80


def tdiv(a: int, b: int) -> int:
    """Solidity's signed division: truncates toward zero, where Python's `//` floors."""
    q = abs(a) // abs(b)
    return q if (a >= 0) == (b > 0) else -q


def ceil_div(a: int, b: int) -> int:
    return 0 if a == 0 else (a - 1) // b + 1


def table_at(i: int) -> int:
    at = i * 3
    return (CDF[at] << 16) | (CDF[at + 1] << 8) | CDF[at + 2]


def cdf_e6(z_e4: int) -> int:
    if z_e4 < 0:
        return P_ONE - cdf_e6(-z_e4)
    if z_e4 >= Z_MAX_E4:
        return P_ONE
    i = z_e4 // Z_STEP_E4
    frac = z_e4 % Z_STEP_E4
    lo, hi = table_at(i), table_at(i + 1)
    return lo + (hi - lo) * frac // Z_STEP_E4


def probit_e4(p_e6: int) -> int:
    if p_e6 < P_ONE // 2:
        return -probit_e4(P_ONE - p_e6)
    if p_e6 >= table_at(TABLE_LAST):
        return Z_MAX_E4
    i = 0
    while table_at(i + 1) <= p_e6:
        i += 1
    lo, hi = table_at(i), table_at(i + 1)
    return i * Z_STEP_E4 + (p_e6 - lo) * Z_STEP_E4 // (hi - lo)


def isqrt(x: int) -> int:
    if x == 0:
        return 0
    z = (x + 1) // 2
    y = x
    while z < y:
        y = z
        z = (x // z + z) // 2
    return y


def std_e8(sigma_e8: int, tau_sec: int) -> int:
    return sigma_e8 * isqrt(tau_sec * 10_000) // 100


def z_of(print_: int, opening: int, std: int) -> int:
    rel_e8 = tdiv((print_ - opening) * E8, opening)
    return tdiv(rel_e8 * 10_000, std)


def band_prob_e6(opening: int, low: int, high: int, center_q_e6: int, sigma_e8: int, tau_sec: int) -> int:
    std = std_e8(sigma_e8, tau_sec)
    mu = probit_e4(center_q_e6)
    upper = cdf_e6(z_of(high, opening, std) - mu)
    lower = cdf_e6(z_of(low, opening, std) - mu)
    return upper - lower if upper > lower else 0


def floor_stake(max_payout: int, prob_raw: int, one: int, margin_bps: int) -> int:
    fair = ceil_div(max_payout * prob_raw, one)
    return ceil_div(fair * (BPS + margin_bps), BPS)


# ---------------------------------------------------------------- the Moonshot solve

FAR_FACTOR = 4
FLOOR_PRINT = 1
MAX_NUDGE_CENTS = 10_000


def target_prob_e6(multiple: int, margin_bps: int) -> int:
    return P_ONE * BPS // (multiple * (BPS + margin_bps))


def rung_holds(prob_raw: int, multiple: int, one: int, margin_bps: int) -> bool:
    return floor_stake(one, prob_raw, one, margin_bps) * multiple <= one


def band_of(direction: str, opening: int, strike: int) -> tuple[int, int]:
    return (strike, opening * FAR_FACTOR) if direction == "long" else (FLOOR_PRINT, strike)


def solve_strike(direction: str, multiple: int, opening: int, center_q_e6: int, sigma_e8: int, tau_sec: int, margin_bps: int, one: int) -> int:
    p = target_prob_e6(multiple, margin_bps)
    std = std_e8(sigma_e8, tau_sec)
    mu = probit_e4(center_q_e6)
    z_k = mu + (probit_e4(P_ONE - p) if direction == "long" else probit_e4(p))
    strike = opening + tdiv(opening * z_k * std, 10_000 * E8)
    step = 1 if direction == "long" else -1
    for _ in range(MAX_NUDGE_CENTS):
        low, high = band_of(direction, opening, strike)
        prob_raw = band_prob_e6(opening, low, high, center_q_e6, sigma_e8, tau_sec) * one // P_ONE
        if rung_holds(prob_raw, multiple, one, margin_bps):
            return strike
        strike += step
    raise RuntimeError("the nudge did not converge")


# ---------------------------------------------------------------- the rows

ONE = 1_000_000
MARGIN_BPS = 1_200
BTC = {"asset": "BTC", "openingPrint": 7_673_523, "sigmaE8": 6_200}
ETH = {"asset": "ETH", "openingPrint": 243_512, "sigmaE8": 7_800}
RUNGS = [2, 3, 5, 10, 25]
PAYOUTS = {2: 500 * ONE, 3: 100 * ONE, 5: 20 * ONE, 10: 5 * ONE, 25: 1 * ONE}

CASES: list[tuple[str, dict, int, int, list[int]]] = [
    ("BTC centred, 4 min left", BTC, 500_000, 240, RUNGS),
    ("BTC book leaning down, 15 min left", BTC, 453_500, 900, [2, 5, 25]),
    ("ETH book leaning up, 1 h left", ETH, 620_000, 3_600, [3, 10, 25]),
    ("BTC at the two-day horizon", BTC, 500_000, 172_800, [25]),
]


def rows() -> list[dict]:
    out = []
    for label, asset, center, tau, rungs in CASES:
        for multiple in rungs:
            for direction in ("long", "short"):
                strike = solve_strike(direction, multiple, asset["openingPrint"], center, asset["sigmaE8"], tau, MARGIN_BPS, ONE)
                low, high = band_of(direction, asset["openingPrint"], strike)
                inside = band_prob_e6(asset["openingPrint"], low, high, center, asset["sigmaE8"], tau)
                prob_raw = inside * ONE // P_ONE
                payout = PAYOUTS[multiple]
                stake = floor_stake(payout, prob_raw, ONE, MARGIN_BPS)
                assert stake * multiple <= payout, (label, multiple, direction)
                out.append(
                    {
                        "name": f"{label}, {direction} ×{multiple}",
                        "direction": direction,
                        "multiple": multiple,
                        "openingPrint": str(asset["openingPrint"]),
                        "centerQE6": center,
                        "sigmaE8": asset["sigmaE8"],
                        "tauSec": tau,
                        "marginBps": MARGIN_BPS,
                        "one": str(ONE),
                        "maxPayout": str(payout),
                        "expect": {
                            "targetProbE6": str(target_prob_e6(multiple, MARGIN_BPS)),
                            "strikePrint": str(strike),
                            "lowPrint": str(low),
                            "highPrint": str(high),
                            "insideProbE6": str(inside),
                            "probRaw": str(prob_raw),
                            "floorStake": str(stake),
                            "multiplierMilli": payout * 1000 // stake,
                        },
                    }
                )
    return out


def main() -> None:
    vectors = rows()
    doc = {
        "note": "Generated by moonshot.vectors.py, an independent Python mirror of RangeMath's integer arithmetic and the Moonshot strike solve; asserted by forge (MoonshotVectors.t.sol) and vitest (moonshot.test.ts).",
        "count": len(vectors),
        "vectors": vectors,
    }
    path = Path(__file__).with_name("moonshot.vectors.json")
    path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {len(vectors)} vectors to {path}")


if __name__ == "__main__":
    main()
