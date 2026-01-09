import io
import re
from typing import Dict, List, Tuple, Optional
import pandas as pd


def parse_datetime(date_str: str, time_str: str) -> str:
    date_parts = date_str.split('/')
    if len(date_parts) != 3:
        raise ValueError(f"Invalid date format: {date_str}")

    # Try to detect format: if first part > 12, it must be DD/MM/YYYY (European)
    first, second, year = date_parts
    if int(first) > 12:
        # DD/MM/YYYY format
        day, month = first, second
    elif int(second) > 12:
        # MM/DD/YYYY format (second part is day > 12)
        month, day = first, second
    else:
        # Ambiguous (both <= 12), assume MM/DD/YYYY (US format)
        month, day = first, second
    time_parts = time_str.split(' ')
    time_part = time_parts[0] if time_parts else ''
    ampm = time_parts[1].upper() if len(time_parts) > 1 else ''

    time_components = time_part.split(':')
    hours = int(time_components[0]) if time_components else 0
    minutes = int(time_components[1]) if len(time_components) > 1 else 0
    seconds = int(time_components[2]) if len(time_components) > 2 else 0

    if ampm == 'PM' and hours != 12:
        hours += 12
    elif ampm == 'AM' and hours == 12:
        hours = 0

    return f"{year}-{month.zfill(2)}-{day.zfill(2)}T{str(hours).zfill(2)}:{str(minutes).zfill(2)}:{str(seconds).zfill(2)}"


def find_header_row(lines: List[str], start_index: int = 0) -> int:
    for i in range(start_index, len(lines)):
        line_lower = lines[i].lower()
        if 'date' in line_lower and 'time' in line_lower and '\t' in lines[i]:
            return i
    return -1


def parse_tsv_with_header(text: str) -> pd.DataFrame:
    all_lines = text.split('\n')
    header_index = find_header_row(all_lines)

    if header_index == -1:
        raise ValueError('Could not find header row with Date and Time columns')

    data_lines = '\n'.join(all_lines[header_index:])
    df = pd.read_csv(io.StringIO(data_lines), sep='\t', dtype=str)

    if 'Timepoint' in df.columns:
        df = df.drop(columns=['Timepoint'])

    df = df[df['Date'].notna() & df['Time'].notna()]
    df = df[~df['Date'].str.lower().isin(['date', 'timepoint'])]
    df = df[df['Date'].str.strip() != '']

    return df.reset_index(drop=True)


def convert_numeric_columns(df: pd.DataFrame, exclude: List[str]) -> pd.DataFrame:
    for col in df.columns:
        if col not in exclude:
            # Replace comma decimal separators with periods (European format support)
            df[col] = df[col].astype(str).str.replace(',', '.', regex=False)
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0.0)
    return df


def extract_datetimes(df: pd.DataFrame) -> List[str]:
    datetimes = []
    for idx, row in df.iterrows():
        dt = parse_datetime(str(row['Date']), str(row['Time']))
        datetimes.append(dt)
    return datetimes


def parse_generators(text: str) -> pd.DataFrame:
    df = parse_tsv_with_header(text)
    return convert_numeric_columns(df, exclude=['Date', 'Time'])


def parse_loads(text: str) -> pd.DataFrame:
    df = parse_tsv_with_header(text)
    return convert_numeric_columns(df, exclude=['Date', 'Time'])


def parse_lines(text: str) -> Tuple[pd.DataFrame, pd.DataFrame]:
    df = parse_tsv_with_header(text)
    df = convert_numeric_columns(df, exclude=['Date', 'Time'])
    base_cols = ['Date', 'Time', 'Skip']
    # Match columns with "% of MVA Limit" (with or without "From")
    mva_limit_cols = base_cols + [col for col in df.columns if '% of mva limit' in col.lower() and col not in base_cols]
    # Match columns with "MW From" but NOT "% of MVA"
    mw_from_cols = base_cols + [col for col in df.columns if 'mw from' in col.lower() and '% of mva' not in col.lower()]

    mva_limit_df = df[[c for c in mva_limit_cols if c in df.columns]].copy()
    mw_from_df = df[[c for c in mw_from_cols if c in df.columns]].copy()
    return mva_limit_df, mw_from_df


def parse_buses(text: str) -> pd.DataFrame:
    df = parse_tsv_with_header(text)
    return convert_numeric_columns(df, exclude=['Date', 'Time'])


def extract_branch_name(column: str) -> str:
    match = re.search(r'(\d+)\s+\([^)]+\)\s+TO\s+(\d+)\s+\([^)]+\)', column)
    if match:
        return f"{match.group(1)}-{match.group(2)}"
    match = re.search(r'(\d+)\s+TO\s+(\d+)', column)
    if match:
        return f"{match.group(1)}-{match.group(2)}"
    return column


def group_battery_columns_by_bus(battery_cols: List[str]) -> Dict[int, List[str]]:
    battery_by_bus: Dict[int, List[str]] = {}
    for col in battery_cols:
        match = re.search(r'gen\s*(\d+)', col, re.IGNORECASE)
        if match:
            bus_num = int(match.group(1))
            if bus_num not in battery_by_bus:
                battery_by_bus[bus_num] = []
            battery_by_bus[bus_num].append(col)
    return battery_by_bus


def group_loads_by_bus(df: pd.DataFrame) -> Dict[int, Dict[str, Optional[str]]]:
    load_by_bus: Dict[int, Dict[str, Optional[str]]] = {}

    for col in df.columns:
        if col in ['Date', 'Time']:
            continue

        match = re.match(r'Bus\s+(\d+)\s+#EV\s+(MW|Mvar)', col, re.IGNORECASE)
        if match:
            bus_num = int(match.group(1))
            load_type = match.group(2).lower()

            if bus_num not in load_by_bus:
                load_by_bus[bus_num] = {'mw_col': None, 'mvar_col': None}

            if load_type == 'mw':
                load_by_bus[bus_num]['mw_col'] = col
            elif load_type == 'mvar':
                load_by_bus[bus_num]['mvar_col'] = col

    return load_by_bus


def reconstruct_table(battery_data: List[Dict], original_data: List[Dict], original_columns: List[str]) -> str:
    original_df = pd.DataFrame(original_data)
    battery_df = pd.DataFrame(battery_data)

    battery_cols = [col for col in battery_df.columns if col not in ['Date', 'Time']]

    for col in battery_cols:
        if col in original_df.columns:
            battery_map = battery_df.set_index(['Date', 'Time'])[col].to_dict()
            original_df[col] = original_df.apply(
                lambda row: battery_map.get((str(row['Date']), str(row['Time'])), row[col]),
                axis=1
            )

    output_lines = ['Timepoint']
    output_lines.append('\t'.join(original_df.columns.tolist()))

    for _, row in original_df.iterrows():
        output_lines.append('\t'.join([str(val) if pd.notna(val) else '' for val in row.values]))

    return '\n'.join(output_lines)
