import aio_pika
import asyncio
from aio_pika.abc import AbstractIncomingMessage
from typing import Optional

QUEUE_NAME = "test"
RABBITMQ_URL = "amqp://guest:guest@localhost:5672/"

_connection: Optional[aio_pika.RobustConnection] = None
_channel: Optional[aio_pika.RobustChannel] = None
_task: Optional[asyncio.Task] = None

async def consume():
    global _connection, _channel
    _connection = await aio_pika.connect_robust(RABBITMQ_URL)
    _channel = await _connection.channel()
    queue = await _channel.declare_queue(QUEUE_NAME, durable=True)

    async with queue.iterator() as qiterator:
        async for message in qiterator:  # type: AbstractIncomingMessage
            async with message.process():
                print(f"[FastAPI] Received: {message.body.decode()}")

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
