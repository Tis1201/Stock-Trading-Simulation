from concurrent.futures import ThreadPoolExecutor, as_completed
import pandas as pd, pandas_ta as ta, json, os, random, numpy as np
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score
from sqlalchemy import create_engine

random.seed(42)
np.random.seed(42)

DB_URL = "postgresql+psycopg2://postgres:hoaivu388@localhost:5432/sts"
engine = create_engine(DB_URL)
CACHE_DIR = "cache"; os.makedirs(CACHE_DIR, exist_ok=True)

def fetch_symbols():
    with engine.connect() as conn:
        df = pd.read_sql('SELECT DISTINCT "symbol" FROM "Stock" ORDER BY "symbol";', conn)
    return df["symbol"].tolist()

def fetch_data(symbol):
    cache_path = f"{CACHE_DIR}/{symbol}.parquet"
    if os.path.exists(cache_path):
        return pd.read_parquet(cache_path)
    q = '''SELECT "trade_date" AS date, "open_price" AS open, "high_price" AS high,
                  "low_price" AS low, "close_price" AS close, "volume"
           FROM "StockPrice" WHERE "stock_symbol"=%s ORDER BY "trade_date";'''
    with engine.connect() as conn:
        df = pd.read_sql(q, conn, params=[symbol])
    df.to_parquet(cache_path)
    return df

def train_symbol(symbol):
    df = fetch_data(symbol)
    if len(df) < 50: return False
    df = df.assign(
        SMA20=ta.sma(df["close"],20),
        RSI14=ta.rsi(df["close"],14),
        EMA20=ta.ema(df["close"],20),
        ATR14=ta.atr(df["high"],df["low"],df["close"],14),
    )
    bb = ta.bbands(df["close"],20,2)
    if bb is None or bb.empty: return False
    df = pd.concat([df,bb],axis=1).dropna()
    df.rename(columns={"BBL_20_2.0":"BB_lower","BBM_20_2.0":"BB_middle","BBU_20_2.0":"BB_upper"},inplace=True)
    df["future_return"]=df["close"].shift(-5)/df["close"]-1
    df["label"]=(df["future_return"]>0).astype(int)
    features=["SMA20","RSI14","EMA20","ATR14","volume","BB_lower","BB_middle","BB_upper"]
    df=df.dropna(subset=features+["label"])
    X,y=df[features],df["label"]
    X_train,X_test,y_train,y_test=train_test_split(X,y,shuffle=False,test_size=0.2)
    scaler=StandardScaler(); X_train=scaler.fit_transform(X_train); X_test=scaler.transform(X_test)
    model=XGBClassifier(n_estimators=200,max_depth=5,eval_metric="logloss")
    model.fit(X_train,y_train); y_pred=model.predict(X_test)
    acc=accuracy_score(y_test,y_pred); trend="up" if y_pred[-1]==1 else "down"
    with engine.begin() as conn:
        conn.exec_driver_sql("""
            INSERT INTO "MLPrediction"
            (model_id, stock_symbol, prediction_date, predicted_trend, confidence_score,
             predicted_price, actual_price, input_features, created_at)
            VALUES (1,%s,%s,%s,%s,%s,%s,%s,NOW())
            ON CONFLICT (model_id,stock_symbol,prediction_date)
            DO UPDATE SET predicted_trend=EXCLUDED.predicted_trend, confidence_score=EXCLUDED.confidence_score, updated_at=NOW();
        """,(symbol,df["date"].iloc[-1],trend,float(acc),
             float(df["close"].iloc[-1]),float(df["close"].iloc[-1]),
             json.dumps(df[features].iloc[-1].to_dict())))
    print(f"✅ {symbol}: acc={acc:.2f}, trend={trend.upper()}")
    return True

if __name__=="__main__":
    symbols=fetch_symbols()
    with ThreadPoolExecutor(max_workers=4) as ex:
        results=list(ex.map(train_symbol,symbols))
    print(f"Done. {sum(results)} success, {len(symbols)-sum(results)} skipped.")
