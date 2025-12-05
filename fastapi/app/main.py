# app/main.py
from fastapi import FastAPI
from contextlib import asynccontextmanager

from app.api import mq_test, backtest_api
from app.services import rabbitmq

# ✅ THÊM: import CORS
from fastapi.middleware.cors import CORSMiddleware

# Sử dụng lifespan thay vì on_event (cách mới)
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await rabbitmq.start_consumer()
    yield
    # Shutdown
    await rabbitmq.stop_consumer()

app = FastAPI(title="FastAPI MQ test", lifespan=lifespan)

# ✅ THÊM: CORS middleware
origins = [
    "http://localhost:5173",    # Vite mặc định
    "http://127.0.0.1:5173",
    "http://localhost:3000",    # <--- THÊM DÒNG NÀY (Đây là nơi FE của bạn đang chạy)
    "http://127.0.0.1:3000",    # Thêm cả IP này cho chắc chắn
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,          # hoặc ["*"] nếu đang dev
    allow_credentials=True,
    allow_methods=["*"],            # cho phép GET, POST, OPTIONS, ...
    allow_headers=["*"],            # cho phép mọi header
)

# ✅ NHỚ include router market (router chứa /market/{symbol}, /market/{symbol}/next, /market/orders)
from app.api import market_simulation  # nếu file bạn đặt tên khác thì đổi cho đúng

app.include_router(mq_test.router, prefix="/mq", tags=["mq"])
app.include_router(backtest_api.router, prefix="/backtest", tags=["Backtest"])
app.include_router(market_simulation.router, prefix="/market", tags=["Market"])  # <== quan trọng

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",  # Import string thay vì object
        host="0.0.0.0",
        port=8000,
        reload=True
    )
