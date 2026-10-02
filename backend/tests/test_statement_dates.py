import unittest

from parsers.bank_statement_parser import BankStatementParser
from services.statement_dates import parse_statement_date, to_iso

P = {"period_start": "2026-09-01", "period_end": "2026-09-30"}
META = {"filename": "s.png", "content_type": "image/png", "size_bytes": 1}


class DateParsingTests(unittest.TestCase):
    def test_iso_passes_through_and_garbage_is_rejected(self):
        self.assertEqual(to_iso("2026-09-05"), "2026-09-05")
        for bad in (None, "", "2026-13-40", "yesterday"):
            self.assertIsNone(to_iso(bad))
            self.assertIsNone(parse_statement_date(bad, **P))

    def test_common_printed_formats_with_a_year(self):
        for text in ("05/09/2026", "05-09-26", "5.9.2026", "05-Sep-2026", "5 September 2026", "Sep 5, 2026", "05 Sep 26"):
            with self.subTest(text):
                self.assertEqual(parse_statement_date(text, **P), "2026-09-05")

    def test_year_comes_from_the_statement_period_when_not_printed(self):
        self.assertEqual(parse_statement_date("05 Sep", **P), "2026-09-05")
        self.assertEqual(parse_statement_date("05/09", **P), "2026-09-05")
        self.assertEqual(parse_statement_date("Sep 5", **P), "2026-09-05")

    def test_period_spanning_a_year_boundary_picks_the_right_year(self):
        span = {"period_start": "2025-12-15", "period_end": "2026-01-14"}
        self.assertEqual(parse_statement_date("20 Dec", **span), "2025-12-20")
        self.assertEqual(parse_statement_date("03 Jan", **span), "2026-01-03")

    def test_day_first_by_default_but_month_first_when_only_that_fits_the_period(self):
        self.assertEqual(parse_statement_date("03/04/2026"), "2026-04-03")  # day-first, year printed
        self.assertEqual(parse_statement_date("09/20/2026", **P), "2026-09-20")  # only month-first is valid
        # both readings valid; only one is inside the period
        self.assertEqual(parse_statement_date("04/09/2026", **P), "2026-09-04")

    def test_dates_that_cannot_be_placed_honestly_are_left_blank(self):
        self.assertIsNone(parse_statement_date("05 Sep"))  # no year anywhere
        self.assertIsNone(parse_statement_date("05 Aug", **P))  # inferred year, outside period
        self.assertIsNone(parse_statement_date("31/02/2026", **P))  # not a real date
        self.assertEqual(parse_statement_date("05 Aug 2026", **P), "2026-08-05")  # printed year is kept


class ParserDateTests(unittest.TestCase):
    parser = BankStatementParser()

    def build(self, txns, **header):
        return self.parser._build_response(META, {"period_start": "01/09/2026", "period_end": "30-Sep-2026", "transactions": txns, **header})

    def test_period_and_row_dates_are_read_from_printed_text(self):
        result = self.build([{"date_text": "05 Sep", "description": "A", "debit": 10}, {"date": "07/09/2026", "description": "B", "debit": 5}])
        self.assertEqual((result.period_start, result.period_end), ("2026-09-01", "2026-09-30"))
        self.assertEqual([t.date for t in result.transactions], ["2026-09-05", "2026-09-07"])

    def test_undated_rows_inherit_the_previous_date_and_are_flagged(self):
        result = self.build([
            {"date_text": "05 Sep", "description": "A", "debit": 10},
            {"description": "B", "debit": 5},
            {"description": "C", "credit": 7},
        ])
        self.assertEqual([t.date for t in result.transactions], ["2026-09-05"] * 3)
        self.assertEqual([t.date_inferred for t in result.transactions], [False, True, True])
        warnings = self.parser.validate(result).warnings
        self.assertTrue(any("2 transactions printed no date" in w for w in warnings))

    def test_rows_before_any_dated_row_stay_blank_and_warn(self):
        result = self.build([{"description": "A", "debit": 10}, {"date_text": "06 Sep", "description": "B", "debit": 5}])
        self.assertIsNone(result.transactions[0].date)
        self.assertTrue(any("1 transaction had no readable date" in w for w in self.parser.validate(result).warnings))

    def test_dates_outside_the_period_warn(self):
        result = self.build([{"date_text": "05 Aug 2026", "description": "A", "debit": 10}])
        self.assertTrue(any("outside the statement period" in w for w in self.parser.validate(result).warnings))

    def test_carried_forward_lines_are_not_transactions(self):
        result = self.build([
            {"description": "Balance brought forward", "balance": 500},
            {"date_text": "05 Sep", "description": "A", "debit": 10},
            {"description": "Balance c/f", "balance": 490},
            {"description": "", "balance": 1},
        ])
        self.assertEqual([t.description for t in result.transactions], ["A"])


class MultiPageDateTests(unittest.TestCase):
    parser = BankStatementParser()

    def page(self, raw):
        return self.parser._build_response(META, raw)

    def test_a_year_less_date_on_a_later_page_uses_the_period_printed_on_the_first(self):
        first = self.page({"period_start": "01/09/2026", "period_end": "30/09/2026", "transactions": [{"date_text": "03 Sep", "description": "A", "debit": 1}]})
        later = self.page({"transactions": [{"date_text": "15 Sep", "description": "B", "debit": 2}, {"description": "C", "debit": 3}]})
        self.assertIsNone(later.transactions[0].date)  # unreadable on its own, but not overwritten
        self.assertFalse(later.transactions[0].date_inferred)
        merged = BankStatementParser.merge_pages([first, later])
        self.assertEqual([t.date for t in merged.transactions], ["2026-09-03", "2026-09-15", "2026-09-15"])
        self.assertEqual([t.date_inferred for t in merged.transactions], [False, False, True])

    def test_a_printed_date_that_cannot_be_read_is_never_replaced_by_a_neighbours(self):
        page = self.page({"transactions": [{"date_text": "05/09/2026", "description": "A", "debit": 1}, {"date_text": "garbled", "description": "B", "debit": 2}]})
        self.assertIsNone(page.transactions[1].date)
        self.assertTrue(any("1 transaction had no readable date" in w for w in self.parser.validate(page).warnings))


if __name__ == "__main__":
    unittest.main()
