import pandas as pd
import pandas_ta as ta
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
import json
from sqlalchemy import create_engine
import psycopg2

# =========================
# Config DB
# =========================
DB_CONFIG = {
    "dbname": "sts",
    "user": "postgres",
    "password": "hoaivu388",
    "host": "localhost",
    "port": 5432
}
DB_URL = f"postgresql+psycopg2://{DB_CONFIG['user']}:{DB_CONFIG['password']}@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['dbname']}"
engine = create_engine(DB_URL)


# =========================
# Fetch danh sách symbol
# =========================
def fetch_symbols():
    with engine.connect() as conn:
        df = pd.read_sql("""SELECT DISTINCT "symbol" FROM "Stock" ORDER BY "symbol";""", conn)
    return df["symbol"].tolist()


# =========================
# Lấy dữ liệu giá
# =========================
def fetch_data(symbol: str):
    query = """
        SELECT 
            "trade_date" AS date,
            "open_price" AS open,
            "high_price" AS high,
            "low_price"  AS low,
            "close_price" AS close,
            "volume"
        FROM "StockPrice"
        WHERE "stock_symbol" = %s
        ORDER BY "trade_date" ASC;
    """
    with engine.connect() as conn:
        df = pd.read_sql(query, conn, params=[symbol])
    return df


# =========================
# Train cho 1 symbol
# =========================
def train_symbol(symbol: str, horizon: int = 5, model_id: int = 1):
    df = fetch_data(symbol)

    if df.empty or len(df) < 50:
        print(f"⚠️ {symbol}: Not enough data")
        return False

    # Ép kiểu numeric
    for col in ["open", "high", "low", "close", "volume"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Indicators
    df["SMA20"] = ta.sma(df["close"], length=20)
    df["RSI14"] = ta.rsi(df["close"], length=14)

    bbands = ta.bbands(df["close"], length=20, std=2)
    if bbands is None or bbands.empty:
        print(f"⚠️ {symbol}: Bollinger Bands not generated")
        return False

    df = pd.concat([df, bbands], axis=1)
    df.rename(columns={
        "BBL_20_2.0": "BB_lower",
        "BBM_20_2.0": "BB_middle",
        "BBU_20_2.0": "BB_upper"
    }, inplace=True)

    # Label
    df["future_return"] = df["close"].shift(-horizon) / df["close"] - 1
    df["label"] = (df["future_return"] > 0).astype(int)

    df = df.dropna()
    if df.empty:
        print(f"⚠️ {symbol}: Data after indicators is empty")
        return False

    # Features
    features = ["SMA20", "RSI14", "volume", "BB_lower", "BB_middle", "BB_upper"]
    if not all(col in df.columns for col in features):
        print(f"⚠️ {symbol}: Missing Bollinger Band columns")
        return False

    X, y = df[features], df["label"]

    # Train/Test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, shuffle=False, test_size=0.2
    )

    # Train model
    model = XGBClassifier(n_estimators=200, max_depth=5, eval_metric="logloss")
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)

    acc = accuracy_score(y_test, y_pred)
    last_signal = int(y_pred[-1]) if len(y_pred) > 0 else None

    latest_date = df["date"].iloc[-1]
    predicted_price = float(df["close"].iloc[-1])
    actual_price = float(df["close"].iloc[-1])

    # Save to DB
    try:
        with engine.begin() as conn:
            conn.exec_driver_sql(
                """
                INSERT INTO "MLPrediction" 
                (model_id, stock_symbol, prediction_date, predicted_trend, confidence_score,
                 predicted_price, actual_price, input_features, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                """,
                (
                    model_id,
                    symbol,
                    latest_date,
                    "up" if last_signal == 1 else "down",
                    float(acc),
                    predicted_price,
                    actual_price,
                    json.dumps({
                        "SMA20": float(df["SMA20"].iloc[-1]),
                        "RSI14": float(df["RSI14"].iloc[-1]),
                        "volume": float(df["volume"].iloc[-1]),
                        "BB_lower": float(df["BB_lower"].iloc[-1]),
                        "BB_middle": float(df["BB_middle"].iloc[-1]),
                        "BB_upper": float(df["BB_upper"].iloc[-1]),
                    }),
                ),
            )
        print(f"✅ {symbol}: acc={acc:.2f}, trend={'UP' if last_signal==1 else 'DOWN'}")
        return True
    except Exception as e:
        print(f"❌ {symbol}: DB insert error -> {e}")
        return False


# =========================
# Main
# =========================
if __name__ == "__main__":
    symbols = fetch_symbols()
    print(f"Found {len(symbols)} symbols. Training all...")

    success, skipped = 0, 0
    for sym in symbols:
        try:
            ok = train_symbol(sym, horizon=5, model_id=1)
            if ok:
                success += 1
            else:
                skipped += 1
        except Exception as e:
            print(f"❌ {sym}: {e}")
            skipped += 1

    print(f"\n✅ Done! Trained {success} symbols, skipped {skipped}.")
