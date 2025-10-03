import json
import pandas as pd
import psycopg2
import pandas_ta as ta
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score


def fetch_data(symbol: str):
    conn = psycopg2.connect("dbname=sts user=postgres password=hoaivu388 host=localhost")
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
    df = pd.read_sql(query, conn, params=[symbol])
    conn.close()
    return df


def run_and_save_prediction(symbol: str, horizon: int = 5, model_id: int = 1):
    df = fetch_data(symbol)

    # Indicators
    df["SMA20"] = ta.sma(df["close"], length=20)
    df["RSI14"] = ta.rsi(df["close"], length=14)

    # Label
    df["future_return"] = df["close"].shift(-horizon) / df["close"] - 1
    df["label"] = (df["future_return"] > 0).astype(int)

    features = ["SMA20", "RSI14", "volume"]
    df = df.dropna()

    if df.empty:
        return {"error": "Not enough data for training"}

    # Train/test split
    X, y = df[features], df["label"]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, shuffle=False, test_size=0.2
    )

    model = XGBClassifier(
        n_estimators=200, max_depth=5,
        use_label_encoder=False, eval_metric="logloss"
    )
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)

    acc = accuracy_score(y_test, y_pred)
    last_signal = int(y_pred[-1]) if len(y_pred) > 0 else None
    latest_date = df["date"].iloc[-1]

    predicted_trend = "up" if last_signal == 1 else "down"

    # 📝 Insert vào DB
    conn = psycopg2.connect("dbname=sts user=postgres password=hoaivu388 host=localhost")
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO "MLPrediction" 
        (model_id, stock_symbol, prediction_date, predicted_trend, confidence_score, input_features, created_at) 
        VALUES (%s, %s, %s, %s, %s, %s, NOW())
        """,
        (
            model_id,
            symbol,
            latest_date,
            predicted_trend,
            round(acc, 4),  # coi accuracy như confidence
            json.dumps({
                "SMA20": float(df["SMA20"].iloc[-1]),
                "RSI14": float(df["RSI14"].iloc[-1]),
                "volume": int(df["volume"].iloc[-1])
            })
        ),
    )

    conn.commit()
    cur.close()
    conn.close()

    return {
        "symbol": symbol,
        "accuracy": float(acc),
        "last_signal": last_signal,
        "trend": predicted_trend,
        "latest_date": str(latest_date)
    }
