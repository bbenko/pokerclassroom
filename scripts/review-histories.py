"""Independent audit of exported text; does not import the application engine."""
import collections
import itertools
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'evals/latest'
OUT = SOURCE / 'review'
RANKS = '23456789TJQKA'


def rank5(cards):
    values = sorted((RANKS.index(c[0]) + 2 for c in cards), reverse=True)
    groups = sorted(((n, v) for v, n in collections.Counter(values).items()), reverse=True)
    unique = sorted(set(values), reverse=True)
    straight = (unique[0] if len(unique) == 5 and unique[0] - unique[-1] == 4
                else 5 if unique == [14, 5, 4, 3, 2] else 0)
    flush = len({c[1] for c in cards}) == 1
    if flush and straight: return (8, straight)
    if groups[0][0] == 4: return (7, groups[0][1], groups[1][1])
    if [g[0] for g in groups] == [3, 2]: return (6, groups[0][1], groups[1][1])
    if flush: return (5, *values)
    if straight: return (4, straight)
    if groups[0][0] == 3: return (3, groups[0][1], *sorted((g[1] for g in groups[1:]), reverse=True))
    pairs = sorted((v for n, v in groups if n == 2), reverse=True)
    if len(pairs) == 2: return (2, *pairs, next(v for n, v in groups if n == 1))
    if pairs: return (1, pairs[0], *sorted((v for n, v in groups if n == 1), reverse=True))
    return (0, *values)


def rank(cards):
    return max(map(rank5, itertools.combinations(cards, 5)))


def units(s):
    value = float(s) * 2
    assert value.is_integer(), f'Invalid chip increment {s}'
    return int(value)


def audit(file):
    text = file.read_text()
    lines = text.splitlines()
    names, initial, holes = [], {}, {}
    for line in lines:
        m = re.match(r'Seat (\d+): (\w+) \(\$([\d.]+) in chips\)', line)
        if m:
            names.append(m[2]); initial[m[2]] = units(m[3])
        m = re.match(r'(?:Dealt to (\w+)|(?:(\w+): shows)) \[([^]]+)\]', line)
        if m: holes[m[1] or m[2]] = m[3].split()
    n = len(names)
    button = int(re.search(r'Seat #(\d+) is the button', text)[1]) - 1
    stack = initial.copy()
    contribution = dict.fromkeys(names, 0)
    bets = dict.fromkeys(names, 0)
    folded, board, seen_cards = set(), [], []
    for cards in holes.values(): seen_cards.extend(cards)
    assert len(set(seen_cards)) == len(seen_cards), 'Duplicate visible hole cards'
    current, last_raise, street, raises = 2, 2, 0, 0
    acted = dict.fromkeys(names)
    pending = set(names)
    after = (button + 2) % n
    collected = collections.Counter()
    candidates = []
    action_count = 0
    for line_no, line in enumerate(lines, 1):
        if line == '*** SUMMARY ***': break
        m = re.match(r'(\w+): posts (small|big) blind \$([\d.]+)', line)
        if m:
            name, amount = m[1], units(m[3])
            stack[name] -= amount; contribution[name] += amount; bets[name] += amount
            continue
        m = re.match(r'\*\*\* (FLOP|TURN|RIVER) \*\*\* (.+)', line)
        if m:
            assert not pending, f'Unfinished betting round before {m[1]}'
            new_board = ' '.join(re.findall(r'\[([^]]+)\]', m[2])).split()
            assert new_board[:len(board)] == board, 'Board changed'
            assert len(new_board) == {'FLOP':3, 'TURN':4, 'RIVER':5}[m[1]]
            board = new_board
            assert len(set(seen_cards + board)) == len(seen_cards + board), 'Duplicate cards'
            bets = dict.fromkeys(names, 0); current = 0; last_raise = 2
            acted = dict.fromkeys(names); street += 1; raises = 0
            pending = {p for p in names if p not in folded and stack[p] > 0}
            if len(pending) < 2: pending.clear()
            after = button
            continue
        m = re.match(r'Uncalled bet \(\$([\d.]+)\) returned to (\w+)', line)
        if m:
            amount, p = units(m[1]), m[2]
            assert amount == bets[p] - max(v for q, v in bets.items() if q != p), 'Wrong uncalled refund'
            stack[p] += amount; contribution[p] -= amount; bets[p] -= amount
            continue
        m = re.match(r'(\w+) collected \$([\d.]+) from', line)
        if m: collected[m[1]] += units(m[2]); continue
        m = re.match(r'(\w+): (folds|checks|calls|bets|raises)(?: \$([\d.]+))?(?: to \$([\d.]+))?( and is all-in)?$', line)
        if not m: continue
        p, action, size, target, allin = m.groups()
        action_count += 1
        expected = next(names[(after + offset) % n] for offset in range(1, n + 1) if names[(after + offset) % n] in pending)
        assert p == expected, f'Out of turn: {p}, expected {expected}'
        call = min(current - bets[p], stack[p])
        pot = sum(contribution.values())
        # Review triggers are deliberately separate from rule failures.
        if p in holes:
            values = sorted((RANKS.index(c[0]) + 2 for c in holes[p]), reverse=True)
            own_rank = rank(holes[p] + board) if len(board) >= 3 else None
            label = None
            if street == 0 and raises >= 2 and action in ('calls', 'raises') and values[0] != values[1] and values[1] < 10:
                label = 'weak_nonpair_continues_against_reraise'
            if street == 3 and action == 'raises' and own_rank[0] <= 2:
                label = 'river_raise_with_two_pair_or_less'
            if street == 3 and action == 'calls' and own_rank[0] == 0 and call * 2 >= pot:
                label = 'large_river_call_with_high_card'
            if street == 3 and action == 'folds':
                # Absolute nuts is provable without seeing opponents' cards.
                available = [r+s for r in RANKS for s in 'cdhs' if r+s not in holes[p]+board]
                best_other = max(rank(list(pair)+board) for pair in itertools.combinations(available, 2))
                if own_rank >= best_other: label = 'folded_unbeatable_river_hand'
            if label:
                candidates.append(dict(file=file.name, line=line_no, player=p, street=street, cards=holes[p], board=board[:], action=line, pot_bb=pot/2, call_bb=call/2, prior_raises=raises, trigger=label))
        if action == 'folds':
            assert call > 0, 'Fold with free check'; folded.add(p)
        elif action == 'checks': assert call == 0, 'Check facing a bet'
        elif action == 'calls':
            amount = units(size); assert amount == call and call > 0, 'Wrong call amount'
            stack[p] -= amount; bets[p] += amount; contribution[p] += amount
        else:
            to = units(target or size)
            assert to > current and to <= bets[p] + stack[p], 'Invalid raise target'
            assert acted[p] is None or current - acted[p] >= last_raise, 'Betting not reopened'
            assert any(q != p and q not in folded and stack[q] > 0 and bets[q]+stack[q] > current for q in names), 'No eligible responder'
            increase = to - current
            assert increase >= last_raise or to == bets[p] + stack[p], 'Undersized raise'
            if action == 'raises': assert units(size) == increase, 'Wrong raise increment'
            else: assert current == 0, 'Bet facing a bet'
            amount = to - bets[p]; stack[p] -= amount; contribution[p] += amount; bets[p] = to
            if increase >= last_raise: last_raise = increase
            current = to; raises += 1
            pending.update(q for q in names if q != p and q not in folded and stack[q] > 0 and bets[q] < current)
        if allin: assert stack[p] == 0, 'False all-in marker'
        acted[p] = current
        pending.discard(p)
        pending = {q for q in pending if q not in folded and stack[q] > 0}
        able = [q for q in names if q not in folded and stack[q] > 0]
        if len(names) - len(folded) == 1 or (len(able) <= 1 and (not able or bets[able[0]] >= current)): pending.clear()
        after = names.index(p)
    assert not pending, 'Hand ended with pending action'
    live = [p for p in names if p not in folded]
    expected_paid = collections.Counter()
    previous = 0
    for level in sorted(set(contribution.values()) - {0}):
        contributors = [p for p in names if contribution[p] >= level]
        eligible = [p for p in contributors if p not in folded]
        amount = (level - previous) * len(contributors); previous = level
        if len(live) == 1: winners = live
        else:
            assert len(board) == 5 and all(p in holes for p in live), 'Missing showdown information'
            best = max(rank(holes[p] + board) for p in eligible)
            winners = [p for p in eligible if rank(holes[p] + board) == best]
        share, odd = divmod(amount, len(winners))
        ordered = [names[(button + k) % n] for k in range(1,n+1) if names[(button+k)%n] in winners]
        for i, p in enumerate(ordered): expected_paid[p] += share + (i < odd)
    assert expected_paid == collected, f'Payout mismatch: expected {dict(expected_paid)}, got {dict(collected)}'
    total = units(re.search(r'Total pot \$([\d.]+)', text)[1])
    assert total == sum(contribution.values()) == sum(collected.values()), 'Total pot mismatch'
    assert sum(stack.values()) + sum(collected.values()) == sum(initial.values()), 'Chip conservation'
    return candidates, action_count


def main(source=SOURCE):
    files = sorted(source.glob('hand-*.txt'))
    if not files:
        raise SystemExit(f'No hand histories found in {source}. Run the simulator first.')
    out = source / 'review'
    out.mkdir(exist_ok=True)
    failures, candidates, actions = [], [], 0
    for file in files:
        try:
            flags, count = audit(file); candidates.extend(flags); actions += count
        except Exception as e:
            failures.append(dict(file=file.name, reason=str(e), error=type(e).__name__))
    result = dict(files_reviewed=len(files), actions_checked=actions, rules_failures=failures, strategy_review_candidates=candidates,
                  method='Independent text parser, betting ledger, action-order and minimum-raise checks, exhaustive five-card-combination showdown evaluator, contribution-layer payout calculation. No engine imports. Strategy triggers are candidates, not proven mistakes.')
    (out / 'audit.json').write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(dict(files=len(files), actions=actions, failures=failures, candidates=candidates), indent=2))
    return 1 if failures else 0

if __name__ == '__main__':
    import sys
    sys.exit(main(Path(sys.argv[1]) if len(sys.argv) > 1 else SOURCE))
