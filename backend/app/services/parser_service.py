import csv
import io
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path


def parse_brazilian_number(value: str) -> Decimal:
    """Parse Brazilian number format: 1.234,56 -> 1234.56"""
    cleaned = value.strip().replace(" ", "")
    # Remove currency symbols
    cleaned = re.sub(r"[R$\s]", "", cleaned)
    # Check if it uses Brazilian format (comma as decimal separator)
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return Decimal("0")


def parse_date(value: str) -> date:
    """Try multiple date formats common in Brazilian bank statements."""
    formats = ["%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y", "%m/%d/%Y"]
    value = value.strip()
    for fmt in formats:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Cannot parse date: {value}")


def parse_csv(file_path: Path) -> list[dict]:
    """Parse a bank statement CSV file into structured rows."""
    # Try different encodings
    content = None
    for encoding in ["utf-8", "latin-1", "cp1252"]:
        try:
            content = file_path.read_text(encoding=encoding)
            break
        except UnicodeDecodeError:
            continue

    if content is None:
        raise ValueError("Could not decode CSV file")

    # Detect delimiter
    first_line = content.split("\n")[0]
    delimiter = ";" if ";" in first_line else ","

    reader = csv.DictReader(io.StringIO(content), delimiter=delimiter)
    rows = []

    # Normalize header names to lowercase
    if reader.fieldnames:
        reader.fieldnames = [f.strip().lower() for f in reader.fieldnames]

    for i, row in enumerate(reader):
        # Try to find date, description, and amount columns
        row_lower = {k.strip().lower(): v.strip() for k, v in row.items() if k}

        date_val = _find_field(row_lower, ["data", "date", "dt", "data lançamento", "data lancamento"])
        desc_val = _find_field(row_lower, ["descrição", "descricao", "description", "historico", "histórico", "lancamento", "lançamento", "memo"])
        amount_val = _find_field(row_lower, ["valor", "amount", "value", "quantia"])

        # Some CSVs have separate debit/credit columns
        if not amount_val:
            debit = _find_field(row_lower, ["débito", "debito", "debit", "saída", "saida"])
            credit = _find_field(row_lower, ["crédito", "credito", "credit", "entrada"])
            if debit and debit not in ("", "0", "0,00", "0.00"):
                amount_val = f"-{debit}"
            elif credit:
                amount_val = credit

        if not date_val or not desc_val or not amount_val:
            continue

        try:
            parsed_date = parse_date(date_val)
            parsed_amount = parse_brazilian_number(amount_val)
        except (ValueError, InvalidOperation):
            continue

        rows.append({
            "date": parsed_date.isoformat(),
            "description": desc_val,
            "amount": str(parsed_amount),
            "original_text": str(row_lower),
        })

    return rows


def extract_pdf_text(file_path: Path) -> str:
    """Extract text from a PDF bank statement using pdfplumber."""
    import pdfplumber

    text_parts = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                text_parts.append(text)
    return "\n\n".join(text_parts)


def _find_field(row: dict, candidates: list[str]) -> str | None:
    """Find a field value by trying multiple possible column names."""
    for candidate in candidates:
        for key, value in row.items():
            if candidate in key:
                return value
    return None
