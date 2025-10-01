from fastapi import APIRouter
from app.models.mq_message import MQMessage
import aio_pika

router = APIRouter()

RABBITMQ_URL = "amqp://guest:guest@localhost/"
QUEUE_NAME = "test_queue"

@router.post("/send")
async def send_message(msg: MQMessage):
    connection = await aio_pika.connect_robust(RABBITMQ_URL)
    channel = await connection.channel()
    await channel.default_exchange.publish(
        aio_pika.Message(body=msg.text.encode()),
        routing_key=QUEUE_NAME
    )
    await connection.close()
    return {"status": "sent", "message": msg.text}
