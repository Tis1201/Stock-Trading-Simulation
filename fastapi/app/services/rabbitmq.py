import aio_pika
import asyncio
from aio_pika.abc import AbstractIncomingMessage
from typing import Optional
import json

RABBITMQ_URL = "amqp://guest:guest@localhost:5672/"

_connection: Optional[aio_pika.RobustConnection] = None
_channel: Optional[aio_pika.RobustChannel] = None
_task: Optional[asyncio.Task] = None

async def consume():
    global _connection, _channel
    _connection = await aio_pika.connect_robust(RABBITMQ_URL)
    _channel = await _connection.channel()

    # Declare exchange & queue
    exchange = await _channel.declare_exchange("backtest.exchange", aio_pika.ExchangeType.TOPIC, durable=True)
    queue = await _channel.declare_queue("backtest.jobs", durable=True)
    await queue.bind(exchange, routing_key="backtest.requested")

    async with queue.iterator() as qiterator:
        async for message in qiterator:  # type: AbstractIncomingMessage
            async with message.process():
                data = message.body.decode()
                print(f"[FastAPI] Received backtest job: {data}")

                # TODO: chạy backtest tại đây...
                result = {"job_id": 1, "status": "COMPLETED"}

                # publish kết quả với JSON hợp lệ
                await exchange.publish(
                    aio_pika.Message(body=json.dumps(result).encode()),
                    routing_key="backtest.completed"
                )
                print("[FastAPI] Sent backtest result:", result)

async def start_consumer():
    global _task
    loop = asyncio.get_event_loop()
    _task = loop.create_task(consume())

async def stop_consumer():
    global _connection, _channel, _task
    if _task:
        _task.cancel()
    if _channel and not _channel.is_closed:
        await _channel.close()
    if _connection and not _connection.is_closed:
        await _connection.close()
    print("[FastAPI] Consumer stopped")
