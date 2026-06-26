"""Seed nse_symbol_indexes table.

Creates the table (if not exists) and populates index membership for all
~750 NSE symbols across: Nifty 50, Nifty Next 50, Nifty 100, Nifty Midcap 150,
Nifty Midcap 250, Nifty Smallcap 250, Nifty 500, Nifty Microcap 250, F&O.

Run standalone:  python -m app.migrations.seed_index_symbols
Or called from main.py startup.
"""
from __future__ import annotations

import logging
from db import db_execute, db_query

logger = logging.getLogger("signal_ai")

# ── Index constituent lists ───────────────────────────────────────────────────

NIFTY_50 = [
    "ADANIENT","ADANIPORTS","APOLLOHOSP","ASIANPAINT","AXISBANK",
    "BAJAJ-AUTO","BAJFINANCE","BAJAJFINSV","BEL","BPCL","BHARTIARTL",
    "BRITANNIA","CIPLA","COALINDIA","DRREDDY","EICHERMOT","ETERNAL",
    "GRASIM","HCLTECH","HDFCBANK","HDFCLIFE","HEROMOTOCO","HINDALCO",
    "HINDUNILVR","ICICIBANK","INDUSINDBK","INFY","ITC","JIOFIN",
    "JSWSTEEL","KOTAKBANK","LT","M&M","MARUTI","NESTLEIND","NTPC",
    "ONGC","POWERGRID","RELIANCE","SBILIFE","SHRIRAMFIN","SBIN",
    "SUNPHARMA","TATACONSUM","TATASTEEL","TCS","TECHM","TITAN",
    "TRENT","ULTRACEMCO","WIPRO",
]

NIFTY_NEXT_50 = [
    "360ONE","ABB","ADANIGREEN","ADANIPOWER","AMBUJACEM","ATGL","AUBANK",
    "BANKBARODA","BERGEPAINT","BOSCHLTD","CANBK","CGPOWER","CHOLAFIN",
    "COLPAL","DABUR","DLF","DMART","FEDERALBNK","GAIL","GMRAIRPORT",
    "GODREJCP","GODREJPROP","HAL","HAVELLS","HDFCAMC","ICICIPRULI",
    "IDFCFIRSTB","INDUSTOWER","IRFC","JINDALSTEL","LICI","LODHA",
    "LUPIN","MARICO","MAXHEALTH","MFSL","MOTHERSON","MUTHOOTFIN",
    "NHPC","PFC","PGHH","PIDILITIND","PIIND","RECLTD","SAIL","SIEMENS",
    "SOLARINDS","SRF","TATAPOWER","TORNTPHARM","TVSMOTOR","VEDL",
    "VOLTAS","ZOMATO",
]

# Nifty Midcap 150: positions ~101–250 (market cap rank)
NIFTY_MIDCAP_150 = [
    "AARTIIND","ABCAPITAL","ABFRL","AIAENG","AJANTPHARM","ALKEM",
    "ALKYLAMINE","APLAPOLLO","APOLLOTYRE","APTUS","ASTRAL","ASTRAZEN",
    "ATUL","BAJAJHLDNG","BALKRISIND","BANDHANBNK","BATAINDIA","BAYERCROP",
    "BIRLACORPN","BLUEDART","BLUESTARCO","CAMS","CANFINHOME","CASTROLIND",
    "CDSL","CEATLTD","CENTRALBK","CHOLAHLDNG","CIPLA","CLEAN","COFORGE",
    "CONCOR","CRISIL","CROMPTON","CSBBANK","CUMMINSIND","CYIENT",
    "DALBHARAT","DATAPATTNS","DCBBANK","DEEPAKFERT","DEEPAKNTR",
    "DELHIVERY","DEVYANI","DHANUKA","DIVISLAB","DIXON","EIDPARRY",
    "EMAMILTD","EMCURE","ENDURANCE","ENGINERSIN","EQUITASBNK","ERIS",
    "ESCORTS","EXIDEIND","FINEORG","FIRSTCRY","FLUOROCHEM","FORTIS",
    "GICRE","GILLETTE","GLAXO","GLENMARK","GNFC","GODREJIND","GPIL",
    "GRINDWELL","GSPL","GUJGASLTD","HAPPSTMNDS","HEG","HFCL","HIKAL",
    "HINDCOPPER","HINDPETRO","HINDZINC","HOMEFIRST","HONAUT","HUDCO",
    "IDBI","IEX","IPCALAB","IRCTC","ISEC","JBCHEPHARM","JKCEMENT",
    "JKPAPER","JSWENERGY","JSWINFRA","JUBLFOOD","KAJARIACER","KANSAINER",
    "KEC","KEI","KFINTECH","KIMS","KPITTECH","LALPATHLAB","LAURUSLABS",
    "LICHSGFIN","LINDEINDIA","LTIM","LTTS","LUXIND","M&MFIN","MANKIND",
    "MANYAVAR","MAPMYINDIA","MASTEK","MCX","METROPOLIS","MGL","MPHASIS",
    "MRF","MRPL","NATCOPHARM","NAUKRI","NAVINFLUOR","NBCC","NCC",
    "NIACL","NLCINDIA","NMDC","NYKAA","OBEROIRLTY","OFSS","OIL",
    "PAGEIND","PATANJALI","PERSISTENT","PETRONET","PFIZER","PHOENIXLTD",
    "POLYCAB","POONAWALLA","POWERINDIA","PVRINOX","RADICO","RAMCOCEM",
    "RATNAMANI","RBLBANK","RCF","REDINGTON","RELAXO","RITES","ROUTE",
    "SAFARI","SAREGAMA","SCHAEFFLER","SHREECEM","SJVN","SKFINDIA",
    "SOBHA","SONATSOFTW","SRF","STLTECH","SUDARSCHEM","SUMICHEM",
    "SUNDARMFIN","SUNDRMFAST","SUPREMEIND","SWANENERGY","SYMPHONY",
    "SYNGENE","TANLA","TATACHEM","TATAELXSI","TATAINVEST","TATATECH",
    "TEAMLEASE","THERMAX","TIMKEN","TITAGARH","TORNTPOWER","TRIDENT",
    "TRIVENI","UBL","UCOBANK","UJJIVANSFB","UNIONBANK","UNITDSPR","UPL",
    "UTIAMC","VBL","VINATIORGA","VOLTAS","WABAG","WELCORP","WELSPUNLIV",
    "WHIRLPOOL","YESBANK","ZEEL","ZYDUSLIFE","ZYDUSWELL",
]

# Nifty Smallcap 250: positions ~251–500
NIFTY_SMALLCAP_250 = [
    "3MINDIA","AADHARHFC","AARTIDRUGS","AARTIPHARM","AAVAS","ABBOTINDIA",
    "ABDL","ABLBL","ABREL","ABSLAMC","ACC","ACE","ACI","ACMESOLAR",
    "ACUTAAS","ADANIENSOL","ADVENZYMES","AEGISLOG","AEGISVOPAK","AETHER",
    "AFCONS","AFFLE","AGARWALEYE","AGI","AHLUCONT","AIIL","AJAXENGG",
    "AKUMS","AKZOINDIA","ALIVUS","ALLCARGO","ALOKINDS","AMBER",
    "ANANDRATHI","ANANTRAJ","ANGELONE","ANUP","ANURAS","APARINDS",
    "APLLTD","ARE&M","ARVIND","ARVINDFASN","ASAHIINDIA","ASHOKA",
    "ASHOKLEY","ASKAUTOLTD","ASTERDM","ASTRAMICRO","ATHERENERG",
    "AURIONPRO","AUROPHARMA","AVALON","AVANTIFEED","AWFIS","AWL","AZAD",
    "BAJAJELEC","BAJAJHFL","BALAMINES","BALRAMCHIN","BALUFORGE",
    "BANCOINDIA","BANKINDIA","BASF","BBL","BBTC","BDL","BECTORFOOD",
    "BELRISE","BEML","BHARATFORG","BHARTIHEXA","BHEL","BIKAJI","BIOCON",
    "BLACKBUCK","BLS","BLUEJET","BORORENEW","BRIGADE","BSE","BSOFT",
    "CAMPUS","CAPLIPOINT","CARBORUNIV","CARTRADE","CCL","CELLO","CEMPRO",
    "CENTURYPLY","CERA","CESC","CGCL","CHALET","CHAMBLFERT","CHENNPETRO",
    "CHOICEIN","CIEINDIA","CIGNITITEC","CMSINFO","COCHINSHIP","COHANCE",
    "CONCORDBIO","COROMANDEL","CRAFTSMAN","CREDITACC","CUB","CYIENTDLM",
    "DATAMATICS","DBL","DBREALTY","DCAL","DCMSHRIRAM","DIACABS",
    "DODLA","DOMS","DYNAMATECH","EASEMYTRIP","ECLERX","EDELWEISS",
    "EIEL","EIHOTEL","ELECON","ELECTCAST","ELGIEQUIP","EMBDL","EMIL",
    "EMUDHRA","ENRIN","ENTERO","EPIGRAL","EPL","ETHOSLTD","EUREKAFORB",
    "FACT","FDC","FIEMIND","FINCABLES","FINPIPE","FIVESTAR","FORCEMOT",
    "FSL","GABRIEL","GAEL","GALLANTT","GANECOS","GANESHHOU","GARFIBRES",
    "GATEWAY","GESHIP","GHCL","GILLETTE","GLAND","GMDCLTD","GMMPFAUDLR",
    "GMRP&UI","GODFRYPHLP","GODIGIT","GODREJAGRO","GOKEX","GPPL",
    "GRANULES","GRAPHITE","GRAVITA","GREAVESCOT","GREENPANEL","GRINFRA",
    "GRSE","GRWRHITECH","GSFC","GULFOILLUB","GVT&D","HBLENGINE","HCC",
    "HCG","HEXT","HGINFRA","HEMIPROP","HERITGFOOD","HOMEFIRST","HONASA",
    "HSCL","HYUNDAI","ICICIGI","ICIL","IDEA","IGL","IIFLCAPS","IKS",
    "IMAGICAA","IMFA","INDGN","INDHOTEL","INDIACEM","INDIAGLYCO",
    "INDIAMART","INDIANB","INDIASHLTR","INDIGO","INDIGOPNTS","INFIBEAM",
    "INGERRAND","INNOVACAP","INOXGREEN","INOXINDIA","INOXWIND",
    "INTELLECT","IOB","IOC","IONEXCHANG","IRB","IRCON","IREDA","ISGEC",
    "ITCHOTELS","ITI","IXIGO","J&KBANK","JAIBALAJI","JAMNAAUTO","JBMA",
    "JCHAC","JINDALSAW","JINDWORLD","JISLJALEQS","JKIL","JKLAKSHMI",
    "JKTYRE","JMFINANCIL","JPPOWER","JSFB","JSL","JUBLINGREA",
    "JUBLPHARMA","JUSTDIAL","JWL","JYOTHYLAB","JYOTICNC","KALYANKJIL",
    "KARURVYSYA","KAYNES","KPIGREEN","KPIL","KPRMILL","KRBL","KRN",
    "KSB","KSCL","KSL","KTKBANK",
]

# Nifty Microcap 250: positions ~501–750 (beyond Nifty 500)
NIFTY_MICROCAP_250 = [
    "LATENTVIEW","LEMONTREE","LMW","LLOYDSENGG","LLOYDSENT","LLOYDSME",
    "LTF","LTFOODS","LUMAXTECH","LXCHEM","MAHABANK","MAHLIFE",
    "MAHSCOOTER","MAHSEAMLES","MANINFRA","MANORAMA","MARKSANS",
    "MAXESTATES","MAZDOCK","MEDANTA","MEDPLUS","MIDHANI","MINDACORP",
    "MMTC","MOIL","MOTILALOFS","MSTCLTD","MSUMI","MTARTECH","NAM-INDIA",
    "NATIONALUM","NAVA","NAZARA","NEOGEN","NESCO","NETWEB","NETWORK18",
    "NEULANDLAB","NEWGEN","NFL","NH","NIVABUPA","NSLNISP","NTPCGREEN",
    "NUVAMA","NUVOCO","OLECTRA","OLAELEC","ONESOURCE","OPTIEMUS",
    "ORCHPHARMA","ORIENTCEM","OSWALPUMPS","PARADEEP","PARAS","PARKHOTELS",
    "PATELENG","PAYTM","PCBL","PCJEWELLER","PGEL","PGIL","PIIND",
    "PNB","PNBHOUSING","PNCINFRA","PNGJL","POLICYBZR","POLYMED",
    "POLYPLEX","POWERMECH","PPLPHARMA","PRAJIND","PREMIERENE","PRESTIGE",
    "PRICOLLTD","PRINCEPIPE","PRIVISCL","PRSMJOHNSN","PRUDENT","PTC",
    "PTCIL","PURVA","QUESS","RAILTEL","RAIN","RAINBOW","RAJESHEXPO",
    "RALLIS","RATEGAIN","RAYMONDLSL","RBA","REFEX","RELIGARE","RELINFRA",
    "RENUKA","RHIM","RKFORGE","RPOWER","RRKABEL","RTNINDIA","RTNPOWER",
    "RVNL","SAGILITY","SAILIFE","SAMHI","SAMMAANCAP","SANDUMA","SANOFI",
    "SANOFICONR","SANSERA","SAPPHIRE","SARDAEN","SBFC","SBICARD",
    "SCHNEIDER","SCI","SENCO","SEQUENT","SFL","SHAILY","SHAKTIPUMP",
    "SHARDACROP","SHARDAMOTR","SHAREINDIA","SHILPAMED","SHREDIGCEM",
    "SHRIPISTON","SHYAMMETL","SIGNATURE","SKIPPER","SKYGOLD","SONACOMS",
    "SOUTHBANK","SPARC","STAR","STARCEMENT","STARHEALTH","STYRENIX",
    "SUBROS","SUNFLAG","SUNTECK","SUNTV","SUPRIYA","SURYAROSNI",
    "SUZLON","SWANCORP","SWIGGY","SWSOLAR","SYRMA","TARC","TARIL",
    "TATACOMM","TBOTEK","TDPOWERSYS","TECHNOE","TEGA","TEJASNET",
    "TEXRAIL","THANGAMAYL","THELEELA","THOMASCOOK","THYROCARE","TI",
    "TIINDIA","TIMETECHNO","TIPSMUSIC","TMPV","TRANSRAILL","TRITURBINE",
    "TSFINV","TTML","TVSSCS","UJJIVANSFB","UNIMECH","UNOMINDA",
    "USHAMART","V2RETAIL","VAIBHAVGBL","VARROC","VENTIVE","VESUVIUS",
    "VGUARD","VIJAYA","VIPIND","VMART","VMM","VOLTAMP","VSTIND","VTL",
    "WAAREEENER","WAAREERTL","WEBELSOLAR","WELENT","WESTLIFE","WOCKPHARMA",
    "YATHARTH","ZAGGLE","ZENSARTECH","ZENTEC","ZFCVINDIA",
]

# NSE F&O eligible stocks (equity derivatives segment, June 2026)
# Source: NSE India F&O ban list + equity derivatives approved list
NSE_FO = [
    # Nifty 50 (all are F&O)
    "ADANIENT","ADANIPORTS","APOLLOHOSP","ASIANPAINT","AXISBANK",
    "BAJAJ-AUTO","BAJFINANCE","BAJAJFINSV","BEL","BPCL","BHARTIARTL",
    "BRITANNIA","CIPLA","COALINDIA","DRREDDY","EICHERMOT","ETERNAL",
    "GRASIM","HCLTECH","HDFCBANK","HDFCLIFE","HEROMOTOCO","HINDALCO",
    "HINDUNILVR","ICICIBANK","INDUSINDBK","INFY","ITC","JIOFIN",
    "JSWSTEEL","KOTAKBANK","LT","M&M","MARUTI","NESTLEIND","NTPC",
    "ONGC","POWERGRID","RELIANCE","SBILIFE","SHRIRAMFIN","SBIN",
    "SUNPHARMA","TATACONSUM","TATASTEEL","TCS","TECHM","TITAN",
    "TRENT","ULTRACEMCO","WIPRO",
    # Nifty Next 50 (most are F&O)
    "360ONE","ABB","ADANIGREEN","ADANIPOWER","AMBUJACEM","ATGL","AUBANK",
    "BANKBARODA","BERGEPAINT","BOSCHLTD","CANBK","CGPOWER","CHOLAFIN",
    "COLPAL","DABUR","DLF","DMART","FEDERALBNK","GAIL","GMRAIRPORT",
    "GODREJCP","GODREJPROP","HAL","HAVELLS","HDFCAMC","ICICIPRULI",
    "IDFCFIRSTB","INDUSTOWER","IRFC","JINDALSTEL","LICI","LODHA",
    "LUPIN","MARICO","MAXHEALTH","MFSL","MOTHERSON","MUTHOOTFIN",
    "NHPC","PFC","PGHH","PIDILITIND","PIIND","RECLTD","SAIL","SIEMENS",
    "SOLARINDS","SRF","TATAPOWER","TORNTPHARM","TVSMOTOR","VEDL",
    "VOLTAS","ZOMATO",
    # Additional F&O stocks beyond Nifty 100
    "AARTIIND","ABCAPITAL","ABFRL","AIAENG","ALKEM","ALKYLAMINE",
    "APLAPOLLO","APOLLOTYRE","ASTRAL","ATUL","AUROBINDO","AUROPHARMA",
    "BALKRISIND","BANDHANBNK","BATAINDIA","BHARATFORG","BHEL","BIOCON",
    "BSE","CAMS","CANFINHOME","CASTROLIND","CDSL","CEATLTD","CENTRALBK",
    "CHOLAHLDNG","CLEAN","COFORGE","CONCOR","CRISIL","CROMPTON",
    "CSBBANK","CUMMINSIND","CYIENT","DALBHARAT","DATAPATTNS","DEEPAKFERT",
    "DEEPAKNTR","DELHIVERY","DEVYANI","DIXON","DIVISLAB","EMAMILTD",
    "ENGINERSIN","EQUITASBNK","ESCORTS","EXIDEIND","FINEORG",
    "FLUOROCHEM","FORTIS","GICRE","GLENMARK","GNFC","GODREJIND",
    "GPIL","GRINDWELL","GSPL","GUJGASLTD","HAPPSTMNDS","HEG","HIKAL",
    "HINDCOPPER","HINDPETRO","HINDZINC","HONAUT","HUDCO","IDBI",
    "IEX","IOCL","IPCALAB","IRCTC","ISEC","JBCHEPHARM","JKCEMENT",
    "JKPAPER","JSWENERGY","JSWINFRA","JUBLFOOD","KAJARIACER","KEC",
    "KEI","KFINTECH","KIMS","KPITTECH","LALPATHLAB","LAURUSLABS",
    "LICHSGFIN","LINDEINDIA","LTIM","LTTS","M&MFIN","MANKIND",
    "MANYAVAR","MAPMYINDIA","MCX","METROPOLIS","MGL","MPHASIS","MRF",
    "MRPL","NATCOPHARM","NAUKRI","NAVINFLUOR","NBCC","NCC","NIACL",
    "NLCINDIA","NMDC","NYKAA","OBEROIRLTY","OFSS","OIL","PAGEIND",
    "PATANJALI","PERSISTENT","PETRONET","PFIZER","PHOENIXLTD",
    "POLYCAB","POONAWALLA","POWERINDIA","PVRINOX","RADICO","RAMCOCEM",
    "RATNAMANI","RBLBANK","RCF","REDINGTON","RELAXO","RITES","ROUTE",
    "SAFARI","SAREGAMA","SCHAEFFLER","SHREECEM","SJVN","SKFINDIA",
    "SOBHA","SONATSOFTW","STLTECH","SUDARSCHEM","SUMICHEM",
    "SUNDARMFIN","SUNDRMFAST","SUPREMEIND","SYMPHONY","SYNGENE",
    "TANLA","TATACHEM","TATAELXSI","TATAINVEST","TATATECH","TEAMLEASE",
    "THERMAX","TIMKEN","TITAGARH","TORNTPOWER","TRIDENT","TRIVENI",
    "UBL","UCOBANK","UJJIVANSFK","UNIONBANK","UNITDSPR","UPL","UTIAMC",
    "VBL","VINATIORGA","WABAG","WELCORP","WELSPUNLIV","WHIRLPOOL",
    "YESBANK","ZEEL","ZYDUSLIFE","ZYDUSWELL",
    # Additional liquid F&O stocks
    "ANGELONE","BIKAJI","CAMPUS","CDSL","CESC","COROMANDEL","CRAFTSMAN",
    "CREDITACC","CUB","DHANUKA","DODLA","DOMS","DYNAMATECH","ECLERX",
    "EIEL","EMCURE","ENDURANCE","ERIS","ETHOSLTD","FACT","FIVESTAR",
    "FORCEMOT","GAEL","GHCL","GLAND","GLAXO","GMDCLTD","GODREJAGRO",
    "GPPL","GRANULES","GRAPHITE","ICICIGI","INDIANB","INDIGO","INDIAMART",
    "IOB","IOC","IRB","IRCON","IREDA","ISEC","ITC","ITCHOTELS",
    "KALYANKJIL","KARURVYSYA","KAYNES","KPIGREEN","KPIL","KPRMILL",
    "KRBL","KSB","LATENTVIEW","LUXIND","LXCHEM","MANAPPURAM",
    "MASTEK","MAXHEALTH","MEDANTA","MOIL","MOTILALOFS","NAM-INDIA",
    "NAVA","NAZARA","NEOGEN","NETWEB","NEULANDLAB","NEWGEN","PNB",
    "PNBHOUSING","PNCINFRA","POLICYBZR","POLYMED","POWERMECH",
    "PRESTIGE","PRUDENT","RAILTEL","RAIN","RAINBOW","RALLIS","RATEGAIN",
    "RENUKA","RHIM","RKFORGE","RVNL","SANSERA","SBICARD","SCHNEIDER",
    "SENCO","SEQUENT","STARHEALTH","STYRENIX","SUPRIYA","SURYAROSNI",
    "SUZLON","SWIGGY","SYRMA","TATASTEEL","TBOTEK","TEGA","TEJASNET",
    "TIINDIA","TIPSMUSIC","TRANSRAILL","TVSMOTOR","UNOMINDA","VARROC",
    "VBL","VGUARD","VIPIND","VOLTAMP","WAAREEENER","WEBELSOLAR",
    "WESTLIFE","WOCKPHARMA","ZAGGLE","ZENSARTECH","ZENTEC","ZYDUSLIFE",
]


def _build_index_map(all_db_symbols: list[str], fo_db_syms: set[str]) -> dict[str, list[str]]:
    """Build symbol → list[index_name] mapping. Unclassified symbols default to n500."""
    n50   = set(NIFTY_50)
    nx50  = set(NIFTY_NEXT_50)
    mc150 = set(NIFTY_MIDCAP_150)
    sc250 = set(NIFTY_SMALLCAP_250)
    umc250 = set(NIFTY_MICROCAP_250)
    # F&O: union of DB data + hardcoded list
    fo_all = fo_db_syms | set(NSE_FO)

    # Nifty Midcap 250 = midcap 150 + first 100 of smallcap
    mc250 = mc150 | set(list(sc250)[:100])

    # Nifty 500 = n50 + next50 + midcap150 + smallcap250
    n500 = n50 | nx50 | mc150 | sc250

    result: dict[str, list[str]] = {}
    for sym in all_db_symbols:
        tags: list[str] = []
        if sym in n50:
            tags += ["n50", "n100", "n500"]
        elif sym in nx50:
            tags += ["next50", "n100", "n500"]
        elif sym in mc150:
            tags += ["midcap150", "midcap250", "n500"]
        elif sym in mc250 - mc150:
            tags += ["midcap250", "n500"]
        elif sym in sc250 - mc250:
            tags += ["smallcap250", "n500"]
        elif sym in umc250:
            tags += ["microcap250"]
        else:
            tags += ["n500"]
        if sym in fo_all:
            tags.append("fo")
        result[sym] = tags
    return result


CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS `nse_symbol_indexes` (
  `symbol`      VARCHAR(50)  NOT NULL,
  `script_name` VARCHAR(255) NOT NULL DEFAULT '',
  `n50`         TINYINT(1)   NOT NULL DEFAULT 0,
  `next50`      TINYINT(1)   NOT NULL DEFAULT 0,
  `n100`        TINYINT(1)   NOT NULL DEFAULT 0,
  `midcap150`   TINYINT(1)   NOT NULL DEFAULT 0,
  `midcap250`   TINYINT(1)   NOT NULL DEFAULT 0,
  `smallcap250` TINYINT(1)   NOT NULL DEFAULT 0,
  `n500`        TINYINT(1)   NOT NULL DEFAULT 0,
  `microcap250` TINYINT(1)   NOT NULL DEFAULT 0,
  `fo`          TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (`symbol`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""

# Safe ALTER statements — each wrapped individually so one failure doesn't block others
_ALTER_SQLS = [
    "ALTER TABLE `nse_symbol_indexes` ADD COLUMN `fo` TINYINT(1) NOT NULL DEFAULT 0",
    "ALTER TABLE `nse_symbol_indexes` ADD COLUMN `script_name` VARCHAR(255) NOT NULL DEFAULT ''",
]


def run_seed(force: bool = False) -> None:
    """Create table and upsert index membership for all nse_eq_symbols."""
    # Check if already seeded
    if not force:
        try:
            rows = db_query("SELECT COUNT(*) as cnt FROM nse_symbol_indexes")
            if rows and rows[0]["cnt"] > 0:
                logger.info("nse_symbol_indexes already seeded (%d rows) — skipping", rows[0]["cnt"])
                return
        except Exception:
            pass  # Table doesn't exist yet — continue

    # Create table; then apply any missing columns to existing tables
    db_execute(CREATE_TABLE_SQL)
    for alter_sql in _ALTER_SQLS:
        try:
            db_execute(alter_sql)
        except Exception:
            pass  # column already exists

    # Fetch all symbols + company names from nse_eq_symbols
    rows = db_query("SELECT symbol, company_name FROM nse_eq_symbols ORDER BY symbol")
    all_syms = [r["symbol"] for r in rows]
    name_map = {r["symbol"]: (r.get("company_name") or "") for r in rows}

    if not all_syms:
        logger.warning("nse_eq_symbols is empty — skipping index seed")
        return

    # Pull F&O symbols from stocks_master (authoritative DB source)
    try:
        fo_rows = db_query("SELECT symbol FROM stocks_master WHERE fo = 1")
        fo_db_syms = {r["symbol"] for r in fo_rows}
    except Exception:
        fo_db_syms = set()

    index_map = _build_index_map(all_syms, fo_db_syms)

    # Upsert all rows
    for sym, tags in index_map.items():
        script_name = name_map.get(sym, "")
        db_execute("""
            INSERT INTO nse_symbol_indexes
              (symbol, script_name, n50, next50, n100, midcap150, midcap250,
               smallcap250, n500, microcap250, fo)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
              script_name=%s,
              n50=%s, next50=%s, n100=%s, midcap150=%s, midcap250=%s,
              smallcap250=%s, n500=%s, microcap250=%s, fo=%s
        """, (
            sym, script_name,
            int("n50"        in tags), int("next50"     in tags),
            int("n100"       in tags), int("midcap150"  in tags),
            int("midcap250"  in tags), int("smallcap250" in tags),
            int("n500"       in tags), int("microcap250" in tags),
            int("fo"         in tags),
            # ON DUPLICATE KEY values
            script_name,
            int("n50"        in tags), int("next50"     in tags),
            int("n100"       in tags), int("midcap150"  in tags),
            int("midcap250"  in tags), int("smallcap250" in tags),
            int("n500"       in tags), int("microcap250" in tags),
            int("fo"         in tags),
        ))

    foc    = sum(1 for t in index_map.values() if "fo" in t)
    total  = len(index_map)
    n50c   = sum(1 for t in index_map.values() if "n50" in t)
    nx50c  = sum(1 for t in index_map.values() if "next50" in t)
    mc150c = sum(1 for t in index_map.values() if "midcap150" in t)
    sc250c = sum(1 for t in index_map.values() if "smallcap250" in t)
    umc250c= sum(1 for t in index_map.values() if "microcap250" in t)
    n500c  = sum(1 for t in index_map.values() if "n500" in t)
    logger.info(
        "nse_symbol_indexes seeded: total=%d n50=%d next50=%d midcap150=%d "
        "smallcap250=%d n500=%d microcap250=%d fo=%d",
        total, n50c, nx50c, mc150c, sc250c, n500c, umc250c, foc
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_seed(force=True)
    print("Done.")
