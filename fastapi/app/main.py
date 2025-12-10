# app/main.py
import os
from pathlib import Path
from dotenv import load_dotenv

# ============================================================
# 1) QUAN TRỌNG: Load .env TRƯỚC KHI import các module khác
# ============================================================

# Thư mục gốc fastapi (cha của app/)
# Cấu trúc: fastapi/app/main.py -> parent = app -> parent.parent = fastapi
ROOT_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT_DIR / ".env"

# Load biến môi trường ngay lập tức
load_dotenv(dotenv_path=ENV_PATH)

# Kiểm tra log ngay lúc này để chắc chắn
print("--------------------------------------------------")
print("[FastAPI] Loading .env from:", ENV_PATH)
db_url = os.getenv("PY_DATABASE_URL") or os.getenv("DATABASE_URL")
print("[FastAPI] DATABASE_URL loaded:", db_url)
if not db_url:
    print("[FastAPI] ⚠️  WARNING: DATABASE_URL is None! App will crash on next import.")
print("--------------------------------------------------")

# ============================================================
# 2) SAU ĐÓ MỚI IMPORT CÁC MODULE CỦA APP
# ============================================================
# (Vì các file này cần biến môi trường đã được load ở trên)

from fastapi import FastAPI
from contextlib import asynccontextmanager
from fastapi.middleware.cors import CORSMiddleware

# Các file này sẽ import backtest_engine, lúc này Env đã có dữ liệu -> OK
from app.api import mq_test, backtest_api
from app.api import market_simulation
from app.services import rabbitmq

# ============================================================
# 3) Lifespan: start / stop RabbitMQ consumer
# ============================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("[FastAPI] Starting RabbitMQ consumer...")
    await rabbitmq.start_consumer()
    yield
    # Shutdown
    print("[FastAPI] Stopping RabbitMQ consumer...")
    await rabbitmq.stop_consumer()

app = FastAPI(title="FastAPI MQ test", lifespan=lifespan)

# ============================================================
# 4) CORS cho FE
# ============================================================

origins = [
    "http://localhost:5173",    # Vite
    "http://127.0.0.1:5173",
    "http://localhost:3000",    # FE React / Next
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,          # hoặc ["*"] nếu đang dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# 5) Đăng ký router
# ============================================================

app.include_router(mq_test.router, prefix="/mq", tags=["mq"])
app.include_router(backtest_api.router, prefix="/backtest", tags=["Backtest"])
app.include_router(market_simulation.router, prefix="/market", tags=["Market"])

# Optional: health check cho dễ test
@app.get("/")
def root():
  return {"status": "ok", "message": "FastAPI backtest service running"}

# ============================================================
# 6) Run trực tiếp
# ============================================================

if __name__ == "__main__":
    import uvicorn
    # Lưu ý: Khi chạy bằng file main.py trực tiếp, 'app.main:app' có thể gây lỗi import vòng
    # Tốt nhất nên chạy bằng lệnh terminal: uvicorn app.main:app --reload
    uvicorn.run(
        app, # Truyền trực tiếp object app thay vì string để tránh lỗi path khi chạy file này
        host="0.0.0.0",
        port=8000,
        # reload=True # Reload không hoạt động tốt khi truyền object app trực tiếp, bỏ qua nếu chạy debug
    )