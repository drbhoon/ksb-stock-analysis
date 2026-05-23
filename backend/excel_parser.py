import io
import re
import logging
import pandas as pd
from typing import List, Dict, Any, Tuple, Optional

logger = logging.getLogger(__name__)

class ExcelParser:
    @staticmethod
    def parse_file(file_bytes: bytes, file_name: str) -> List[Dict[str, Any]]:
        """Parses Excel or CSV portfolio files and extracts Stock Symbol, Name, and ISIN.
        
        Supports automatic, intelligent header matching.
        """
        logger.info(f"Parsing uploaded file: {file_name}")
        
        # Load into DataFrame based on extension
        try:
            if file_name.endswith(('.xlsx', '.xls')):
                df = pd.read_excel(io.BytesIO(file_bytes))
            elif file_name.endswith('.csv'):
                # Try reading with utf-8 first, fallback to latin-1
                try:
                    df = pd.read_csv(io.BytesIO(file_bytes), encoding='utf-8')
                except UnicodeDecodeError:
                    df = pd.read_csv(io.BytesIO(file_bytes), encoding='latin-1')
            else:
                raise ValueError("Unsupported file format. Please upload an Excel (.xlsx, .xls) or CSV (.csv) file.")
        except Exception as e:
            logger.error(f"Error reading file {file_name}: {e}")
            raise ValueError(f"Failed to read spreadsheet file: {str(e)}")

        # Strip whitespace from column headers
        df.columns = [str(c).strip() for c in df.columns]
        
        # Intelligent header matching
        isin_col, symbol_col, name_col = ExcelParser._detect_columns(df.columns.tolist())
        
        logger.info(f"Detected columns - ISIN: '{isin_col}', Symbol: '{symbol_col}', Company Name: '{name_col}'")
        
        if not isin_col and not symbol_col:
            raise ValueError(
                "Could not identify the required columns. "
                "Please make sure your sheet has columns for either 'ISIN Code' or 'Stock Symbol'."
            )
            
        parsed_records = []
        for idx, row in df.iterrows():
            # Get values, handling NaN/None
            isin = str(row[isin_col]).strip() if isin_col and pd.notna(row[isin_col]) else ""
            symbol = str(row[symbol_col]).strip() if symbol_col and pd.notna(row[symbol_col]) else ""
            name = str(row[name_col]).strip() if name_col and pd.notna(row[name_col]) else ""
            
            # Clean symbols (e.g. remove trailing spacing, convert to upper)
            isin = isin.upper().strip()
            symbol = symbol.upper().strip()
            
            # Filter empty rows
            if not isin and not symbol:
                continue
                
            parsed_records.append({
                "row_index": idx + 1,
                "uploaded_isin": isin,
                "uploaded_symbol": symbol,
                "uploaded_name": name
            })
            
        logger.info(f"Successfully extracted {len(parsed_records)} rows from {file_name}")
        return parsed_records

    @staticmethod
    def _detect_columns(columns: List[str]) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """Matches column headers using regex patterns to find ISIN, Ticker, and Name fields."""
        isin_col = None
        symbol_col = None
        name_col = None
        
        # Regex patterns
        isin_pattern = re.compile(r'(isin|isin\s*code|isin\s*number|security\s*isin|isin_code)', re.IGNORECASE)
        symbol_pattern = re.compile(r'(symbol|symb|ticker|stock\s*symbol|stock\s*symb|code|security\s*code)', re.IGNORECASE)
        name_pattern = re.compile(r'(name|company|company\s*name|description|security\s*name|company_name)', re.IGNORECASE)
        
        # 1. Look for ISIN
        for col in columns:
            if isin_pattern.search(col):
                isin_col = col
                break
                
        # 2. Look for Symbol (if it matches Symbol but is NOT the detected ISIN column)
        for col in columns:
            if col == isin_col:
                continue
            if symbol_pattern.search(col):
                symbol_col = col
                break
                
        # 3. Look for Name (if it matches Name and is NOT the ISIN or Symbol column)
        for col in columns:
            if col in [isin_col, symbol_col]:
                continue
            if name_pattern.search(col):
                name_col = col
                break
                
        # Fallbacks: if still missing, check for exact matches
        if not isin_col:
            for col in columns:
                if 'isin' in col.lower():
                    isin_col = col
                    break
        if not symbol_col:
            for col in columns:
                if col != isin_col and any(k in col.lower() for k in ['sym', 'code', 'tick']):
                    symbol_col = col
                    break
        if not name_col:
            for col in columns:
                if col not in [isin_col, symbol_col] and any(k in col.lower() for k in ['name', 'comp', 'desc']):
                    name_col = col
                    break
                    
        return isin_col, symbol_col, name_col
