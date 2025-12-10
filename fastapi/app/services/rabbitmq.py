# app/services/rabbitmq.py
import json
from typing import Optional

from aio_pika import (
    connect_robust,
    IncomingMessage,
    Message,
    ExchangeType,
)

from app.models.backtest_models import BacktestJobMessage
from app.services.backtest_engine import run_backtest

# URL RabbitMQ
RABBITMQ_URL = "amqp://guest:guest@localhost:5672/"

# Tên exchange & routing key PHẢI trùng với NestJS
EXCHANGE_NAME = "backtest.exchange"
REQUEST_ROUTING_KEY = "backtest.requested"
RESULT_ROUTING_KEY = "backtest.completed"

# Tên queue cho job & result
BACKTEST_JOB_QUEUE = "backtest.job"
BACKTEST_RESULT_QUEUE = "backtest.result"

_connection = None
_channel = None
_exchange = None
_consumer_tag: Optional[str] = None


async def start_consumer():
    """
    - Kết nối RabbitMQ
    - Tạo exchange backtest.exchange (topic)
    - Tạo queue backtest.job, bind với routing key backtest.requested
    - Consume job, chạy backtest, publish result lên backtest.exchange (routing key backtest.completed)
    """
    global _connection, _channel, _exchange, _consumer_tag

    if _connection:
        print("[FastAPI] Consumer already started, skip")
        return

    print(f"[FastAPI] Connecting RabbitMQ at {RABBITMQ_URL} ...")
    _connection = await connect_robust(RABBITMQ_URL)
    _channel = await _connection.channel()

    # Khai báo exchange (topic) giống Nest
    _exchange = await _channel.declare_exchange(
        EXCHANGE_NAME, ExchangeType.TOPIC, durable=True
    )

    print(
        f"[FastAPI] Declaring queues & bindings: "
        f"{BACKTEST_JOB_QUEUE} <- ({EXCHANGE_NAME}, {REQUEST_ROUTING_KEY}), "
        f"{BACKTEST_RESULT_QUEUE} (optional)"
    )

    # Job queue: nơi FastAPI sẽ consume
    job_queue = await _channel.declare_queue(BACKTEST_JOB_QUEUE, durable=True)
    # Bind queue với exchange & routing key mà Nest publish
    await job_queue.bind(_exchange, REQUEST_ROUTING_KEY)

    # Result queue: để compatibility, vẫn declare (Nest cũng declare)
    await _channel.declare_queue(BACKTEST_RESULT_QUEUE, durable=True)

    async def on_message(message: IncomingMessage):
        async with message.process():
            try:
                print("[FastAPI] 🔔 Raw message received from backtest.job")
                body = message.body.decode()
                print(f"[FastAPI] Body: {body}")

                payload = json.loads(body)
                print(f"[FastAPI] Parsed JSON keys: {list(payload.keys())}")

                try:
                    job = BacktestJobMessage(**payload)
                    print(f"[FastAPI] BacktestJobMessage parsed: {job}")
                except Exception as e:
                    print(f"[FastAPI] ❌ Failed to parse BacktestJobMessage: {e}")
                    return

                # chạy backtest thực sự
                result_model = run_backtest(job)
                result_dict = result_model.dict()
                print(
                    f"[FastAPI] ✅ Backtest result generated for job {job.job_id} "
                    f"(netProfit={result_dict.get('netProfit')})"
                )

                # Publish kết quả lên exchange với routing key backtest.completed
                await _exchange.publish(
                    Message(
                        body=json.dumps(result_dict).encode(),
                        content_type="application/json",
                    ),
                    routing_key=RESULT_ROUTING_KEY,
                )

                print(
                    f"[FastAPI] 📤 Sent backtest result to exchange '{EXCHANGE_NAME}' "
                    f"with routing key '{RESULT_ROUTING_KEY}'"
                )

            except Exception as e:
                print(f"[FastAPI] ❌ Error while processing message: {e}")

    print(f"[FastAPI] ▶ Start consuming from queue '{BACKTEST_JOB_QUEUE}'")
    _consumer_tag = await job_queue.consume(on_message)
    print("[FastAPI] Backtest consumer started")


async def stop_consumer():
    global _connection, _channel, _exchange, _consumer_tag

    if _channel and _consumer_tag:
        await _channel.cancel(_consumer_tag)

    if _connection:
        await _connection.close()

    _connection = None
    _channel = None
    _exchange = None
    _consumer_tag = None
    print("[FastAPI] Backtest consumer stopped")
