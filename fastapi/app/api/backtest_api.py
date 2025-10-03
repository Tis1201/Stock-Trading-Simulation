from fastapi import APIRouter, Query
from app.services.technical_agent import run_and_save_prediction

router = APIRouter()

@router.get("/technical")
def run_agent(
    symbol: str = Query(..., description="Stock symbol, ví dụ: VNM.VN"),
    horizon: int = Query(5, description="Số ngày horizon để dự đoán"),
    model_id: int = Query(1, description="ID của model trong bảng MLModel")
):
    """
    Train mô hình XGBoost trên dữ liệu lịch sử,
    tính SMA20 + RSI14, dự đoán xu hướng,
    và lưu kết quả vào bảng MLPrediction.
    """
    result = run_and_save_prediction(symbol, horizon, model_id)
    return {"symbol": symbol, "horizon": horizon, "result": result}
