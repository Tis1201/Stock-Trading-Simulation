from fastapi import FastAPI
from app.api import mq_test
from app.services import rabbitmq

app = FastAPI(title="FastAPI MQ test")

app.include_router(mq_test.router, prefix="/mq", tags=["mq"])

@app.on_event("startup")
async def startup_event():
    await rabbitmq.start_consumer()   # khởi động consumer

@app.on_event("shutdown")
async def shutdown_event():
    await rabbitmq.stop_consumer()    # đóng channel & connection
