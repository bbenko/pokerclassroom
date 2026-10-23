"""Regression checks for the independent history reviewer."""
import importlib.util
from pathlib import Path
import tempfile
import subprocess
import sys
import unittest

spec = importlib.util.spec_from_file_location('history_audit', Path(__file__).resolve().parents[1] / 'scripts/review-histories.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class HistoryAuditTests(unittest.TestCase):
    def test_hand_ranking(self):
        examples = ['Ac Jd 9s 6h 3c', 'Ac Ad 9s 6h 3c', 'Ac Ad 9s 9h 3c', 'Ac Ad As 6h 3c', '9c 8d 7s 6h 5c', 'Ac Jc 9c 6c 3c', 'Ac Ad As 6h 6c', 'Ac Ad As Ah 3c', 'Ac Kc Qc Jc Tc']
        scores = [audit.rank(s.split()) for s in examples]
        self.assertEqual([s[0] for s in scores], list(range(9)))
        self.assertEqual(scores, sorted(scores))
        self.assertEqual(audit.rank('Ac 2c 3c 4c 5c Kd Qd'.split()), (8, 5))
        self.assertEqual(audit.rank('Ac Ad As Kc Kd Ks 2h'.split()), (6, 14, 13))

    def check_corruption(self, original, replacement):
        text = (Path(__file__).parent / 'fixtures/hand-000196.txt').read_text()
        self.assertIn(original, text)
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'hand.txt'
            file.write_text(text.replace(original, replacement, 1))
            with self.assertRaises(AssertionError): audit.audit(file)

    def test_wrong_winner_detected(self):
        self.check_corruption('Noah collected $202.50', 'You collected $202.50')

    def test_wrong_call_detected(self):
        self.check_corruption('Noah: calls $4.00', 'Noah: calls $3.50')

    def test_out_of_turn_detected(self):
        self.check_corruption('You: raises $1.50 to $2.50', 'Mara: raises $1.50 to $2.50')

    def test_wrong_pot_detected(self):
        self.check_corruption('Total pot $202.50', 'Total pot $203.00')

    def test_wrong_raise_detected(self):
        self.check_corruption('You: raises $32.00 to $48.00', 'You: raises $31.00 to $48.00')

    def test_cli_fails_for_empty_input(self):
        with tempfile.TemporaryDirectory() as folder:
            result = subprocess.run([sys.executable, str(spec.origin), folder], capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('No hand histories', result.stderr)

    def test_cli_reports_corruption_and_returns_failure(self):
        text = (Path(__file__).parent / 'fixtures/hand-000196.txt').read_text()
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'hand-000196.txt'
            file.write_text(text.replace('Noah collected $202.50', 'You collected $202.50'))
            result = subprocess.run([sys.executable, str(spec.origin), folder], capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            import json
            report = json.loads((Path(folder) / 'review/audit.json').read_text())
            self.assertEqual(len(report['rules_failures']), 1)


if __name__ == '__main__': unittest.main()
